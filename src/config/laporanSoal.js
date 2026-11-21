'use strict';

/** Pilihan alasan lapor soal. Urutan = urutan tampil di aplikasi. `kode` harus sama dengan CHECK di migrasi 012. */
const ALASAN = Object.freeze([
  { kode: 'gambar_tidak_muncul', label: 'Gambar tidak muncul' },
  { kode: 'soal_tidak_lengkap', label: 'Soal tidak lengkap / terpotong' },
  { kode: 'tidak_ada_jawaban_benar', label: 'Tidak ada pilihan yang benar' },
  { kode: 'lebih_dari_satu_jawaban_benar', label: 'Lebih dari satu pilihan benar' },
  { kode: 'kunci_salah', label: 'Kunci jawaban salah' },
  { kode: 'pembahasan_salah', label: 'Pembahasan salah / tidak sesuai' },
  { kode: 'salah_ketik', label: 'Salah ketik / tulisan janggal' },
  { kode: 'rumus_rusak', label: 'Rumus atau simbol rusak' },
  { kode: 'lainnya', label: 'Lainnya (tulis catatan)' },
]);

module.exports = Object.freeze({
  ALASAN,
  KODE_ALASAN: Object.freeze(ALASAN.map((a) => a.kode)),
  CATATAN_MAKS: 500,
  AMBANG_SEMBUNYI_OTOMATIS: 3, // jumlah siswa BERBEDA yang melapor soal yang sama (status baru/ditinjau) -> soal disembunyikan otomatis
  BATAS_PER_HARI: 40, // laporan baru per siswa per 24 jam, supaya tidak dipakai untuk membanjiri
});
