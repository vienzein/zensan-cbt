'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calibrateSubtopics, composeCalibration } = require('../src/services/calibration');
const { calculateSessionRR } = require('../src/services/drillScoring');

const a = (urutan, levelSoal, isCorrect, subtopicIds = ['S1'], topicId = 'T1') =>
  ({ urutan, levelSoal, isCorrect, subtopicIds, topicId });

test('Ahli: L3 benar tanpa salah di L1-L2, RR 30', () => {
  const r = calibrateSubtopics([a(1, 1, true), a(2, 2, true), a(3, 3, true)]);
  assert.deepEqual([r.get('S1').level, r.get('S1').rr], [3, 30]);
});

test('Ahli dengan salah di L3: RR 10', () => {
  const r = calibrateSubtopics([a(1, 1, true), a(2, 3, true), a(3, 3, false)]);
  assert.deepEqual([r.get('S1').level, r.get('S1').rr], [3, 10]);
});

test('L3 benar tapi ada salah di L2: jatuh ke Pejuang bila L2 juga ada benar', () => {
  const r = calibrateSubtopics([a(1, 2, true), a(2, 2, false), a(3, 3, true)]);
  assert.deepEqual([r.get('S1').level, r.get('S1').rr], [2, 10]);
});

test('L3 benar tapi salah di L1: Perintis', () => {
  const r = calibrateSubtopics([a(1, 1, false), a(2, 2, true), a(3, 3, true)]);
  assert.deepEqual([r.get('S1').level, r.get('S1').rr], [1, 10]);
});

test('Pejuang: L2 benar tanpa salah di L1, RR 30', () => {
  const r = calibrateSubtopics([a(1, 1, true), a(2, 2, true)]);
  assert.deepEqual([r.get('S1').level, r.get('S1').rr], [2, 30]);
});

test('hanya soal L1: Perintis; salah di L1 -> RR 10', () => {
  assert.equal(calibrateSubtopics([a(1, 1, true)]).get('S1').rr, 30);
  assert.equal(calibrateSubtopics([a(1, 1, false)]).get('S1').rr, 10);
});

test('soal multi-subtopik dihitung penuh ke tiap subtopik; Level 4 diabaikan', () => {
  const r = calibrateSubtopics([a(1, 3, true, ['S1', 'S2']), a(2, 4, true, ['S3'])]);
  assert.equal(r.get('S1').level, 3);
  assert.equal(r.get('S2').level, 3);
  assert.equal(r.has('S3'), false);
});

test('subtopik tanpa jawaban tidak muncul', () => {
  assert.equal(calibrateSubtopics([]).size, 0);
});

test('composeCalibration: soal L3 multi-subtopik menutup beberapa subtopik, tanpa duplikat', () => {
  const c = [
    { subtopicId: 'S1', level: 3, questionId: 'Q3' },
    { subtopicId: 'S2', level: 3, questionId: 'Q3' },
    { subtopicId: 'S1', level: 2, questionId: 'Q2a' },
    { subtopicId: 'S2', level: 2, questionId: 'Q2b' },
    { subtopicId: 'S1', level: 1, questionId: 'Q1a' },
    { subtopicId: 'S2', level: 1, questionId: 'Q1b' },
  ];
  const ids = composeCalibration({ candidates: c, maxSoal: 90, rng: () => 0.3 });
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 5); // Q3 dipakai sekali untuk dua subtopik
});

test('composeCalibration: menghormati batas maksimal soal', () => {
  const c = [];
  for (let i = 0; i < 50; i += 1) c.push({ subtopicId: `S${i}`, level: 1, questionId: `Q${i}` });
  assert.equal(composeCalibration({ candidates: c, maxSoal: 10 }).length, 10);
});

test('topik hasil kalibrasi (semua Level 3) masuk Elite pada jawaban benar ranked pertama', () => {
  const r = calculateSessionRR({
    answers: [{
      urutan: 1, questionId: '1', topicId: 'T1', levelSoal: 3, targetWaktu: 100, poinReward: 10,
      durasi: 80, isCorrect: true, subtopicIds: ['S1'],
    }],
    subtopicState: new Map([['S1', { current_level: 3, rank_rating: 30, strike_count: 0 }]]),
    topicState: new Map([['T1', { is_elite: false, elite_rr: 0, strike_count: 0, level3_unlocked: true, cooldown_until: null }]]),
    topicCounts: new Map([['T1', { total: 2, at2plus: 2, at3: 2 }]]),
    now: new Date(),
  });
  assert.equal(r.topicUpdates[0].is_elite, true);
});
