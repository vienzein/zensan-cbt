'use strict';

/** Fungsi murni untuk halaman Profil siswa: streak harian, lencana, dan rekomendasi latihan. */

const HARI_MS = 86400000;
const hariKe = (s) => Math.round(Date.parse(`${s}T00:00:00Z`) / HARI_MS);

/**
 * @param {string[]} hari  tanggal 'YYYY-MM-DD' (zona Asia/Jakarta) yang ada jawabannya, boleh tidak urut/duplikat
 * @param {string} hariIni 'YYYY-MM-DD' (zona Asia/Jakarta)
 * @returns {{saat_ini:number, terpanjang:number, aktif_hari_ini:boolean}}
 *   saat_ini tetap hidup bila kemarin berlatih tapi hari ini belum (siswa masih punya hari ini untuk melanjutkan).
 */
function hitungStreak(hari, hariIni) {
  const ks = [...new Set(hari.map(hariKe))].sort((a, b) => a - b);
  const sekarang = hariKe(hariIni);
  let terpanjang = 0;
  let run = 0;
  for (let i = 0; i < ks.length; i += 1) {
    run = i > 0 && ks[i] === ks[i - 1] + 1 ? run + 1 : 1;
    if (run > terpanjang) terpanjang = run;
  }
  const aktifHariIni = ks.includes(sekarang);
  let titik = aktifHariIni ? sekarang : sekarang - 1;
  let saatIni = 0;
  while (ks.includes(titik)) {
    saatIni += 1;
    titik -= 1;
  }
  return { saat_ini: saatIni, terpanjang, aktif_hari_ini: aktifHariIni };
}

const LENCANA = Object.freeze([
  { kode: 'langkah_pertama', nama: 'Langkah pertama', ket: 'Selesaikan 1 sesi latihan', cek: (m) => m.sesi_selesai >= 1 },
  { kode: 'seratus_jawaban', nama: '100 jawaban', ket: 'Jawab 100 soal', cek: (m) => m.jawaban >= 100 },
  { kode: 'seribu_jawaban', nama: '1.000 jawaban', ket: 'Jawab 1.000 soal', cek: (m) => m.jawaban >= 1000 },
  { kode: 'streak_3', nama: 'Konsisten 3 hari', ket: 'Berlatih 3 hari berturut-turut', cek: (m) => m.streak_terpanjang >= 3 },
  { kode: 'streak_7', nama: 'Konsisten 7 hari', ket: 'Berlatih 7 hari berturut-turut', cek: (m) => m.streak_terpanjang >= 7 },
  { kode: 'streak_30', nama: 'Konsisten 30 hari', ket: 'Berlatih 30 hari berturut-turut', cek: (m) => m.streak_terpanjang >= 30 },
  { kode: 'naik_level', nama: 'Naik level', ket: 'Capai Level 2 di satu subtopik', cek: (m) => m.subtopik_level2 >= 1 },
  { kode: 'level_tiga', nama: 'Tingkat ahli', ket: 'Capai Level 3 di satu subtopik', cek: (m) => m.subtopik_level3 >= 1 },
  { kode: 'akurasi_80', nama: 'Presisi', ket: 'Akurasi 80%+ (minimal 50 jawaban)', cek: (m) => m.jawaban >= 50 && m.akurasi >= 80 },
]);

/** @returns {{kode,nama,ket,diraih:boolean}[]} */
function hitungLencana(m) {
  return LENCANA.map(({ kode, nama, ket, cek }) => ({ kode, nama, ket, diraih: Boolean(cek(m)) }));
}

/**
 * Rekomendasi latihan berikutnya (maks `n`): subtopik yang sudah dilatih dengan RR terendah dulu (perlu diperkuat),
 * lalu subtopik yang belum pernah dicoba. Subtopik tanpa soal aktif tidak direkomendasikan.
 * @param {{subtes,topik,subtopik,level,rr,dilatih:boolean,punya_soal:boolean}[]} baris
 */
function rekomendasi(baris, n = 3) {
  const ada = baris.filter((b) => b.punya_soal);
  const lemah = ada
    .filter((b) => b.dilatih && !(b.level >= 3 && b.rr >= 100))
    .sort((a, b) => a.rr - b.rr || a.level - b.level)
    .slice(0, n)
    .map((b) => ({ ...b, alasan: 'Perlu diperkuat' }));
  const baru = ada
    .filter((b) => !b.dilatih)
    .slice(0, Math.max(0, n - lemah.length))
    .map((b) => ({ ...b, alasan: 'Belum pernah dicoba' }));
  return [...lemah, ...baru].map(({ subtes, topik, subtopik, level, rr, alasan }) => ({ subtes, topik, subtopik, level, rr, alasan }));
}

const rata = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

module.exports = { hitungStreak, hitungLencana, rekomendasi, rata, LENCANA };
