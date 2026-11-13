'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateSessionRR } = require('../src/services/drillScoring');
const { isAnswerCorrect } = require('../src/services/grading');

const NOW = new Date('2026-11-14T00:00:00Z');

const ans = (o) => ({
  urutan: 1, questionId: '1', topicId: 'T1', levelSoal: 1, targetWaktu: 100,
  poinReward: 10, durasi: 80, isCorrect: true, subtopicIds: ['S1'], ...o,
});
const sub = (o) => new Map([['S1', { current_level: 2, rank_rating: 50, strike_count: 0, ...o }]]);
const top = (o) => new Map([['T1', { is_elite: false, elite_rr: 0, strike_count: 0, cooldown_until: null, ...o }]]);
const run = (answers, s = {}, t = {}) =>
  calculateSessionRR({ answers, subtopicState: sub(s), topicState: top(t), now: NOW });

test('benar normal: +poin_reward', () => {
  const r = run([ans({})]);
  assert.equal(r.results[0].rrDelta, 10);
  assert.equal(r.subtopicUpdates[0].rank_rating, 60);
});

test('speed bonus: durasi < 50% target -> +20%', () => {
  const r = run([ans({ durasi: 49 })]);
  assert.equal(r.results[0].isSpeedBonus, true);
  assert.equal(r.results[0].rrDelta, 12);
});

test('tepat 50% bukan speed bonus', () => {
  assert.equal(run([ans({ durasi: 50 })]).results[0].isSpeedBonus, false);
});

test('anti-tebak: < 10% target tidak dapat speed bonus, tapi ditandai', () => {
  const r = run([ans({ durasi: 5 })]);
  assert.equal(r.results[0].isSpeedBonus, false);
  assert.equal(r.results[0].isFlaggedGuess, true);
  assert.equal(r.results[0].rrDelta, 10);
});

test('salah: -20% dari poin soal', () => {
  const r = run([ans({ isCorrect: false })]);
  assert.equal(r.results[0].rrDelta, -2);
  assert.equal(r.subtopicUpdates[0].rank_rating, 48);
});

test('RR dijepit di 0..100', () => {
  assert.equal(run([ans({})], { rank_rating: 95 }).subtopicUpdates[0].rank_rating, 100);
  assert.equal(run([ans({ isCorrect: false })], { rank_rating: 1 }).subtopicUpdates[0].rank_rating, 0);
});

test('Strike 1: salah saat RR 0', () => {
  const r = run([ans({ isCorrect: false })], { rank_rating: 0 });
  assert.equal(r.subtopicUpdates[0].strike_count, 1);
  assert.equal(r.subtopicUpdates[0].current_level, 2);
  assert.equal(r.topicUpdates.length, 0); // belum cooldown
});

test('Strike 2: turun 1 level, RR 70, strike reset, cooldown 10 menit di topik', () => {
  const r = run(
    [ans({ urutan: 1, isCorrect: false }), ans({ urutan: 2, questionId: '2', isCorrect: false })],
    { rank_rating: 0 },
  );
  const s = r.subtopicUpdates[0];
  assert.equal(s.current_level, 1);
  assert.equal(s.rank_rating, 70);
  assert.equal(s.strike_count, 0);
  assert.equal(r.topicUpdates[0].cooldownTriggered, true);
  assert.equal(r.logs[1].strikeAfter, 2);
  assert.equal(r.logs[1].levelAfter, 1);
});

test('Strike 2 di Level 1: level tetap 1, RR 0, tetap cooldown', () => {
  const r = run(
    [ans({ urutan: 1, isCorrect: false }), ans({ urutan: 2, questionId: '2', isCorrect: false })],
    { current_level: 1, rank_rating: 0 },
  );
  assert.equal(r.subtopicUpdates[0].current_level, 1);
  assert.equal(r.subtopicUpdates[0].rank_rating, 0);
  assert.equal(r.topicUpdates[0].cooldownTriggered, true);
});

test('salah saat Strike 1 tapi RR >= 10: hanya RR turun', () => {
  const r = run([ans({ isCorrect: false })], { rank_rating: 30, strike_count: 1 });
  assert.equal(r.subtopicUpdates[0].rank_rating, 28);
  assert.equal(r.subtopicUpdates[0].strike_count, 1);
});

test('5 salah beruntun dalam topik -> cooldown; jawaban sesudahnya tidak mengubah RR', () => {
  const wrongs = [1, 2, 3, 4, 5].map((n) => ans({ urutan: n, questionId: String(n), isCorrect: false }));
  const after = ans({ urutan: 6, questionId: '6', isCorrect: true });
  const r = run([...wrongs, after]);
  assert.equal(r.topicUpdates[0].cooldownTriggered, true);
  assert.equal(r.results[5].efek, 'cooldown');
  assert.equal(r.results[5].rrDelta, 0);
  assert.equal(r.subtopicUpdates[0].rank_rating, 40); // 50 - 5*2
});

test('jawaban benar memutus rangkaian salah beruntun', () => {
  const seq = [false, false, false, false, true, false].map((c, i) =>
    ans({ urutan: i + 1, questionId: String(i + 1), isCorrect: c }));
  assert.equal(run(seq).topicUpdates.length, 0);
});

test('topik yang sudah cooldown sejak awal: RR tidak berubah', () => {
  const r = run([ans({})], {}, { cooldown_until: new Date(NOW.getTime() + 60_000) });
  assert.equal(r.results[0].efek, 'cooldown');
  assert.equal(r.subtopicUpdates.length, 0);
});

test('soal multi-subtopik: semua subtopik terdampak penuh', () => {
  const state = new Map([
    ['S1', { current_level: 2, rank_rating: 50, strike_count: 0 }],
    ['S2', { current_level: 2, rank_rating: 20, strike_count: 0 }],
  ]);
  const r = calculateSessionRR({
    answers: [ans({ levelSoal: 3, subtopicIds: ['S1', 'S2'] })],
    subtopicState: state, topicState: top(), now: NOW,
  });
  assert.deepEqual(r.subtopicUpdates.map((u) => u.rank_rating), [60, 30]);
  assert.equal(r.totalRrDelta, 10); // dihitung sekali per jawaban
});

test('Level 4: hanya RR topik; subtopik tidak berubah; non-Elite diabaikan', () => {
  const l4 = ans({ levelSoal: 4, subtopicIds: [] });
  const elite = run([l4], {}, { is_elite: true, elite_rr: 40 });
  assert.equal(elite.topicUpdates[0].elite_rr, 50);
  assert.equal(elite.subtopicUpdates.length, 0);
  assert.equal(elite.logs[0].subtopicId, null);

  const non = run([l4]);
  assert.equal(non.results[0].efek, 'diabaikan');
  assert.equal(non.topicUpdates.length, 0);
});

test('Level 4 Strike 2: keluar dari Elite + cooldown', () => {
  const l4 = (n) => ans({ urutan: n, questionId: String(n), levelSoal: 4, subtopicIds: [], isCorrect: false });
  const r = run([l4(1), l4(2)], {}, { is_elite: true, elite_rr: 0 });
  assert.equal(r.topicUpdates[0].is_elite, false);
  assert.equal(r.topicUpdates[0].cooldownTriggered, true);
  assert.equal(r.logs[1].levelAfter, 3);
});

test('input state tidak dimutasi (fungsi murni)', () => {
  const s = sub({}); const t = top();
  calculateSessionRR({ answers: [ans({})], subtopicState: s, topicState: t, now: NOW });
  assert.equal(s.get('S1').rank_rating, 50);
});

test('grading: pilihan ganda, kompleks, isian', () => {
  assert.equal(isAnswerCorrect('A', ' a '), true);
  assert.equal(isAnswerCorrect('A', 'B'), false);
  assert.equal(isAnswerCorrect(['A', 'C'], ['c', 'a']), true);
  assert.equal(isAnswerCorrect(['A', 'C'], ['A']), false);
  assert.equal(isAnswerCorrect(['A', 'C'], 'A'), false);
  assert.equal(isAnswerCorrect('1.5', '1,50'), true);
  assert.equal(isAnswerCorrect('42', null), false);
});

// ---------- Promosi level, gerbang Level 3, masuk Elite ----------
const counts = (o) => new Map([['T1', { total: 2, at2plus: 1, at3: 0, ...o }]]);
const runP = (answers, s, t, c) =>
  calculateSessionRR({ answers, subtopicState: s, topicState: t, topicCounts: c, now: NOW });

test('promosi L1 -> L2 saat RR mencapai 100, RR reset ke nilai awal promosi', () => {
  const r = runP([ans({})], sub({ current_level: 1, rank_rating: 95 }), top(), counts({ at2plus: 0 }));
  const s = r.subtopicUpdates[0];
  assert.equal(s.current_level, 2);
  assert.equal(s.rank_rating, 20);
  assert.equal(r.logs[0].levelBefore, 1);
  assert.equal(r.logs[0].levelAfter, 2);
});

test('L2 -> L3 tertahan di 100 jika Level 3 topik belum terbuka', () => {
  const r = runP([ans({})], sub({ current_level: 2, rank_rating: 95 }), top(), counts({ at2plus: 1 }));
  // at2plus 1 dari total 2, tetapi level3_unlocked belum tercatat -> tertahan
  assert.equal(r.subtopicUpdates[0].current_level, 2);
  assert.equal(r.subtopicUpdates[0].rank_rating, 100);
});

test('L2 -> L3 naik jika Level 3 topik sudah terbuka', () => {
  const r = runP([ans({})], sub({ current_level: 2, rank_rating: 95 }),
    top({ level3_unlocked: true }), counts({ at2plus: 1 }));
  assert.equal(r.subtopicUpdates[0].current_level, 3);
});

test('promosi L1 -> L2 membuka Level 3 topik bila >= 50% subtopik Level 2+', () => {
  const r = runP([ans({})], sub({ current_level: 1, rank_rating: 95 }), top(), counts({ total: 2, at2plus: 0 }));
  // 1 dari 2 subtopik kini di Level 2+ = 50%
  assert.equal(r.topicUpdates[0].level3_unlocked, true);
});

test('Level 3 tetap bisa 100 RR tanpa naik lagi', () => {
  const r = runP([ans({})], sub({ current_level: 3, rank_rating: 95 }), top({ level3_unlocked: true }),
    counts({ at2plus: 2, at3: 1 }));
  assert.equal(r.subtopicUpdates[0].current_level, 3);
  assert.equal(r.subtopicUpdates[0].rank_rating, 100);
});

test('semua subtopik Level 3 -> topik masuk Elite', () => {
  const r = runP([ans({})], sub({ current_level: 2, rank_rating: 95 }), top({ level3_unlocked: true }),
    counts({ total: 2, at2plus: 2, at3: 1 }));
  assert.equal(r.subtopicUpdates[0].current_level, 3);
  assert.equal(r.topicUpdates[0].is_elite, true);
  assert.equal(r.topicUpdates[0].elite_rr, 0);
});

test('belum semua Level 3 -> tidak masuk Elite', () => {
  const r = runP([ans({})], sub({ current_level: 2, rank_rating: 95 }), top({ level3_unlocked: true }),
    counts({ total: 3, at2plus: 3, at3: 1 }));
  assert.equal(r.topicUpdates.length, 0);
});

test('jawaban salah tidak pernah memicu promosi', () => {
  const r = runP([ans({ isCorrect: false })], sub({ current_level: 1, rank_rating: 100 }), top(), counts({}));
  assert.equal(r.subtopicUpdates[0].current_level, 1);
});

test('demosi menurunkan hitungan, lalu naik lagi dalam sesi yang sama tetap konsisten', () => {
  const answers = [
    ans({ urutan: 1, isCorrect: false }),
    ans({ urutan: 2, questionId: '2', isCorrect: false }), // Strike 2 -> L2 -> L1, RR 70 (lalu cooldown)
  ];
  const r = runP(answers, sub({ current_level: 2, rank_rating: 0 }), top({ level3_unlocked: true }),
    counts({ total: 2, at2plus: 2, at3: 0 }));
  assert.equal(r.subtopicUpdates[0].current_level, 1);
  assert.equal(r.subtopicUpdates[0].rank_rating, 70);
});
