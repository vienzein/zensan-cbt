'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseKelas, parseLinkMeet, statusKelas, parseProgram, parseBeriAkses } = require('../src/services/kelasLogic');
const svc = require('../src/services/kelasService');

const kode = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
const kodeAsync = async (fn) => { try { await fn(); return null; } catch (e) { return e.code; } };

const dasar = {
  program_kode: 'kelas-snbt', judul: 'Penalaran Umum: Silogisme', deskripsi: 'Bawa catatan', pengajar: 'Alvien',
  mulai_pada: '2026-11-29T15:00:00+07:00', selesai_pada: '2026-11-29T17:00:00+07:00', link_meet: 'https://meet.google.com/abc-defg-hij',
};

test('parseLinkMeet: hanya Google Meet lewat https', () => {
  assert.equal(parseLinkMeet('https://meet.google.com/abc-defg-hij'), 'https://meet.google.com/abc-defg-hij');
  assert.equal(parseLinkMeet('  https://meet.google.com/abc-defg-hij  '), 'https://meet.google.com/abc-defg-hij');
  assert.equal(kode(() => parseLinkMeet('http://meet.google.com/abc-defg-hij')), 'VALIDATION_ERROR');
  assert.equal(kode(() => parseLinkMeet('https://zoom.us/j/123')), 'VALIDATION_ERROR');
  assert.equal(kode(() => parseLinkMeet('https://meet.google.com.evil.com/abc')), 'VALIDATION_ERROR');
  assert.equal(kode(() => parseLinkMeet('https://meet.google.com/')), 'VALIDATION_ERROR');
  assert.equal(kode(() => parseLinkMeet('bukan tautan')), 'VALIDATION_ERROR');
  assert.equal(kode(() => parseLinkMeet('')), 'VALIDATION_ERROR');
});

test('parseKelas: data benar diterima dan dirapikan', () => {
  const k = parseKelas({ ...dasar, judul: '  Penalaran   Umum  ', pengajar: '' });
  assert.equal(k.judul, 'Penalaran Umum');
  assert.equal(k.pengajar, null);
  assert.equal(k.programKode, 'kelas-snbt');
  assert.equal(k.selesai - k.mulai, 2 * 3600 * 1000);
});

test('parseKelas: selesai <= mulai, lebih dari 12 jam, waktu rusak, judul pendek ditolak', () => {
  assert.equal(kode(() => parseKelas({ ...dasar, selesai_pada: dasar.mulai_pada })), 'VALIDATION_ERROR');
  assert.equal(kode(() => parseKelas({ ...dasar, selesai_pada: '2026-11-29T14:00:00+07:00' })), 'VALIDATION_ERROR');
  assert.equal(kode(() => parseKelas({ ...dasar, selesai_pada: '2026-11-30T04:00:00+07:00' })), 'VALIDATION_ERROR');
  assert.equal(kode(() => parseKelas({ ...dasar, mulai_pada: 'kemarin' })), 'VALIDATION_ERROR');
  assert.equal(kode(() => parseKelas({ ...dasar, judul: 'ab' })), 'VALIDATION_ERROR');
  assert.equal(kode(() => parseKelas(null)), 'BAD_REQUEST');
});

test('statusKelas: berlangsung, segera (15 menit), akan datang, selesai', () => {
  const m = '2026-11-29T08:00:00Z';
  const s = '2026-11-29T10:00:00Z';
  assert.equal(statusKelas(m, s, '2026-11-29T07:00:00Z'), 'akan_datang');
  assert.equal(statusKelas(m, s, '2026-11-29T07:45:00Z'), 'segera');
  assert.equal(statusKelas(m, s, '2026-11-29T08:00:00Z'), 'berlangsung');
  assert.equal(statusKelas(m, s, '2026-11-29T09:59:00Z'), 'berlangsung');
  assert.equal(statusKelas(m, s, '2026-11-29T10:00:00Z'), 'selesai');
});

test('parseProgram: baru wajib kode, nama, harga; kode dinormalkan huruf kecil', () => {
  const p = parseProgram({ kode: 'Kelas-SNBT', nama: 'Kelas SNBT Reguler', harga_rupiah: 250000, durasi_hari: 90 }, { baru: true });
  assert.equal(p.kode, 'kelas-snbt');
  assert.equal(p.hargaRupiah, 250000);
  assert.equal(p.durasiHari, 90);
  assert.equal(kode(() => parseProgram({ kode: 'Ab C', nama: 'Kelas' }, { baru: true })), 'VALIDATION_ERROR');
  assert.equal(kode(() => parseProgram({ kode: 'x', nama: 'Kelas' }, { baru: true })), 'VALIDATION_ERROR');
  assert.equal(kode(() => parseProgram({ kode: 'kelas-a', nama: 'Kelas A', harga_rupiah: -1 }, { baru: true })), 'VALIDATION_ERROR');
  assert.equal(kode(() => parseProgram({ kode: 'kelas-a', nama: 'Kelas A', harga_rupiah: 1.5 }, { baru: true })), 'VALIDATION_ERROR');
});

test('parseProgram: ubah hanya memvalidasi kolom yang dikirim; durasi kosong = tanpa batas', () => {
  assert.deepEqual(parseProgram({ harga_rupiah: 99000 }, { baru: false }), { hargaRupiah: 99000 });
  assert.equal(parseProgram({ durasi_hari: null }, { baru: false }).durasiHari, null);
  assert.equal(parseProgram({ is_active: false }, { baru: false }).isActive, false);
  assert.equal(kode(() => parseProgram({ is_active: 'ya' }, { baru: false })), 'VALIDATION_ERROR');
  assert.equal(kode(() => parseProgram({ durasi_hari: 0 }, { baru: false })), 'VALIDATION_ERROR');
});

test('parseBeriAkses: email dinormalkan, hari opsional', () => {
  const a = parseBeriAkses({ email: ' Rina@Contoh.TEST ', program_kode: 'cbt' });
  assert.deepEqual(a, { email: 'rina@contoh.test', programKode: 'cbt', hari: null });
  assert.equal(parseBeriAkses({ email: 'a@b.co', program_kode: 'cbt', hari: '14' }).hari, 14);
  assert.equal(kode(() => parseBeriAkses({ email: 'bukan-email', program_kode: 'cbt' })), 'VALIDATION_ERROR');
  assert.equal(kode(() => parseBeriAkses({ email: 'a@b.co', program_kode: 'cbt', hari: 0 })), 'VALIDATION_ERROR');
});

// ---------- service dengan pool palsu ----------

const SID = '11111111-1111-1111-1111-111111111111';

test('kelasSiswa: menambahkan status ke tiap kelas', async () => {
  const sekarang = Date.now();
  const pool = {
    async query() {
      return { rows: [{
        id: 7, program_kode: 'kelas-snbt', program_nama: 'Kelas SNBT', judul: 'PU', deskripsi: '', pengajar: null,
        mulai_pada: new Date(sekarang - 10 * 60000), selesai_pada: new Date(sekarang + 50 * 60000),
        link_meet: 'https://meet.google.com/abc-defg-hij', dibatalkan: false,
      }] };
    },
  };
  const [k] = await svc.kelasSiswa(pool, SID);
  assert.equal(k.id, '7');
  assert.equal(k.status, 'berlangsung');
  assert.equal(k.program.nama, 'Kelas SNBT');
});

test('buatKelas: program tidak ada ditolak 404 tanpa menulis', async () => {
  let menulis = false;
  const pool = { async query(sql) { if (/INSERT/.test(sql)) menulis = true; return { rows: [] }; } };
  assert.equal(await kodeAsync(() => svc.buatKelas(pool, SID, dasar)), 'PROGRAM_TIDAK_ADA');
  assert.equal(menulis, false);
});

function poolTx({ siswa = { id: SID, email: 'rina@contoh.test' }, prog = { kode: 'cbt', nama: 'Drill', durasi_hari: 30 }, lama = null }) {
  const tulis = [];
  const client = {
    async query(sql, params) {
      if (/FROM students/.test(sql)) return { rows: siswa ? [siswa] : [] };
      if (/FROM programs/.test(sql)) return { rows: prog ? [prog] : [] };
      if (/FOR UPDATE/.test(sql)) return { rows: lama ? [lama] : [] };
      if (/INSERT INTO student_access/.test(sql)) tulis.push(params);
      return { rows: [] };
    },
    release() {},
  };
  return { tulis, connect: async () => client };
}

test('beriAkses: akses baru mengikuti durasi program, dicatat sumber admin', async () => {
  const pool = poolTx({});
  const r = await svc.beriAkses(pool, { email: 'Rina@contoh.test', program_kode: 'cbt' });
  assert.equal(r.program.kode, 'cbt');
  const hari = Math.round((new Date(r.berlaku_sampai).getTime() - Date.now()) / 86400000);
  assert.equal(hari, 30);
  assert.equal(pool.tulis.length, 1);
});

test('beriAkses: hari eksplisit menimpa durasi program; durasi kosong = selamanya', async () => {
  const r1 = await svc.beriAkses(poolTx({}), { email: 'a@b.co', program_kode: 'cbt', hari: 7 });
  assert.equal(Math.round((new Date(r1.berlaku_sampai).getTime() - Date.now()) / 86400000), 7);
  const r2 = await svc.beriAkses(poolTx({ prog: { kode: 'cbt', nama: 'Drill', durasi_hari: null } }), { email: 'a@b.co', program_kode: 'cbt' });
  assert.equal(r2.berlaku_sampai, null);
});

test('beriAkses: perpanjangan menyambung dari sisa masa aktif', async () => {
  const lama = { berlaku_sampai: new Date(Date.now() + 10 * 86400000) };
  const r = await svc.beriAkses(poolTx({ lama }), { email: 'a@b.co', program_kode: 'cbt', hari: 30 });
  assert.equal(Math.round((new Date(r.berlaku_sampai).getTime() - Date.now()) / 86400000), 40);
});

test('beriAkses: siswa atau program tidak ada ditolak 404', async () => {
  assert.equal(await kodeAsync(() => svc.beriAkses(poolTx({ siswa: null }), { email: 'a@b.co', program_kode: 'cbt' })), 'SISWA_TIDAK_DITEMUKAN');
  assert.equal(await kodeAsync(() => svc.beriAkses(poolTx({ prog: null }), { email: 'a@b.co', program_kode: 'cbt' })), 'PROGRAM_TIDAK_ADA');
});

test('ubahKelas dan batalkanKelas: id bukan angka ditolak; tidak ada = 404', async () => {
  const pool = { async query() { return { rowCount: 0, rows: [{ kode: 'kelas-snbt' }] }; } };
  assert.equal(await kodeAsync(() => svc.batalkanKelas(pool, 'abc')), 'VALIDATION_ERROR');
  assert.equal(await kodeAsync(() => svc.batalkanKelas(pool, '5')), 'KELAS_TIDAK_ADA');
  assert.equal(await kodeAsync(() => svc.ubahKelas(pool, '5', dasar)), 'KELAS_TIDAK_ADA');
});
