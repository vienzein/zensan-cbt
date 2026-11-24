'use strict';

/** Fungsi murni untuk laporan lembaga: status keaktifan siswa dan ringkasan kelas. */

const HARI_MS = 86400000;
const hariKe = (s) => Math.round(Date.parse(`${s}T00:00:00Z`) / HARI_MS);

const STATUS = Object.freeze({
  AKTIF: 'aktif',
  PERLU_DORONGAN: 'perlu_dorongan',
  PERLU_PERHATIAN: 'perlu_perhatian',
  BELUM_MULAI: 'belum_mulai',
});
const URUT_STATUS = Object.freeze([STATUS.PERLU_PERHATIAN, STATUS.PERLU_DORONGAN, STATUS.BELUM_MULAI, STATUS.AKTIF]);

const BATAS_PERHATIAN_HARI = 7;
const BATAS_DORONGAN_HARI = 3;
const BATAS_AKURASI_DORONGAN = 55;

/** Jumlah hari dari tanggal terakhir berlatih sampai hari ini (null bila belum pernah). Keduanya 'YYYY-MM-DD'. */
function hariSejak(terakhirHari, hariIni) {
  if (!terakhirHari) return null;
  return Math.max(0, hariKe(hariIni) - hariKe(terakhirHari));
}

/**
 * Status keaktifan siswa untuk guru:
 * belum mulai (0 jawaban) | perlu perhatian (7 hari atau lebih tidak berlatih) |
 * perlu dorongan (3 hari atau lebih, atau akurasi di bawah 55%) | aktif.
 */
function statusSiswa({ jawaban, akurasi, hari }) {
  if (!jawaban) return STATUS.BELUM_MULAI;
  if (hari !== null && hari >= BATAS_PERHATIAN_HARI) return STATUS.PERLU_PERHATIAN;
  if ((hari !== null && hari >= BATAS_DORONGAN_HARI) || (akurasi !== null && akurasi < BATAS_AKURASI_DORONGAN)) return STATUS.PERLU_DORONGAN;
  return STATUS.AKTIF;
}

/** Urutan tabel: siswa yang butuh perhatian dulu, lalu nama. */
function urutkanSiswa(daftar) {
  return [...daftar].sort(
    (a, b) => URUT_STATUS.indexOf(a.status) - URUT_STATUS.indexOf(b.status) || String(a.nama).localeCompare(String(b.nama), 'id'),
  );
}

const bulat = (x) => Math.round(x);

/** Ringkasan kelas dari daftar siswa yang sudah dihitung (lihat laporanLembagaService). */
function ringkasKelas(daftar) {
  const total = daftar.length;
  const aktif7 = daftar.filter((s) => s.hari_sejak !== null && s.hari_sejak < 7).length;
  const perhatian = daftar.filter((s) => s.status === STATUS.PERLU_PERHATIAN).length;
  const sesi = daftar.reduce((n, s) => n + s.sesi_30_hari, 0);
  const punyaRr = daftar.filter((s) => s.rr_rata !== null);
  const rr = punyaRr.length ? bulat(punyaRr.reduce((n, s) => n + s.rr_rata, 0) / punyaRr.length) : null;
  const sudahMulai = daftar.filter((s) => s.sesi_30_hari > 0);
  return {
    siswa: total,
    siswa_aktif_7_hari: aktif7,
    sesi_30_hari: sesi,
    sesi_rata_per_siswa: total ? bulat(sesi / total) : 0,
    rr_rata: rr,
    perlu_perhatian: perhatian,
    sudah_berlatih_30_hari: sudahMulai.length,
  };
}

module.exports = { STATUS, hariSejak, statusSiswa, urutkanSiswa, ringkasKelas, BATAS_PERHATIAN_HARI, BATAS_DORONGAN_HARI, BATAS_AKURASI_DORONGAN };
