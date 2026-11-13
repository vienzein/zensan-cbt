'use strict';

const { HttpError } = require('../errors');

const ID_RE = /^[1-9]\d{0,17}$/;
const JUMLAH_SOAL = [5, 10, 20, 30];
const MODES = ['drill_ranked', 'drill_free'];
const MAX_IDS = 50;

const toId = (v) => (typeof v === 'number' ? String(v) : v);
const validId = (v) => typeof v === 'string' && ID_RE.test(v);

function parseIdList(raw, name, errors) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_IDS) {
    errors.push(`${name} harus array maksimal ${MAX_IDS} item`);
    return [];
  }
  const ids = raw.map(toId);
  if (!ids.every(validId)) {
    errors.push(`${name} berisi ID tidak valid`);
    return [];
  }
  return [...new Set(ids)];
}

/**
 * {
 *   "subject_id": 3,
 *   "mode": "drill_ranked",            // opsional, default drill_ranked
 *   "topic_ids": [12, 13],             // salah satu / keduanya wajib ada
 *   "subtopic_ids": [40],
 *   "jumlah_soal": 10                  // 5 | 10 | 20 | 30
 * }
 */
function parseStartBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'BAD_REQUEST', 'Body harus berupa JSON object');
  }
  const errors = [];

  const subjectId = toId(body.subject_id);
  if (!validId(subjectId)) errors.push('subject_id tidak valid');

  const mode = body.mode === undefined ? 'drill_ranked' : body.mode;
  if (!MODES.includes(mode)) errors.push(`mode harus salah satu dari: ${MODES.join(', ')}`);

  if (!JUMLAH_SOAL.includes(body.jumlah_soal)) {
    errors.push(`jumlah_soal harus salah satu dari: ${JUMLAH_SOAL.join(', ')}`);
  }

  const topicIds = parseIdList(body.topic_ids, 'topic_ids', errors);
  const subtopicIds = parseIdList(body.subtopic_ids, 'subtopic_ids', errors);
  if (!errors.length && !topicIds.length && !subtopicIds.length) {
    errors.push('Isi minimal satu topic_ids atau subtopic_ids');
  }

  if (errors.length) throw new HttpError(422, 'VALIDATION_ERROR', 'Payload tidak valid', errors);
  return { subjectId, mode, topicIds, subtopicIds, jumlahSoal: body.jumlah_soal };
}

module.exports = { parseStartBody };
