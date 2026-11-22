'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequireAdmin } = require('../src/middleware/admin');
const { parseTindak } = require('../src/services/adminService');
const { sembunyikanBilaPerlu, laporSoal } = require('../src/services/laporSoalService');
const { AMBANG_SEMBUNYI_OTOMATIS } = require('../src/config/laporanSoal');

const jalankan = async (mw, req) => {
  let hasil;
  await mw(req, {}, (err) => { hasil = err || 'lolos'; });
  return hasil;
};

test('requireAdmin: lolos untuk admin lembaga dan super admin, menolak siswa; req.admin terisi', async () => {
  const pool = (role, inst = null) => ({ query: async () => ({ rows: role === null ? [] : [{ role, institution_id: inst }] }) });
  const req1 = { user: { id: 'x' } };
  assert.equal(await jalankan(createRequireAdmin({ pool: pool('super_admin') }), req1), 'lolos');
  assert.deepEqual(req1.admin, { id: 'x', role: 'super_admin', institutionId: null });
  const req2 = { user: { id: 'y' } };
  assert.equal(await jalankan(createRequireAdmin({ pool: pool('admin_lembaga', 7) }), req2), 'lolos');
  assert.equal(req2.admin.institutionId, '7');
  assert.equal((await jalankan(createRequireAdmin({ pool: pool('siswa') }), { user: { id: 'x' } })).status, 403);
  assert.equal((await jalankan(createRequireAdmin({ pool: pool(null) }), { user: { id: 'x' } })).status, 403);
  assert.equal((await jalankan(createRequireAdmin({ pool: pool('super_admin') }), {})).status, 401);
});

test('parseTindak: status wajib sah, soal_aktif harus boolean', () => {
  assert.deepEqual(parseTindak({ status: 'selesai' }), { status: 'selesai', soalAktif: undefined });
  assert.deepEqual(parseTindak({ status: 'ditinjau', soal_aktif: false }), { status: 'ditinjau', soalAktif: false });
  const galat = (b) => { try { parseTindak(b); } catch (e) { return e; } return null; };
  assert.equal(galat({ status: 'baru' }).status, 422);
  assert.equal(galat({ status: 'selesai', soal_aktif: 'ya' }).status, 422);
  assert.equal(galat(null).status, 400);
});

test('sembunyikanBilaPerlu: memakai ambang dari config dan mengembalikan apakah soal disembunyikan', async () => {
  let param;
  const pool = (n) => ({ query: async (sql, p) => { param = { sql, p }; return { rows: Array(n).fill({ id: 1 }) }; } });
  assert.equal(await sembunyikanBilaPerlu(pool(1), '5'), true);
  assert.deepEqual(param.p, ['5', AMBANG_SEMBUNYI_OTOMATIS]);
  assert.match(param.sql, /hidden_reason = 'laporan_otomatis'/);
  assert.match(param.sql, /count\(DISTINCT r\.student_id\)/);
  assert.equal(await sembunyikanBilaPerlu(pool(0), '5'), false);
});

test('laporSoal: laporan baru memicu pemeriksaan sembunyi; laporan ulang tidak', async () => {
  const jejak = [];
  const buat = (ulang) => ({
    query: async (sql) => {
      jejak.push(sql.replace(/\s+/g, ' ').slice(0, 40));
      if (/FROM student_attempt_questions/.test(sql)) return { rows: [{}] };
      if (/^\s*UPDATE question_reports/.test(sql)) return { rows: ulang ? [{ id: 9 }] : [] };
      if (/count\(\*\)::int AS n/.test(sql)) return { rows: [{ n: 0 }] };
      if (/INSERT INTO question_reports/.test(sql)) return { rows: [{ id: 10 }] };
      return { rows: [] };
    },
  });
  const arg = { questionId: '5', alasan: 'kunci_salah', catatan: null };
  jejak.length = 0;
  await laporSoal(buat(false), 's1', arg);
  assert.ok(jejak.some((j) => j.startsWith('UPDATE questions q')));
  jejak.length = 0;
  await laporSoal(buat(true), 's1', arg);
  assert.ok(!jejak.some((j) => j.startsWith('UPDATE questions q')));
});

test('migrasi 013 menambah kolom is_admin dan hidden_reason; halaman admin terpasang di App', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/013_admin_dan_sembunyi_otomatis.sql'), 'utf8');
  assert.match(sql, /is_admin/);
  assert.match(sql, /hidden_reason/);
  const app = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  assert.match(app, /\/api\/admin/);
});
