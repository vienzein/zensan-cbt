'use strict';

const { HttpError } = require('../errors');
const { parseSubmitBody } = require('./drillSubmit');

/**
 * Satu jawaban:
 * { "attempt_id": "uuid", "question_id": 101, "jawaban_siswa": "B", "durasi_pengerjaan_detik": 42.5,
 * "waktu_habis": false }  // waktu_habis opsional
 * Memakai aturan validasi yang sama dengan submit akhir.
 */
function parseAnswerBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'BAD_REQUEST', 'Body harus berupa JSON object');
  }
  const {
    attempt_id: attemptId, question_id, jawaban_siswa, durasi_pengerjaan_detik, waktu_habis,
  } = body;
  const { answers } = parseSubmitBody({
    attempt_id: attemptId,
    jawaban: [{ question_id, jawaban_siswa, durasi_pengerjaan_detik, waktu_habis }],
  });
  return { attemptId, answer: answers[0] };
}

module.exports = { parseAnswerBody };
