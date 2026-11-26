'use strict';

// WAJIB_BAYAR_CBT dibaca saat modul config dimuat, jadi harus diset sebelum require.
process.env.WAJIB_BAYAR_CBT = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWajibAkses } = require('../src/middleware/akses');

function poolPalsu({ role = 'siswa', akses = [] }) {
  return {
    async query(sql) {
      if (/FROM students/.test(sql)) return { rows: [{ role }] };
      if (/FROM student_access/.test(sql)) return { rows: akses };
      throw new Error(`query tak terduga: ${sql}`);
    },
  };
}
const jalankan = (mw, req) => new Promise((resolve) => mw(req, {}, (err) => resolve(err)));
const req = { user: { id: '11111111-1111-1111-1111-111111111111' } };

test('gerbang: siswa tanpa akses ditolak 402 AKSES_DIPERLUKAN', async () => {
  const err = await jalankan(createWajibAkses({ pool: poolPalsu({}), kode: 'cbt' }), req);
  assert.equal(err.status, 402);
  assert.equal(err.code, 'AKSES_DIPERLUKAN');
  assert.deepEqual(err.details, { program: 'cbt' });
});

test('gerbang: akses yang sudah habis ditolak', async () => {
  const pool = poolPalsu({ akses: [{ berlaku_sampai: '2020-01-01T00:00:00Z' }] });
  const err = await jalankan(createWajibAkses({ pool, kode: 'cbt' }), req);
  assert.equal(err.code, 'AKSES_DIPERLUKAN');
});

test('gerbang: akses aktif lolos', async () => {
  const pool = poolPalsu({ akses: [{ berlaku_sampai: '2999-01-01T00:00:00Z' }] });
  assert.equal(await jalankan(createWajibAkses({ pool, kode: 'cbt' }), req), undefined);
});

test('gerbang: akses tanpa batas lolos', async () => {
  const pool = poolPalsu({ akses: [{ berlaku_sampai: null }] });
  assert.equal(await jalankan(createWajibAkses({ pool, kode: 'cbt' }), req), undefined);
});

test('gerbang: admin tidak pernah dikunci', async () => {
  const pool = poolPalsu({ role: 'super_admin' });
  assert.equal(await jalankan(createWajibAkses({ pool, kode: 'cbt' }), req), undefined);
});

test('gerbang: program lain yang tidak wajib bayar lolos tanpa cek', async () => {
  const pool = { query: async () => { throw new Error('tidak boleh query'); } };
  assert.equal(await jalankan(createWajibAkses({ pool, kode: 'kelas' }), req), undefined);
});

test('gerbang: tanpa login ditolak 401', async () => {
  const err = await jalankan(createWajibAkses({ pool: poolPalsu({}), kode: 'cbt' }), {});
  assert.equal(err.status, 401);
});
