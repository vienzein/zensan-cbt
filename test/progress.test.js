'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hitungStreak, ringkasTopik, levelNama } = require('../src/services/progress');

test('streak: tidak ada latihan = 0', () => {
  assert.equal(hitungStreak([], '2026-11-15'), 0);
});

test('streak: hari ini dan hari-hari sebelumnya berurutan', () => {
  assert.equal(hitungStreak(['2026-11-15', '2026-11-14', '2026-11-13'], '2026-11-15'), 3);
});

test('streak: hari ini belum latihan tapi kemarin ada: streak masih hidup', () => {
  assert.equal(hitungStreak(['2026-11-14', '2026-11-13'], '2026-11-15'), 2);
});

test('streak: kemarin kosong = putus', () => {
  assert.equal(hitungStreak(['2026-11-13', '2026-11-12'], '2026-11-15'), 0);
});

test('streak: berhenti di celah pertama', () => {
  assert.equal(hitungStreak(['2026-11-15', '2026-11-14', '2026-11-12', '2026-11-11'], '2026-11-15'), 2);
});

test('streak: melewati pergantian bulan dan tahun', () => {
  assert.equal(hitungStreak(['2027-01-01', '2026-12-31', '2026-12-30'], '2027-01-01'), 3);
});

test('ringkasan topik: sebaran level, rata-rata RR, level terendah', () => {
  const r = ringkasTopik([
    { level: 2, rr: 70 }, { level: 1, rr: 30 }, { level: 3, rr: 100 },
  ]);
  assert.deepEqual(r.di_level, { 1: 1, 2: 1, 3: 1 });
  assert.equal(r.jumlah_subtopik, 3);
  assert.equal(r.rr_rata_rata, 67);
  assert.equal(r.level_terendah, 1);
  assert.equal(r.level_terendah_nama, 'Perintis');
});

test('ringkasan topik: tanpa subtopik tidak error', () => {
  const r = ringkasTopik([]);
  assert.equal(r.jumlah_subtopik, 0);
  assert.equal(r.rr_rata_rata, 0);
  assert.equal(r.level_terendah, 1);
});

test('nama level', () => {
  assert.equal(levelNama(1), 'Perintis');
  assert.equal(levelNama(2), 'Pejuang');
  assert.equal(levelNama(3), 'Ahli');
  assert.equal(levelNama(9), null);
});
