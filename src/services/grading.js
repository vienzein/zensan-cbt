'use strict';

/**
 * Penilaian jawaban di SERVER. Frontend tidak pernah mengirim is_correct.
 *
 * kunci_jawaban (JSONB) berbentuk:
 *   pilihan_ganda          -> "A"
 *   pilihan_ganda_kompleks -> ["A","C"]
 *   isian                  -> "42"
 */

const normText = (v) => String(v).trim().toLowerCase().replace(/\s+/g, ' ');

// "1,5" dan "1.50" dianggap sama untuk soal isian numerik
function asNumber(v) {
  const s = String(v).trim().replace(',', '.');
  if (s === '' || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function sameScalar(kunci, jawaban) {
  if (normText(kunci) === normText(jawaban)) return true;
  const a = asNumber(kunci);
  const b = asNumber(jawaban);
  return a !== null && b !== null && a === b;
}

function isAnswerCorrect(kunci, jawaban) {
  if (jawaban === null || jawaban === undefined) return false; // dilewati / waktu habis

  if (Array.isArray(kunci)) {
    if (!Array.isArray(jawaban)) return false;
    const k = new Set(kunci.map(normText));
    const j = new Set(jawaban.map(normText));
    if (k.size !== j.size) return false;
    for (const x of k) if (!j.has(x)) return false;
    return true;
  }

  if (Array.isArray(jawaban)) return false;
  return sameScalar(kunci, jawaban);
}

module.exports = { isAnswerCorrect };
