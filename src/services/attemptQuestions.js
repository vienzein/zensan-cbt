'use strict';

/**
 * Dipanggil oleh endpoint "mulai sesi" (di dalam transaksi yang sama dengan
 * INSERT student_attempts), setelah server memilih soal sesuai komposisi PRD.
 *
 * @param client      client pg yang sedang dalam transaksi
 * @param attemptId   UUID student_attempts.id
 * @param questionIds array ID soal, urut sesuai penyajian
 */
async function assignQuestions(client, attemptId, questionIds) {
  if (!questionIds.length) return;
  await client.query(
    `INSERT INTO student_attempt_questions (attempt_id, question_id, urutan)
     SELECT $1::uuid, q.id, q.ord
       FROM unnest($2::bigint[]) WITH ORDINALITY AS q(id, ord)`,
    [attemptId, questionIds],
  );
}

/** Himpunan question_id (string) yang ditetapkan untuk sesi ini. */
async function loadAssignedQuestionIds(client, attemptId) {
  const { rows } = await client.query(
    `SELECT question_id FROM student_attempt_questions WHERE attempt_id = $1`,
    [attemptId],
  );
  return new Set(rows.map((r) => r.question_id));
}

/** ID soal sesi, urut penyajian (untuk melanjutkan sesi yang belum selesai). */
async function loadAttemptQuestionIds(client, attemptId) {
  const { rows } = await client.query(
    `SELECT question_id FROM student_attempt_questions WHERE attempt_id = $1 ORDER BY urutan`,
    [attemptId],
  );
  return rows.map((r) => r.question_id);
}

/** Isi soal untuk client: TANPA kunci jawaban dan pembahasan. */
async function loadQuestionPayload(client, questionIds) {
  const { rows } = await client.query(
    `SELECT id, level_soal, tipe_soal, soal_teks, soal_gambar_url, opsi_jawaban, target_waktu_detik
       FROM questions WHERE id = ANY($1::bigint[])`,
    [questionIds],
  );
  const byId = new Map(rows.map((q) => [q.id, q]));
  return questionIds.map((id, i) => {
    const q = byId.get(id);
    return {
      urutan: i + 1,
      question_id: q.id,
      level_soal: q.level_soal,
      tipe_soal: q.tipe_soal,
      soal_teks: q.soal_teks,
      soal_gambar_url: q.soal_gambar_url,
      opsi_jawaban: q.opsi_jawaban,
      target_waktu_detik: q.target_waktu_detik,
    };
  });
}

module.exports = { assignQuestions, loadAssignedQuestionIds, loadAttemptQuestionIds, loadQuestionPayload };
