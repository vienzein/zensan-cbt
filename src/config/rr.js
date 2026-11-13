'use strict';

/**
 * Konstanta aturan RR. Semua angka "ajaib" ada di sini supaya mudah disetel
 * tanpa menyentuh logika.
 */
module.exports = Object.freeze({
  // Aturan 1 & 2 (permintaan)
  SPEED_BONUS_THRESHOLD: 0.5, // durasi < 50% target_waktu  -> speed bonus
  SPEED_BONUS_RATE: 0.2,      // +20% dari poin soal
  WRONG_PENALTY_RATE: 0.2,    // -20% dari poin soal

  // Anti-tebak (PRD): < 10% batas waktu = ditandai tebakan, tidak dapat speed bonus
  GUESS_THRESHOLD: 0.1,

  // Batas bar RR
  RR_MIN: 0,
  RR_MAX: 100,

  // Aturan 3: 2-Strike Demotion (PRD)
  STRIKE_AT_RR: 0,          // salah saat RR = 0       -> Strike 1
  STRIKE2_BELOW_RR: 10,     // salah saat RR < 10      -> Strike 2 (jika sudah Strike 1)
  DEMOTION_START_RR: 70,    // RR awal setelah turun level
  LEVEL_MIN: 1,
  LEVEL_MAX: 3,

  // Promosi tanpa tes: RR mencapai 100 -> naik level. NILAI AWAL INI ASUMSI, silakan setel.
  PROMOTION_START_RR: 20,       // RR awal di level baru (PRD belum menetapkan)
  LEVEL3_UNLOCK_RATIO: 0.5,     // Level 3 topik terbuka jika >= 50% subtopik di Level 2+ (PRD)
  ELITE_START_RR: 0,            // elite_rr saat topik baru masuk Elite (PRD belum menetapkan)

  // Domain 0 & tryout kalibrasi. ASUMSI: PRD belum menetapkan ukuran soalnya.
  DOMAIN0_JUMLAH_SOAL: 20,      // jumlah soal tes izin Domain 0 (lulus = benar semua)
  TRYOUT_SOAL_PER_SUBTES: 20,   // soal per subtes pada tryout reguler (ASUMSI)
  CALIBRATION_MAX_SOAL: 90,    // batas atas soal tryout kalibrasi
  CALIBRATION_RR_CLEAN: 30,     // RR awal hasil kalibrasi (PRD)
  CALIBRATION_RR_WRONG: 10,     // RR awal jika ada salah di level yang ditetapkan (PRD)

  // Aturan 4: Cooldown
  COOLDOWN_MINUTES: 10,
  CONSECUTIVE_WRONG_COOLDOWN: 5, // 5 salah beruntun dalam satu topik

  // Validasi anti-manipulasi durasi dari client
  DURATION_TOLERANCE_SEC: 5,
});
