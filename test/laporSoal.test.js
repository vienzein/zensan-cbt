'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLaporBody } = require('../src/validators/laporSoal');
const { ALASAN, KODE_ALASAN } = require('../src/config/laporanSoal');
const fs = require('node:fs');
const path = require('node:path');

const galat = (body) => { try { parseLaporBody(body); } catch (e) { return e; } return null; };

test('laporan sah: question_id angka atau teks, catatan opsional dan dirapikan', () => {
  assert.deepEqual(parseLaporBody({ question_id: 12, alasan: 'gambar_tidak_muncul' }),
    { questionId: '12', alasan: 'gambar_tidak_muncul', catatan: null });
  assert.deepEqual(parseLaporBody({ question_id: '7', alasan: 'kunci_salah', catatan: '  kuncinya C  ' }),
    { questionId: '7', alasan: 'kunci_salah', catatan: 'kuncinya C' });
});

test('laporan ditolak: alasan asing, id rusak, catatan terlalu panjang, "lainnya" tanpa catatan, body bukan objek', () => {
  assert.equal(galat({ question_id: 1, alasan: 'bebas' }).status, 422);
  assert.equal(galat({ question_id: 'abc', alasan: 'kunci_salah' }).status, 422);
  assert.equal(galat({ question_id: 1, alasan: 'kunci_salah', catatan: 'x'.repeat(501) }).status, 422);
  assert.equal(galat({ question_id: 1, alasan: 'lainnya' }).status, 422);
  assert.equal(galat({ question_id: 1, alasan: 'lainnya', catatan: '   ' }).status, 422);
  assert.equal(galat(null).status, 400);
  assert.equal(galat([]).status, 400);
});

test('daftar alasan di kode sama persis dengan CHECK di migrasi 012', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/012_laporan_soal.sql'), 'utf8');
  const dalamCheck = [...sql.match(/alasan\s+TEXT[\s\S]*?\)\)/)[0].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(dalamCheck.sort(), [...KODE_ALASAN].sort());
  assert.equal(ALASAN.length, KODE_ALASAN.length);
  assert.ok(ALASAN.every((a) => a.label && a.label.length > 3));
});
