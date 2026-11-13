'use strict';

const C = require('../config/rr');

/**
 * Logika murni tryout kalibrasi.
 */

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Menetapkan level awal tiap subtopik dari jawaban benar/salah (PRD):
 *   Ahli    : ada L3 benar, tanpa salah di L1-L2
 *   Pejuang : ada L2 benar, tanpa salah di L1
 *   Perintis: selain itu
 *   RR awal : 30, atau 10 jika ada salah di level yang ditetapkan
 * Maksimal Ahli. Soal Level 4 diabaikan. Soal multi-subtopik dihitung penuh ke tiap subtopik.
 * Subtopik tanpa satu pun jawaban tidak muncul di hasil.
 *
 * @param {Array} answers { urutan, topicId, levelSoal, isCorrect, subtopicIds }
 * @returns {Map<string,{level,rr,topicId,lastUrutan}>}
 */
function calibrateSubtopics(answers) {
  const stats = new Map();
  for (const a of answers) {
    if (a.levelSoal < 1 || a.levelSoal > 3) continue;
    for (const sid of a.subtopicIds) {
      if (!stats.has(sid)) {
        stats.set(sid, {
          topicId: a.topicId,
          correct: { 1: 0, 2: 0, 3: 0 },
          wrong: { 1: 0, 2: 0, 3: 0 },
          lastUrutan: a.urutan,
        });
      }
      const s = stats.get(sid);
      (a.isCorrect ? s.correct : s.wrong)[a.levelSoal] += 1;
      s.lastUrutan = Math.max(s.lastUrutan, a.urutan);
    }
  }

  const out = new Map();
  for (const [sid, s] of stats) {
    let level = 1;
    if (s.wrong[1] === 0 && s.wrong[2] === 0 && s.correct[3] > 0) level = 3;
    else if (s.wrong[1] === 0 && s.correct[2] > 0) level = 2;
    out.set(sid, {
      level,
      rr: s.wrong[level] > 0 ? C.CALIBRATION_RR_WRONG : C.CALIBRATION_RR_CLEAN,
      topicId: s.topicId,
      lastUrutan: s.lastUrutan,
    });
  }
  return out;
}

/**
 * Memilih soal tryout kalibrasi: usahakan tiap subtopik punya soal di Level 3, 2, 1.
 * Soal Level 3 (multi-subtopik) menutup beberapa subtopik sekaligus.
 * Berhenti saat mencapai maxSoal.
 *
 * @param {Array} candidates { subtopicId, level, questionId } (sudah acak per kelompok)
 * @returns {string[]} questionId
 */
function composeCalibration({ candidates, maxSoal, rng = Math.random }) {
  const bySlot = new Map(); // "sid:level" -> questionId[]
  const subsOfQuestion = new Map(); // qid -> Set<sid>
  const levelOfQuestion = new Map();
  const subtopics = new Set();

  for (const c of candidates) {
    const key = `${c.subtopicId}:${c.level}`;
    if (!bySlot.has(key)) bySlot.set(key, []);
    bySlot.get(key).push(c.questionId);
    if (!subsOfQuestion.has(c.questionId)) subsOfQuestion.set(c.questionId, new Set());
    subsOfQuestion.get(c.questionId).add(c.subtopicId);
    levelOfQuestion.set(c.questionId, c.level);
    subtopics.add(c.subtopicId);
  }

  const covered = new Set();
  const picked = [];
  const pickedSet = new Set();

  for (const level of [3, 2, 1]) {
    for (const sid of shuffle([...subtopics], rng)) {
      if (picked.length >= maxSoal) return shuffle(picked, rng);
      const slot = `${sid}:${level}`;
      if (covered.has(slot)) continue;
      const list = (bySlot.get(slot) || []).filter((q) => !pickedSet.has(q));
      if (!list.length) continue;

      // Pilih soal yang menutup paling banyak subtopik yang belum tertutup
      let best = list[0];
      let bestGain = -1;
      for (const q of list) {
        let gain = 0;
        for (const s of subsOfQuestion.get(q)) if (!covered.has(`${s}:${level}`)) gain += 1;
        if (gain > bestGain) { best = q; bestGain = gain; }
      }

      pickedSet.add(best);
      picked.push(best);
      for (const s of subsOfQuestion.get(best)) covered.add(`${s}:${levelOfQuestion.get(best)}`);
    }
  }
  return shuffle(picked, rng);
}

module.exports = { calibrateSubtopics, composeCalibration };
