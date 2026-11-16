'use strict';

const { HttpError } = require('../errors');
const { normalizeAnswer, INVALID, UUID_RE, ID_RE } = require('./drillSubmit');

/** { attempt_id, jawaban: [{ question_id, jawaban_siswa }] }  (durasi dihitung server) */
function parseStageSubmitBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'BAD_REQUEST', 'Body harus berupa JSON object');
  }
  const errors = [];
  if (typeof body.attempt_id !== 'string' || !UUID_RE.test(body.attempt_id)) errors.push('attempt_id harus berupa UUID');
  if (!Array.isArray(body.jawaban) || body.jawaban.length > 20) errors.push('jawaban harus array maksimal 20 item');
  if (errors.length) throw new HttpError(422, 'VALIDATION_ERROR', 'Payload tidak valid', errors);

  const seen = new Set();
  const answers = body.jawaban.map((it, i) => {
    const q = it && typeof it.question_id === 'number' ? String(it.question_id) : it && it.question_id;
    if (typeof q !== 'string' || !ID_RE.test(q)) errors.push(`jawaban[${i}].question_id tidak valid`);
    else if (seen.has(q)) errors.push(`jawaban[${i}].question_id duplikat`);
    else seen.add(q);
    const a = normalizeAnswer(it && it.jawaban_siswa);
    if (a === INVALID) errors.push(`jawaban[${i}].jawaban_siswa tidak valid`);
    return { questionId: q, jawaban: a === INVALID ? null : a };
  });
  if (errors.length) throw new HttpError(422, 'VALIDATION_ERROR', 'Payload tidak valid', errors);
  return { attemptId: body.attempt_id, answers };
}

module.exports = { parseStageSubmitBody };
