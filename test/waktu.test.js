'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { waktuSoal } = require('../src/config/waktu');

test('tabel waktu sesuai kesepakatan: L3/L4 = waktu asli SNBT, L2 sekitar 80%, L1 sekitar 60%', () => {
  const tabel = {
    PPU: [25, 35, 45, 45],
    PU: [35, 50, 60, 60],
    PK: [35, 50, 60, 60],
    PBM: [45, 60, 75, 75],
    LBI: [55, 70, 90, 90],
    LBE: [55, 70, 90, 90],
    PM: [55, 70, 90, 90],
  };
  for (const [kode, [l1, l2, l3, l4]] of Object.entries(tabel)) {
    assert.deepEqual([1, 2, 3, 4].map((l) => waktuSoal(kode, l)), [l1, l2, l3, l4], kode);
  }
});

test('kode subtes tidak peka huruf besar/kecil; subtes asing memakai waktu bawaan', () => {
  assert.equal(waktuSoal('pm', 3), 90);
  assert.equal(waktuSoal('TWK', 3), 60);
  assert.equal(waktuSoal('TWK', 1), 35);
});

test('level tidak dikenal ditolak', () => {
  assert.throws(() => waktuSoal('PM', 5));
  assert.throws(() => waktuSoal('PM', 0));
});
