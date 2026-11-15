'use strict';

const C = require('../config/rr');
const { HttpError } = require('../errors');
const { withTx } = require('./tx');
const { calculateSessionRR, scoreAnswer } = require('./drillScoring');
const {
  buildScored, loadLockedAnswers, lockAttempt, lockMasteryState,
} = require('./drillSubmitService');

const RANKED_MODE = 'drill_ranked';
const DRILL_MODES = [RANKED_MODE, 'drill_free'];

/**
 * POST /api/drill/jawab — satu jawaban, dikunci di server, dengan umpan balik RR langsung.
 *
 * - Jawaban yang sudah dikunci tidak bisa diubah (409), jadi siswa tidak bisa melihat benar/salah
 *   lalu mengganti jawabannya.
 * - Umpan balik dihitung ulang dari seluruh jawaban terkunci (urut waktu) terhadap kondisi RR di awal
 *   sesi. RR TIDAK ditulis di sini; submit akhir yang menulis dan menjadi penentu resmi, dengan hasil
 *   yang sama persis.
 */
function jawabDrill(pool, studentId, { attemptId, answer }) {
  return withTx(pool, async (client) => {
    const attempt = await lockAttempt(client, attemptId, studentId);
    if (attempt.status !== 'berlangsung') {
      throw new HttpError(409, 'ATTEMPT_SUDAH_SELESAI', 'Sesi ini sudah disubmit atau ditinggalkan');
    }
    if (!DRILL_MODES.includes(attempt.mode)) {
      throw new HttpError(422, 'MODE_TIDAK_DIDUKUNG', `Mode '${attempt.mode}' tidak diproses endpoint ini`);
    }

    const row = (await client.query(
      `SELECT dijawab_at FROM student_attempt_questions
        WHERE attempt_id = $1 AND question_id = $2
          FOR UPDATE`,
      [attemptId, answer.questionId],
    )).rows[0];
    if (!row) {
      throw new HttpError(422, 'SOAL_BUKAN_BAGIAN_SESI', 'Soal ini bukan bagian dari sesi', [answer.questionId]);
    }
    if (row.dijawab_at) {
      throw new HttpError(409, 'SUDAH_DIJAWAB', 'Soal ini sudah dijawab dan tidak bisa diubah');
    }

    // Anti-manipulasi: total durasi tidak boleh melebihi waktu nyata sesi
    const sudah = (await loadLockedAnswers(client, attemptId)).reduce((s, a) => s + a.durasi, 0);
    if (sudah + answer.durasi > attempt.elapsed_sec + C.DURATION_TOLERANCE_SEC) {
      throw new HttpError(422, 'DURASI_TIDAK_VALID',
        'Total durasi jawaban melebihi lama sesi yang tercatat di server');
    }

    await client.query(
      `UPDATE student_attempt_questions
          SET dijawab_at = now(), jawaban_terkunci = $3::jsonb, durasi_terkunci = $4
        WHERE attempt_id = $1 AND question_id = $2`,
      [attemptId, answer.questionId,
        answer.jawaban === null ? null : JSON.stringify(answer.jawaban), answer.durasi],
    );

    // Hitung umpan balik (simulasi tanpa menulis RR)
    const scored = await buildScored(client, await loadLockedAnswers(client, attemptId));
    let delta = 0;
    let efek = 'tanpa_rr';
    let speed = false;
    let tebakan;
    const mine = scored.find((a) => a.questionId === answer.questionId);

    if (attempt.mode === RANKED_MODE) {
      const subtopicIds = [...new Set(scored.filter((a) => a.levelSoal <= 3).flatMap((a) => a.subtopicIds))];
      const topicIds = [...new Set(scored.map((a) => a.topicId))];
      const { subtopicState, topicState, topicCounts } =
        await lockMasteryState(client, studentId, subtopicIds, topicIds);
      const calc = calculateSessionRR({
        answers: scored, subtopicState, topicState, topicCounts, now: attempt.db_now,
      });
      const r = calc.results.find((x) => x.questionId === answer.questionId);
      delta = r.rrDelta;
      efek = r.efek;
      speed = r.isSpeedBonus;
      tebakan = r.isFlaggedGuess;
    } else {
      tebakan = scoreAnswer(mine).isFlaggedGuess;
    }

    let streak = 0;
    for (let i = scored.length - 1; i >= 0 && scored[i].isCorrect; i -= 1) streak += 1;

    return {
      attempt_id: attemptId,
      question_id: answer.questionId,
      is_correct: mine.isCorrect,
      rr_delta: delta,
      is_speed_bonus: speed,
      is_flagged_guess: tebakan,
      efek,
      streak_benar: streak,
      jumlah_dijawab: scored.length,
      jumlah_soal: attempt.jumlah_soal,
    };
  });
}

module.exports = { jawabDrill };
