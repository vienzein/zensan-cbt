'use strict';

const C = require('../config/rr');
const { HttpError } = require('../errors');
const { withTx, advisoryLock } = require('./tx');
const { scoreAnswer } = require('./drillScoring');
const { calibrateSubtopics, composeCalibration } = require('./calibration');
const { hasPassedDomain0, assertCurriculum } = require('./domain0Service');
const {
  assignQuestions, loadAttemptQuestionIds, loadQuestionPayload,
} = require('./attemptQuestions');
const {
  prepareSubmission, finishAttempt, insertAnswerHistory, insertMasteryLogs,
} = require('./drillSubmitService');

/**
 * POST /api/tryout/kalibrasi/start
 * Hanya sekali per siswa per kurikulum, dan setelah Domain 0 lulus (jika kurikulum punya topik matematika).
 */
function startCalibration(pool, studentId, { curriculumGroupId }) {
  return withTx(pool, async (client) => {
    await advisoryLock(client, `${studentId}:kalibrasi:${curriculumGroupId}`);
    await assertCurriculum(client, curriculumGroupId);

    const prev = await client.query(
      `SELECT id, status, started_at FROM student_attempts
        WHERE student_id = $1::uuid AND curriculum_group_id = $2
          AND mode = 'tryout_kalibrasi' AND status IN ('berlangsung', 'selesai')
        ORDER BY started_at DESC`,
      [studentId, curriculumGroupId],
    );
    if (prev.rows.some((r) => r.status === 'selesai')) {
      throw new HttpError(409, 'KALIBRASI_SUDAH_DILAKUKAN', 'Tryout kalibrasi hanya bisa dilakukan sekali');
    }
    const open = prev.rows.find((r) => r.status === 'berlangsung');
    if (open) {
      const ids = await loadAttemptQuestionIds(client, open.id);
      return {
        attempt_id: open.id,
        melanjutkan: true,
        started_at: open.started_at,
        jumlah_soal: ids.length,
        soal: await loadQuestionPayload(client, ids),
      };
    }

    // Gerbang Domain 0
    const math = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM topics t JOIN subjects s ON s.id = t.subject_id
          WHERE s.curriculum_group_id = $1 AND t.requires_domain0 AND t.is_active) AS ada`,
      [curriculumGroupId],
    );
    if (math.rows[0].ada && !(await hasPassedDomain0(client, studentId, curriculumGroupId))) {
      throw new HttpError(403, 'DOMAIN0_BELUM_LULUS', 'Lulus Domain 0 dulu sebelum tryout kalibrasi');
    }

    // Kandidat: maksimal 3 soal per (subtopik, level) agar ringan
    const { rows } = await client.query(
      `SELECT subtopic_id, level_soal, question_id FROM (
         SELECT qs.subtopic_id, q.level_soal, q.id AS question_id,
                row_number() OVER (PARTITION BY qs.subtopic_id, q.level_soal ORDER BY random()) AS rn
           FROM questions q
           JOIN question_subtopics qs ON qs.question_id = q.id
           JOIN subtopics st ON st.id = qs.subtopic_id
           JOIN topics t     ON t.id = st.topic_id
           JOIN subjects s   ON s.id = t.subject_id
          WHERE q.is_active AND st.is_active AND t.is_active AND s.is_active
            AND s.curriculum_group_id = $1
            AND q.level_soal BETWEEN 1 AND 3
       ) z
       WHERE rn <= 3`,
      [curriculumGroupId],
    );

    const ids = composeCalibration({
      candidates: rows.map((r) => ({
        subtopicId: r.subtopic_id, level: r.level_soal, questionId: r.question_id,
      })),
      maxSoal: C.CALIBRATION_MAX_SOAL,
    });
    if (!ids.length) {
      throw new HttpError(422, 'SOAL_KALIBRASI_KOSONG', 'Belum ada soal untuk tryout kalibrasi');
    }

    const ins = await client.query(
      `INSERT INTO student_attempts (student_id, subject_id, curriculum_group_id, mode, jumlah_soal)
       VALUES ($1::uuid, NULL, $2, 'tryout_kalibrasi', $3)
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
 * POST /api/tryout/kalibrasi/submit
 * Menetapkan level awal subtopik. Hanya subtopik yang belum terkalibrasi DAN belum pernah
 * dijawab di drill ranked yang diubah, supaya progres yang sudah ada tidak tertimpa.
 */
function submitCalibration(pool, studentId, payload) {
  return withTx(pool, async (client) => {
    const { scored, totalDurasi } = await prepareSubmission(client, studentId, payload, ['tryout_kalibrasi']);

    const cal = calibrateSubtopics(scored);
    const subtopicIds = [...cal.keys()];

    // Kunci baris mastery
    let locked = [];
    if (subtopicIds.length) {
      await client.query(
        `INSERT INTO student_mastery (student_id, subtopic_id)
         SELECT $1::uuid, s FROM unnest($2::bigint[]) AS s
         ON CONFLICT DO NOTHING`,
        [studentId, subtopicIds],
      );
      const res = await client.query(
        `SELECT subtopic_id, current_level, rank_rating, is_calibrated, last_answered_at
           FROM student_mastery
          WHERE student_id = $1 AND subtopic_id = ANY($2::bigint[])
          ORDER BY subtopic_id
            FOR UPDATE`,
        [studentId, subtopicIds],
      );
      locked = res.rows;
    }
    const eligible = locked.filter((r) => !r.is_calibrated && r.last_answered_at === null);
    const eligibleIds = new Set(eligible.map((r) => r.subtopic_id));

    // Riwayat jawaban
    const resultByUrutan = new Map(scored.map((a) => [a.urutan, {
      rrDelta: 0,
      isSpeedBonus: false,
      isFlaggedGuess: scoreAnswer(a).isFlaggedGuess,
    }]));
    const answerIdByUrutan = await insertAnswerHistory(
      client, payload.attemptId, studentId, scored, resultByUrutan,
    );

    // Terapkan level awal
    let topikL3Terbuka = [];
    if (eligible.length) {
      const rowById = new Map(eligible.map((r) => [r.subtopic_id, r]));
      await client.query(
        `UPDATE student_mastery sm
            SET current_level = u.lvl, rank_rating = u.rr, strike_count = 0,
                is_calibrated = TRUE, last_answered_at = now()
           FROM unnest($2::bigint[], $3::smallint[], $4::smallint[]) AS u(subtopic_id, lvl, rr)
          WHERE sm.student_id = $1::uuid AND sm.subtopic_id = u.subtopic_id`,
        [
          studentId,
          eligible.map((r) => r.subtopic_id),
          eligible.map((r) => cal.get(r.subtopic_id).level),
          eligible.map((r) => cal.get(r.subtopic_id).rr),
        ],
      );

      await insertMasteryLogs(client, studentId, eligible.map((r) => {
        const c = cal.get(r.subtopic_id);
        const before = rowById.get(r.subtopic_id);
        return {
          urutan: c.lastUrutan,
          subtopicId: r.subtopic_id,
          topicId: c.topicId,
          levelBefore: before.current_level,
          levelAfter: c.level,
          rrBefore: before.rank_rating,
          rrAfter: c.rr,
          strikeAfter: 0,
        };
      }), answerIdByUrutan);

      // Buka Level 3 topik bila >= 50% subtopiknya kini Level 2+ (Elite TIDAK diberikan di sini)
      const topicIds = [...new Set(eligible.map((r) => cal.get(r.subtopic_id).topicId))];
      const unlocked = await client.query(
        `INSERT INTO student_topic_mastery (student_id, topic_id, level3_unlocked)
         SELECT $1::uuid, st.topic_id, TRUE
           FROM subtopics st
      LEFT JOIN student_mastery sm
             ON sm.student_id = $1::uuid AND sm.subtopic_id = st.id
          WHERE st.topic_id = ANY($2::bigint[]) AND st.is_active
          GROUP BY st.topic_id
         HAVING (count(*) FILTER (WHERE COALESCE(sm.current_level, 1) >= 2))::float8
                >= count(*)::float8 * $3::float8
         ON CONFLICT (student_id, topic_id) DO UPDATE SET level3_unlocked = TRUE
         RETURNING topic_id`,
        [studentId, topicIds, C.LEVEL3_UNLOCK_RATIO],
      );
      topikL3Terbuka = unlocked.rows.map((r) => r.topic_id);
    }

    const fin = await finishAttempt(client, { attemptId: payload.attemptId, scored, totalDurasi });

    return {
      attempt_id: payload.attemptId,
      status: 'selesai',
      ringkasan: {
        jumlah_dijawab: scored.length,
        jumlah_benar: fin.jumlahBenar,
        jumlah_salah: fin.jumlahSalah,
        total_durasi_detik: fin.totalDurasiInt,
      },
      kalibrasi: subtopicIds.map((sid) => ({
        subtopic_id: sid,
        level: cal.get(sid).level,
        rr: cal.get(sid).rr,
        diterapkan: eligibleIds.has(sid),
      })),
      topik_level3_terbuka: topikL3Terbuka,
    };
  });
}

module.exports = { startCalibration, submitCalibration };
