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

// ---------- Jatah gratis harian ----------
const { createJatahHarian } = require('../src/middleware/akses');

function poolJatah({ role = 'siswa', akses = [], terpakai = 0 }) {
  return {
    async query(sql) {
      if (/FROM students/.test(sql)) return { rows: [{ role }] };
      if (/FROM student_access/.test(sql)) return { rows: akses };
      if (/FROM student_attempts/.test(sql)) return { rows: [{ n: terpakai }] };
      throw new Error(`query tak terduga: ${sql}`);
    },
  };
}
const jalankanJatah = async (pool, reqAwal = { user: { id: '11111111-1111-1111-1111-111111111111' } }) => {
  const r = { ...reqAwal };
  const err = await new Promise((resolve) => createJatahHarian({ pool })(r, {}, (e) => resolve(e)));
  return { err, req: r };
};

test('jatah: masih ada sisa, lolos dan sisa dicatat di req', async () => {
  const { err, req: r } = await jalankanJatah(poolJatah({ terpakai: 4 }));
  assert.equal(err, undefined);
  assert.equal(r.jatahSisa, 6);
});

test('jatah: habis ditolak 402 dengan alasan jatah_habis', async () => {
  const { err } = await jalankanJatah(poolJatah({ terpakai: 10 }));
  assert.equal(err.status, 402);
  assert.equal(err.code, 'AKSES_DIPERLUKAN');
  assert.equal(err.details.alasan, 'jatah_habis');
  assert.equal(err.details.batas, 10);
});

test('jatah: terpakai melebihi batas tetap ditolak', async () => {
  const { err } = await jalankanJatah(poolJatah({ terpakai: 25 }));
  assert.equal(err.code, 'AKSES_DIPERLUKAN');
});

test('jatah: akun berlangganan aktif tanpa batas', async () => {
  const { err, req: r } = await jalankanJatah(poolJatah({ terpakai: 99, akses: [{ berlaku_sampai: '2999-01-01T00:00:00Z' }] }));
  assert.equal(err, undefined);
  assert.equal(r.jatahSisa, undefined);
});

test('jatah: langganan yang sudah habis kembali ke paket gratis', async () => {
  const { err } = await jalankanJatah(poolJatah({ terpakai: 10, akses: [{ berlaku_sampai: '2020-01-01T00:00:00Z' }] }));
  assert.equal(err.code, 'AKSES_DIPERLUKAN');
});

test('jatah: admin tidak dibatasi', async () => {
  const { err } = await jalankanJatah(poolJatah({ role: 'admin_lembaga', terpakai: 99 }));
  assert.equal(err, undefined);
});

test('jatah: tanpa login ditolak 401', async () => {
  const { err } = await jalankanJatah(poolJatah({}), {});
  assert.equal(err.status, 401);
});
