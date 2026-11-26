'use strict';

/** Batas paket gratis. Ditegakkan di POST /api/drill/start hanya bila WAJIB_BAYAR_CBT=1 (lihat config/akses.js). */
module.exports = Object.freeze({
  FREE_DAILY_QUESTIONS: 10, // soal latihan (ranked + bebas) per hari untuk akun tanpa akses berbayar. Domain 0 tidak dihitung.
  TIMEZONE: 'Asia/Jakarta',
});
