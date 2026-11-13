'use strict';

const C = require('../config/rr');
const { HttpError } = require('../errors');
const { withTx, advisoryLock } = require('./tx');
const { scoreAnswer } = require('./drillScoring');
const {
  assignQuestions, loadAttemptQuestionIds, loadQuestionPayload,
} = require('./attemptQuestions');
const { prepareSubmission, finishAttempt, insertAnswerHistory } = require('./drillSubmitService');

/** Domain 0 dianggap lulus: ada attempt 'domain0' selesai tanpa salah dan semua soal terjawab benar. */
async function hasPassedDomain0(client, studentId, curriculumGroupId) {
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM student_attempts
        WHERE student_id = $1::uuid AND curriculum_group_id = $2
          AND mode = 'domain0' AND status = 'selesai'
          AND jumlah_salah = 0 AND jumlah_benar >= jumlah_soal
     ) AS ok`,
    [studentId, curriculumGroupId],
  );
  return rows[0].ok;
}

async function assertCurriculum(client, curriculumGroupId) {
  const { rows } = await client.query(
    `SELECT id FROM curriculum_groups WHERE id = $1 AND is_active`,
    [curriculumGroupId],
  );
  if (!rows.length) throw new HttpError(404, 'KURIKULUM_TIDAK_DITEMUKAN', 'Kurikulum tidak ditemukan');
}

/**
 * POST /api/domain0/start
 * Membuat tes izin matematika. Jika ada sesi Domain 0 yang belum selesai, sesi itu dilanjutkan
 * (mencegah membuka banyak sesi sekaligus lalu memilih yang lulus).
 */
function startDomain0(pool, studentId, { curriculumGroupId }) {
  return withTx(pool, async (client) => {
    await advisoryLock(client, `${studentId}:domain0:${curriculumGroupId}`);
    await assertCurriculum(client, curriculumGroupId);

    if (await hasPassedDomain0(client, studentId, curriculumGroupId)) {
      throw new HttpError(409, 'DOMAIN0_SUDAH_LULUS', 'Domain 0 sudah lulus');
    }

    // Lanjutkan sesi yang masih berjalan
    const open = await client.query(
      `SELECT id, started_at FROM student_attempts
        WHERE student_id = $1::uuid AND curriculum_group_id = $2
          AND mode = 'domain0' AND status = 'berlangsung'
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

    // Cooldown gagal Domain 0 (berlaku untuk semua topik matematika di kurikulum ini)
    const cd = await client.query(
      `SELECT max(tm.cooldown_until) AS sampai
         FROM student_topic_mastery tm
         JOIN topics t   ON t.id = tm.topic_id
         JOIN subjects s ON s.id = t.subject_id
        WHERE tm.student_id = $1::uuid AND s.curriculum_group_id = $2
          AND t.requires_domain0 AND tm.cooldown_until > now()`,
      [studentId, curriculumGroupId],
    );
    if (cd.rows[0].sampai) {
      throw new HttpError(423, 'DOMAIN0_COOLDOWN', 'Domain 0 sedang cooldown',
        { cooldown_until: cd.rows[0].sampai });
    }

    // Soal tersebar merata antar topik matematika
    const { rows } = await client.query(
      `SELECT question_id FROM (
         SELECT q.id AS question_id,
                row_number() OVER (PARTITION BY q.topic_id ORDER BY random()) AS rn
           FROM questions q
           JOIN topics t   ON t.id = q.topic_id
           JOIN subjects s ON s.id = t.subject_id
          WHERE q.is_active AND q.is_domain0 AND t.is_active AND t.requires_domain0
            AND s.curriculum_group_id = $1
       ) z
       ORDER BY rn, random()
       LIMIT $2`,
      [curriculumGroupId, C.DOMAIN0_JUMLAH_SOAL],
    );
    if (!rows.length) {
      throw new HttpError(422, 'SOAL_DOMAIN0_KOSONG', 'Belum ada soal Domain 0 yang tersedia');
    }
    const ids = rows.map((r) => r.question_id);

    const ins = await client.query(
      `INSERT INTO student_attempts (student_id, subject_id, curriculum_group_id, mode, jumlah_soal)
       VALUES ($1::uuid, NULL, $2, 'domain0', $3)
       RETURNING id, started_at`,
      [studentId, curriculumGroupId, ids.length],
    );
    await assignQuestions(client, ins.rows[0].id, ids);

    return {
      attempt_id: ins.rows[0].id,
      melanjutkan: false,
      started_at: ins.rows[0].started_at,
      jumlah_soal: ids.length,
      soal: await loadQuestionPayload(client, ids),
    };
  });
}

/**
 * POST /api/domain0/submit
 * Lulus = SEMUA soal sesi dijawab benar. Gagal = cooldown 10 menit pada semua topik matematika.
 */
function submitDomain0(pool, studentId, payload) {
  return withTx(pool, async (client) => {
    const { attempt, scored, totalDurasi } = await prepareSubmission(client, studentId, payload, ['domain0']);

    const resultByUrutan = new Map(scored.map((a) => [a.urutan, {
      rrDelta: 0,
      isSpeedBonus: false,
      isFlaggedGuess: scoreAnswer(a).isFlaggedGuess,
    }]));
    await insertAnswerHistory(client, payload.attemptId, studentId, scored, resultByUrutan);
    const fin = await finishAttempt(client, { attemptId: payload.attemptId, scored, totalDurasi });

    const lulus = fin.jumlahSalah === 0 && fin.jumlahBenar >= attempt.jumlah_soal;

    let cooldownUntil = null;
    let topikTerkunci = 0;
    if (!lulus) {
      const { rows } = await client.query(
        `INSERT INTO student_topic_mastery (student_id, topic_id, cooldown_until)
         SELECT $1::uuid, t.id, now() + make_interval(mins => $3::int)
           FROM topics t JOIN subjects s ON s.id = t.subject_id
          WHERE s.curriculum_group_id = $2 AND t.requires_domain0 AND t.is_active
         ON CONFLICT (student_id, topic_id) DO UPDATE
           SET cooldown_until = GREATEST(
                 COALESCE(student_topic_mastery.cooldown_until, '-infinity'::timestamptz),
                 EXCLUDED.cooldown_until)
         RETURNING cooldown_until`,
        [studentId, attempt.curriculum_group_id, C.COOLDOWN_MINUTES],
      );
      topikTerkunci = rows.length;
      cooldownUntil = rows.reduce((m, r) => (!m || r.cooldown_until > m ? r.cooldown_until : m), null);
    }

    return {
      attempt_id: payload.attemptId,
      status: 'selesai',
      lulus,
      jumlah_benar: fin.jumlahBenar,
      jumlah_soal: attempt.jumlah_soal,
      cooldown_until: cooldownUntil,
      topik_terkunci: topikTerkunci,
      hasil: scored.map((a) => ({ urutan: a.urutan, question_id: a.questionId, is_correct: a.isCorrect })),
    };
  });
}

module.exports = { startDomain0, submitDomain0, hasPassedDomain0, assertCurriculum };
