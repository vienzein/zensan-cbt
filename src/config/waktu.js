'use strict';

/**
 * Waktu per soal (detik) = waktu dasar subtes (rata-rata ujian SNBT asli) x faktor level,
 * dibulatkan ke kelipatan 5 detik. Level 3 dan 4 memakai waktu asli SNBT; Level 1-2 lebih pendek
 * karena soalnya lebih sederhana. Angka ini hanya nilai bawaan saat impor soal: waktu tiap soal tetap
 * disimpan di `questions.target_waktu_detik` dan boleh ditimpa per soal.
 */
const WAKTU_DASAR = Object.freeze({
  PU: 60, // 30 soal / 30 menit
  KL: 60, // gabungan PPU (45) dan PBM (75); usulan, tim akademik menetapkan angka asli
  NUM: 90, // Level 3 = 90 detik (ditetapkan pengguna); Level 1/2 diturunkan lewat FAKTOR_LEVEL
  LBI: 90, // 30 soal / 45 menit
  LBE: 90, // 20 soal / 30 menit
});

const FAKTOR_LEVEL = Object.freeze({ 1: 0.6, 2: 0.8, 3: 1, 4: 1 });

// Jika subtes tidak ada di tabel (mis. subtes CPNS), pakai nilai ini.
const WAKTU_BAWAAN = 60;

const bulatkan5 = (n) => Math.max(5, Math.round(n / 5) * 5);

/** Waktu bawaan satu soal. @returns {number} detik */
function waktuSoal(kodeSubtes, level) {
  const faktor = FAKTOR_LEVEL[level];
  if (!faktor) throw new Error(`Level soal tidak dikenal: ${level}`);
  const dasar = WAKTU_DASAR[String(kodeSubtes || '').toUpperCase()] ?? WAKTU_BAWAAN;
  return bulatkan5(dasar * faktor);
}

module.exports = { WAKTU_DASAR, FAKTOR_LEVEL, WAKTU_BAWAAN, waktuSoal };
