'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { requireSuper } = require('../src/middleware/admin');
const lembaga = require('../src/services/lembagaService');
const { parsePutusan, putuskan, antrean } = require('../src/services/persetujuanService');
const { ambilSoal, ubahSoal } = require('../src/services/adminSoalService');
const { ringkasan, daftarSiswa, detailSiswa } = require('../src/services/adminService');

const galat = async (fn) => { try { await fn(); } catch (e) { return e; } return null; };
const super_ = { id: 's', role: 'super_admin', institutionId: null };
const lemA = { id: 'a', role: 'admin_lembaga', institutionId: '7' };

test('requireSuper: hanya super admin', () => {
  let hasil;
  requireSuper({ admin: super_ }, {}, (e) => { hasil = e || 'lolos'; });
  assert.equal(hasil, 'lolos');
  requireSuper({ admin: lemA }, {}, (e) => { hasil = e; });
  assert.equal(hasil.status, 403);
  requireSuper({}, {}, (e) => { hasil = e; });
  assert.equal(hasil.status, 403);
});

test('kode undangan: 8 karakter tanpa huruf/angka yang membingungkan; normalisasi menghapus spasi dan strip', () => {
  for (let i = 0; i < 200; i += 1) assert.match(lembaga.buatKode(), /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(lembaga.normalKode(' k7m2-pq9x '), 'K7M2PQ9X');
  assert.equal(galat(() => lembaga.parseNama({ nama: 'ab' })) !== null, true);
  assert.equal(lembaga.parseNama({ nama: '  SMA   Negeri 1  ' }), 'SMA Negeri 1');
  assert.throws(() => lembaga.parseNama({ nama: 'x'.repeat(101) }), (e) => e.status === 422);
});

test('gabungLembaga: kode salah panjang ditolak; akun admin tidak boleh; kode tak dikenal 404; sukses mengikat', async () => {
  const pool = (role, lem) => ({
    query: async (sql) => {
      if (/SELECT role FROM students/.test(sql)) return { rows: role ? [{ role }] : [] };
      if (/FROM institutions WHERE kode_undangan/.test(sql)) return { rows: lem ? [{ id: 3, nama: 'SMA 1' }] : [] };
      return { rows: [] };
    },
  });
  assert.equal((await galat(() => lembaga.gabungLembaga(pool('siswa', true), 'u', { kode: 'abc' }))).status, 422);
  assert.equal((await galat(() => lembaga.gabungLembaga(pool('admin_lembaga', true), 'u', { kode: 'K7M2PQ9X' }))).status, 409);
  assert.equal((await galat(() => lembaga.gabungLembaga(pool('siswa', false), 'u', { kode: 'K7M2PQ9X' }))).status, 404);
  assert.deepEqual(await lembaga.gabungLembaga(pool('siswa', true), 'u', { kode: 'k7m2-pq9x' }), { lembaga: { id: '3', nama: 'SMA 1' } });
});

test('tambahAdmin: email tidak valid, lembaga/akun tidak ada, dan super admin ditolak', async () => {
  const pool = (lem, akun) => ({
    query: async (sql) => {
      if (/FROM institutions WHERE id/.test(sql)) return { rows: lem ? [{ id: 1 }] : [] };
      if (/FROM students WHERE lower\(email\)/.test(sql)) return { rows: akun ? [akun] : [] };
      return { rows: [] };
    },
  });
  assert.equal((await galat(() => lembaga.tambahAdmin(pool(true, null), '1', { email: 'bukan-email' }))).status, 422);
  assert.equal((await galat(() => lembaga.tambahAdmin(pool(false, null), '1', { email: 'a@b.id' }))).status, 404);
  assert.equal((await galat(() => lembaga.tambahAdmin(pool(true, null), '1', { email: 'a@b.id' }))).code, 'AKUN_BELUM_ADA');
  assert.equal((await galat(() => lembaga.tambahAdmin(pool(true, { id: 'u', role: 'super_admin' }), '1', { email: 'a@b.id' }))).status, 409);
  assert.deepEqual(await lembaga.tambahAdmin(pool(true, { id: 'u', role: 'siswa' }), '1', { email: 'A@B.id' }), { id: 'u', email: 'a@b.id' });
});

test('parsePutusan: pilih ids ATAU lembaga_id, menolak wajib catatan', () => {
  assert.deepEqual(parsePutusan({ aksi: 'setujui', ids: ['5', 5, '6'] }), { aksi: 'setujui', ids: ['5', '6'], lembagaId: null, catatan: null });
  assert.equal(parsePutusan({ aksi: 'setujui', lembaga_id: 3 }).lembagaId, '3');
  assert.equal(galat(() => parsePutusan({ aksi: 'tolak', ids: ['1'] })) !== null, true);
  assert.throws(() => parsePutusan({ aksi: 'tolak', ids: ['1'] }), (e) => e.status === 422);
  assert.throws(() => parsePutusan({ aksi: 'setujui', ids: ['1'], lembaga_id: '2' }), (e) => e.status === 422);
  assert.throws(() => parsePutusan({ aksi: 'setujui' }), (e) => e.status === 422);
  assert.throws(() => parsePutusan({ aksi: 'x', ids: ['1'] }), (e) => e.status === 422);
});

test('putuskan: setuju mengaktifkan soal; tolak menyimpan catatan dan tidak mengaktifkan', async () => {
  let p;
  const pool = { query: async (sql, params) => { p = { sql, params }; return { rowCount: 4, rows: [] }; } };
  assert.deepEqual(await putuskan(pool, { aksi: 'setujui', ids: ['1'], lembagaId: null, catatan: null }), { diproses: 4 });
  assert.deepEqual(p.params.slice(0, 3), ['disetujui', null, true]);
  await putuskan(pool, { aksi: 'tolak', ids: null, lembagaId: '3', catatan: 'kunci salah' });
  assert.deepEqual(p.params, ['ditolak', 'kunci salah', false, null, '3']);
  assert.match(p.sql, /approval_status = 'menunggu'/);
});

test('antrean: admin lembaga dibatasi ke lembaganya; super admin bawaannya hanya yang menunggu', async () => {
  let p;
  const pool = { query: async (sql, params) => { p = params; return { rows: [] }; } };
  await antrean(pool, lemA, {});
  assert.deepEqual(p, ['7', null]);
  await antrean(pool, super_, {});
  assert.deepEqual(p, [null, 'menunggu']);
  await antrean(pool, super_, { status: 'semua' });
  assert.deepEqual(p, [null, 'menunggu']); // 'semua' bukan status sah = bawaan; super memakai status=disetujui/ditolak untuk filter lain
});

const poolSoal = (q) => ({
  query: async (sql) => {
    if (/FROM questions q JOIN topics/.test(sql)) return { rows: q ? [q] : [] };
    return { rows: [] };
  },
});
const soalRow = (o) => ({ id: 9, topic_id: 1, level_soal: 1, soal_teks: 'x', opsi_jawaban: [], kunci_jawaban: 'A', is_active: false,
  is_domain0: false, institution_id: 7, approval_status: 'menunggu', topik: 'T', subtes: 'PU', ...o });

test('ambilSoal: admin lembaga hanya soal lembaganya yang belum disetujui', async () => {
  assert.equal((await ambilSoal(poolSoal(soalRow({})), '9', lemA)).id, '9');
  assert.equal((await galat(() => ambilSoal(poolSoal(soalRow({ institution_id: 8 })), '9', lemA))).status, 404);
  assert.equal((await galat(() => ambilSoal(poolSoal(soalRow({ institution_id: null })), '9', lemA))).status, 404);
  assert.equal((await galat(() => ambilSoal(poolSoal(soalRow({ approval_status: 'disetujui' })), '9', lemA))).status, 403);
  assert.equal((await ambilSoal(poolSoal(soalRow({ approval_status: 'disetujui', institution_id: null })), '9', super_)).id, '9');
});

test('ubahSoal: admin lembaga tidak bisa mengubah soal lembaga lain (tanpa menulis apa pun)', async () => {
  let konek = false;
  const pool = { ...poolSoal(soalRow({ institution_id: 8 })), connect: async () => { konek = true; throw new Error('tidak boleh'); } };
  const e = await galat(() => ubahSoal(pool, '9', { level: 1 }, lemA));
  assert.equal(e.status, 404);
  assert.equal(konek, false);
});

test('ringkasan, daftarSiswa, detailSiswa: admin lembaga membawa id lembaganya ke kueri', async () => {
  const jejak = [];
  const pool = { query: async (sql, params) => { jejak.push(params); return { rows: [{ lembaga: 'SMA 1' }] }; } };
  const r = await ringkasan(pool, lemA);
  assert.equal(r.peran, 'admin_lembaga');
  assert.deepEqual(jejak[0], ['7']);
  await daftarSiswa(pool, lemA);
  assert.deepEqual(jejak.at(-1), ['7']);
  await daftarSiswa(pool, super_);
  assert.deepEqual(jejak.at(-1), [null]);
  const e = await galat(() => detailSiswa({ query: async () => ({ rows: [] }) }, '00000000-0000-0000-0000-000000000000', lemA));
  assert.equal(e.status, 404);
  assert.equal((await ringkasan({ query: async () => ({ rows: [{ siswa: 1 }] }) }, super_)).peran, 'super_admin');
});

test('migrasi 014 memuat peran, lembaga, dan status persetujuan', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/014_peran_dan_lembaga.sql'), 'utf8');
  for (const k of ['institutions', 'role', 'institution_id', 'approval_status', 'super_admin']) assert.match(sql, new RegExp(k));
});
