'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { evaluateStage, nextFailState, pickNextStage, gateOpen } = require('../src/services/stageRules');

test('lulus hanya bila 3/3 benar dan tepat waktu', () => {
  const b = { jumlahSoal: 3, batasDetik: 60 };
  assert.equal(evaluateStage({ ...b, jumlahBenar: 3, durasiDetik: 60 }).lulus, true);
  assert.equal(evaluateStage({ ...b, jumlahBenar: 3, durasiDetik: 62 }).lulus, true); // toleransi
  assert.equal(evaluateStage({ ...b, jumlahBenar: 3, durasiDetik: 70 }).lulus, false);
  assert.equal(evaluateStage({ ...b, jumlahBenar: 2, durasiDetik: 10 }).lulus, false);
});

test('gagal 3x berturut-turut -> jeda 15 menit lalu hitungan diulang', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.deepEqual(nextFailState(0, now), { gagalBeruntun: 1, cooldownUntil: null });
  assert.deepEqual(nextFailState(1, now), { gagalBeruntun: 2, cooldownUntil: null });
  const r = nextFailState(2, now);
  assert.equal(r.gagalBeruntun, 0);
  assert.equal(r.cooldownUntil.toISOString(), '2026-01-01T00:15:00.000Z');
});

test('stage berikutnya berurutan dan gerbang D0-01..D0-05', () => {
  const st = [
    { id: 1, kode_topik: 'D0-01' }, { id: 2, kode_topik: 'D0-05' }, { id: 3, kode_topik: 'D0-06' },
  ];
  assert.equal(pickNextStage(st, new Set(['1'])).id, 2);
  assert.equal(pickNextStage(st, new Set(['1', '2', '3'])), null);
  assert.equal(gateOpen(st, new Set(['1'])), false);
  assert.equal(gateOpen(st, new Set(['1', '2'])), true);
  assert.equal(gateOpen([], new Set()), false);
});
