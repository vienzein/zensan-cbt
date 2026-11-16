'use strict';

/** Aturan tes diagnostik Domain 0 berbasis stage. */
module.exports = Object.freeze({
  // 'stage' = gerbang PK/PM memakai stage; 'lama' = tes Domain 0 lama (bawaan sampai soal stage cukup)
  mode: () => (process.env.DOMAIN0_MODE === 'stage' ? 'stage' : 'lama'),
  SOAL_PER_STAGE: 3,
  GAGAL_UNTUK_JEDA: 3,        // gagal berturut-turut di stage yang sama
  JEDA_MENIT: 15,
  TOLERANSI_DETIK: 3,         // selisih jaringan terhadap batas waktu stage
  KODE_TOPIK_GERBANG: ['D0-01', 'D0-02', 'D0-03', 'D0-04', 'D0-05'],
});
