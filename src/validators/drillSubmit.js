'use strict';

const { HttpError } = require('../errors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RE = /^[1-9]\d{0,17}$/;
const MAX_ANSWERS = 100;
const INVALID = Symbol('invalid');

// jawaban_siswa: null | string | number | array<string|number>  ->  null | string | string[]
function normalizeAnswer(v) {
  if (v === null || v === undefined) return null;
  const one = (x) => {
    if (typeof x === 'string') return x.trim().slice(0, 500);
    if (typeof x === 'number' && Number.isFinite(x)) return String(x);
    return INVALID;
  };
  if (Array.isArray(v)) {
    if (v.length > 10) return INVALID;
    const arr = v.map(one);
    if (arr.includes(INVALID)) return INVALID;
    const clean = arr.filter((s) => s !== '');
    return clean.length ? clean : null;
  }
  const s = one(v);
  if (s === INVALID) return INVALID;
  return s === '' ? null : s;
}

/**
 * Body yang diharapkan:
 * {
 *   "attempt_id": "uuid",
 *   "jawaban": [
 *     { "question_id": 101, "jawaban_siswa": "B", "durasi_pengerjaan_detik": 42.5 },
 *     ...  // urutan array = urutan pengerjaan
 *   ]
 * }
 */
function parseSubmitBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'BAD_REQUEST', 'Body harus berupa JSON object');
  }

  const errors = [];
  const { attempt_id: attemptId, jawaban } = body;

  if (typeof attemptId !== 'string' || !UUID_RE.test(attemptId)) {
    errors.push('attempt_id harus berupa UUID');
  }
  if (!Array.isArray(jawaban) || jawaban.length < 1 || jawaban.length > MAX_ANSWERS) {
    errors.push(`jawaban harus berupa array berisi 1-${MAX_ANSWERS} item`);
  }
  if (errors.length) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Payload tidak valid', errors);
  }

  const seen = new Set();
  const answers = jawaban.map((it, i) => {
    const p = `jawaban[${i}]`;
    const qid = it && it.question_id;
    const qidStr = typeof qid === 'number' ? String(qid) : qid;
    if (typeof qidStr !== 'string' || !ID_RE.test(qidStr)) {
      errors.push(`${p}.question_id tidak valid`);
    } else if (seen.has(qidStr)) {
      errors.push(`${p}.question_id duplikat`);
    } else {
      seen.add(qidStr);
    }

    const d = it && it.durasi_pengerjaan_detik;
    if (typeof d !== 'number' || !Number.isFinite(d) || d < 0 || d > 86_400) {
      errors.push(`${p}.durasi_pengerjaan_detik harus angka 0-86400`);
    }

    const ans = normalizeAnswer(it && it.jawaban_siswa);
    if (ans === INVALID) errors.push(`${p}.jawaban_siswa tidak valid`);

    return {
      urutan: i + 1,
      questionId: qidStr,
      jawaban: ans === INVALID ? null : ans,
      durasi: Math.round((typeof d === 'number' ? d : 0) * 100) / 100, // NUMERIC(8,2)
      // true = layar menghabiskan waktu soal tanpa pilihan; server memverifikasi lagi
      waktuHabis: Boolean(it && it.waktu_habis === true),
    };
  });

  if (errors.length) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Payload tidak valid', errors);
  }
  return { attemptId, answers };
}

module.exports = { parseSubmitBody, normalizeAnswer, INVALID, UUID_RE, ID_RE };
