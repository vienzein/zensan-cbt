'use strict';

const { HttpError } = require('../errors');
const { KODE_ALASAN, CATATAN_MAKS } = require('../config/laporanSoal');

const ID_RE = /^[1-9]\d{0,17}$/;

/** Body: { question_id, alasan, catatan? } */
function parseLaporBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'BAD_REQUEST', 'Body harus berupa JSON object');
  }
  const errors = [];
  const qid = typeof body.question_id === 'number' ? String(body.question_id) : body.question_id;
  if (typeof qid !== 'string' || !ID_RE.test(qid)) errors.push('question_id tidak valid');
  if (!KODE_ALASAN.includes(body.alasan)) errors.push(`alasan harus salah satu dari: ${KODE_ALASAN.join(', ')}`);

  let catatan = null;
  if (body.catatan !== undefined && body.catatan !== null) {
    if (typeof body.catatan !== 'string') errors.push('catatan harus berupa teks');
    else {
      catatan = body.catatan.trim();
      if (catatan.length > CATATAN_MAKS) errors.push(`catatan maksimal ${CATATAN_MAKS} karakter`);
      if (!catatan) catatan = null;
    }
  }
  if (body.alasan === 'lainnya' && !catatan) errors.push('alasan "lainnya" wajib disertai catatan');

  if (errors.length) throw new HttpError(422, 'VALIDATION_ERROR', 'Laporan tidak valid', errors);
  return { questionId: qid, alasan: body.alasan, catatan };
}

module.exports = { parseLaporBody };
