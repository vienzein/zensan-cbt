'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hariSejak, statusSiswa, urutkanSiswa, ringkasKelas, STATUS } = require('../src/services/laporanLembaga');

test('hariSejak: selisih hari kalender, null bila belum pernah', () => {
  assert.equal(hariSejak(null, '2026-11-24'), null);
  assert.equal(hariSejak('2026-11-24', '2026-11-24'), 0);
  assert.equal(hariSejak('2026-11-21', '2026-11-24'), 3);
  assert.equal(hariSejak('2026-10-31', '2026-11-02'), 2);
});

test('statusSiswa: belum mulai, perlu perhatian, perlu dorongan, aktif', () => {
  assert.equal(statusSiswa({ jawaban: 0, akurasi: null, hari: null }), STATUS.BELUM_MULAI);
  assert.equal(statusSiswa({ jawaban: 40, akurasi: 80, hari: 7 }), STATUS.PERLU_PERHATIAN);
  assert.equal(statusSiswa({ jawaban: 40, akurasi: 80, hari: 6 }), STATUS.PERLU_DORONGAN);
  assert.equal(statusSiswa({ jawaban: 40, akurasi: 80, hari: 3 }), STATUS.PERLU_DORONGAN);
  assert.equal(statusSiswa({ jawaban: 40, akurasi: 54, hari: 0 }), STATUS.PERLU_DORONGAN);
  assert.equal(statusSiswa({ jawaban: 40, akurasi: 55, hari: 2 }), STATUS.AKTIF);
});

test('urutkanSiswa: perlu perhatian dulu, lalu dorongan, belum mulai, aktif; sama status urut nama', () => {
  const u = urutkanSiswa([
    { nama: 'Rina', status: STATUS.AKTIF },
    { nama: 'Bagas', status: STATUS.BELUM_MULAI },
    { nama: 'Hanif', status: STATUS.PERLU_PERHATIAN },
    { nama: 'Dewi', status: STATUS.PERLU_DORONGAN },
    { nama: 'Andi', status: STATUS.AKTIF },
  ]);
  assert.deepEqual(u.map((x) => x.nama), ['Hanif', 'Dewi', 'Bagas', 'Andi', 'Rina']);
});

test('ringkasKelas: hitung aktif 7 hari, perhatian, sesi, rata-rata RR', () => {
  const r = ringkasKelas([
    { hari_sejak: 0, status: STATUS.AKTIF, sesi_30_hari: 10, rr_rata: 40 },
    { hari_sejak: 8, status: STATUS.PERLU_PERHATIAN, sesi_30_hari: 2, rr_rata: 20 },
    { hari_sejak: null, status: STATUS.BELUM_MULAI, sesi_30_hari: 0, rr_rata: null },
  ]);
  assert.equal(r.siswa, 3);
  assert.equal(r.siswa_aktif_7_hari, 1);
  assert.equal(r.perlu_perhatian, 1);
  assert.equal(r.sesi_30_hari, 12);
  assert.equal(r.sesi_rata_per_siswa, 4);
  assert.equal(r.rr_rata, 30);
  assert.equal(r.sudah_berlatih_30_hari, 2);
});

test('ringkasKelas: kelas kosong tidak error', () => {
  const r = ringkasKelas([]);
  assert.equal(r.siswa, 0);
  assert.equal(r.rr_rata, null);
  assert.equal(r.sesi_rata_per_siswa, 0);
});
