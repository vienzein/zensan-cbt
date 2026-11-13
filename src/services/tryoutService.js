'use strict';

const C = require('../config/rr');
const { HttpError } = require('../errors');
const { withTx, advisoryLock } = require('./tx');
const { scoreAnswer } = require('./drillScoring');
const { summarizeTryout } = require('./tryoutScoring');
const { hasPassedDomain0, assertCurriculum } = require('./domain0Service');
const {
  assignQuestions, loadAttemptQuestionIds, loadQuestionPayload,
} = require('./attemptQuestions');
const { prepareSubmission, finishAttempt, insertAnswerHistory } = require('./drillSubmitService');

/**
 * POST /api/tryout/start
 * Tryout reguler pay-per-use: memakai SATU hak tryout (student_tryout_entitlements).
 * Sesi yang belum selesai dilanjutkan tanpa memakai hak baru.
 */
function startTryout(pool, studentId, { curriculumGroupId }) {
  return withTx(pool, async (client) => {
    await advisoryLock(client, `${studentId}:tryout:${curriculumGroupId}`);
    await assertCurriculum(client, curriculumGroupId);

    // Lanjutkan sesi yang masih berjalan (hak sudah terpakai)
    const open = await client.query(
      `SELECT id, started_at FROM student_attempts
        WHERE student_id = $1::uuid AND curriculum_group_id = $2
          AND mode = 'tryout' AND status = 'berlangsung'
        ORDER BY started_at DESC LIMIT 1`,
      [studentId, curriculumGroupId],
    );
    if (open.rows.length) {
      const ids = await loadAttemptQuestionIds(client, open.rows[0].id);
      return {
        attempt_id: open.rows[0].id,
        melanjutkan: true,
        started_at: open.rows[0].started_at,
        jumlah_soal: ids.length,
        soal: await loadQuestionPayload(client, ids),
      };
    }

    // Gerbang Domain 0 untuk kurikulum yang punya topik matematika
    const math = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM topics t JOIN subjects s ON s.id = t.subject_id
          WHERE s.curriculum_group_id = $1 AND t.requires_domain0 AND t.is_active) AS ada`,
      [curriculumGroupId],
    );
    if (math.rows[0].ada && !(await hasPassedDomain0(client, studentId, curriculumGroupId))) {
      throw new HttpError(403, 'DOMAIN0_BELUM_LULUS', 'Lulus Domain 0 dulu sebelum tryout');
    }

    // Pakai satu hak tryout. Jika langkah berikutnya gagal, ROLLBACK mengembalikan hak ini.
    const ent = await client.query(
      `UPDATE student_tryout_entitlements
          SET status = 'terpakai', used_at = now()
        WHERE id = (SELECT id FROM student_tryout_entitlements
                     WHERE student_id = $1::uuid AND status = 'tersedia'
                     ORDER BY id LIMIT 1
                       FOR UPDATE SKIP LOCKED)
        RETURNING id`,
      [studentId],
    );
    if (!ent.rows.length) {
      throw new HttpError(402, 'TRYOUT_BELUM_DIBAYAR', 'Belum ada hak tryout. Beli tryout terlebih dahulu.');
    }

    // Soal per subtes: tersebar antar topik, soal yang belum pernah muncul di tryout didahulukan
    const { rows } = await client.query(
      `SELECT subject_id, subject_urutan, question_id FROM (
         SELECT subject_id, subject_urutan, question_id,
                row_number() OVER (PARTITION BY subject_id ORDER BY rn_topik, random()) AS rn_subtes
           FROM (
             SELECT t.subject_id, s.urutan AS subject_urutan, q.id AS question_id,
                    row_number() OVER (
                      PARTITION BY q.topic_id
                      ORDER BY EXISTS (SELECT 1
                                         FROM student_answer_history h
                                         JOIN student_attempts a ON a.id = h.attempt_id
                                        WHERE h.student_id = $2::uuid AND h.question_id = q.id
                                          AND a.mode = 'tryout'),
                               random()) AS rn_topik
               FROM questions q
               JOIN topics t   ON t.id = q.topic_id
               JOIN subjects s ON s.id = t.subject_id
              WHERE q.is_active AND NOT q.is_domain0 AND q.level_soal BETWEEN 1 AND 3
                AND t.is_active AND s.is_active AND s.curriculum_group_id = $1
           ) a
       ) b
       WHERE rn_subtes <= $3
       ORDER BY subject_urutan, rn_subtes`,
      [curriculumGroupId, studentId, C.TRYOUT_SOAL_PER_SUBTES],
    );
    if (!rows.length) {
      throw new HttpError(422, 'SOAL_TRYOUT_KOSONG', 'Belum ada soal untuk tryout');
    }
    const ids = rows.map((r) => r.question_id);

    const ins = await client.query(
      `INSERT INTO student_attempts (student_id, subject_id, curriculum_group_id, mode, jumlah_soal)
       VALUES ($1::uuid, NULL, $2, 'tryout', $3)
       RETURNING id, started_at`,
      [studentId, curriculumGroupId, ids.length],
    );
    const attemptId = ins.rows[0].id;
    await assignQuestions(client, attemptId, ids);
    await client.query(
      `UPDATE student_tryout_entitlements SET attempt_id = $2 WHERE id = $1`,
      [ent.rows[0].id, attemptId],
    );

    return {
      attempt_id: attemptId,
      melanjutkan: false,
      started_at: ins.rows[0].started_at,
      jumlah_soal: ids.length,
      soal: await loadQuestionPayload(client, ids),
    };
  });
}

/**
 * POST /api/tryout/submit
 * Menilai tryout dan mengembalikan skor per subtes/topik. Tidak mengubah RR.
 */
function submitTryout(pool, studentId, payload) {
  return withTx(pool, async (client) => {
    const { scored, totalDurasi } = await prepareSubmission(client, studentId, payload, ['tryout']);

    const resultByUrutan = new Map(scored.map((a) => [a.urutan, {
      rrDelta: 0,
      isSpeedBonus: false,
      isFlaggedGuess: scoreAnswer(a).isFlaggedGuess,
    }]));
    await insertAnswerHistory(client, payload.attemptId, studentId, scored, resultByUrutan);
    const fin = await finishAttempt(client, { attemptId: payload.attemptId, scored, totalDurasi });

    // Pemetaan topik -> subtes dan total soal sesi per subtes
    const tot = await client.query(
      `SELECT t.subject_id, count(*)::int AS total
         FROM student_attempt_questions aq
         JOIN questions q ON q.id = aq.question_id
         JOIN topics t    ON t.id = q.topic_id
        WHERE aq.attempt_id = $1
        GROUP BY t.subject_id`,
      [payload.attemptId],
    );
    const topicIds = [...new Set(scored.map((a) => a.topicId))];
    const tp = topicIds.length
      ? await client.query(`SELECT id, subject_id FROM topics WHERE id = ANY($1::bigint[])`, [topicIds])
      : { rows: [] };

    const summary = summarizeTryout({
      scored,
      subjectOfTopic: new Map(tp.rows.map((r) => [r.id, r.subject_id])),
      totalBySubject: new Map(tot.rows.map((r) => [r.subject_id, r.total])),
    });

    return {
      attempt_id: payload.attemptId,
      status: 'selesai',
      ringkasan: {
        jumlah_dijawab: scored.length,
        jumlah_benar: fin.jumlahBenar,
        jumlah_salah: fin.jumlahSalah,
        total_durasi_detik: fin.totalDurasiInt,
      },
      ...summary,
    };
  });
}

module.exports = { startTryout, submitTryout };
