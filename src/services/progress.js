'use strict';

/**
 * Logika murni untuk tampilan beranda (tanpa database).
 */

const NAMA_LEVEL = { 1: 'Perintis', 2: 'Pejuang', 3: 'Ahli' };
const levelNama = (lvl) => NAMA_LEVEL[lvl] || null;

const DAY_MS = 24 * 60 * 60 * 1000;
const toUtc = (s) => Date.parse(`${s}T00:00:00Z`);
const kemarin = (s) => new Date(toUtc(s) - DAY_MS).toISOString().slice(0, 10);

/**
 * Hari beruntun berlatih.
 * @param {string[]} dates tanggal 'YYYY-MM-DD' (zona Asia/Jakarta) yang ada latihan selesai
 * @param {string}   today tanggal hari ini 'YYYY-MM-DD'
 * Streak tetap hidup jika kemarin ada latihan dan hari ini belum (masih bisa dilanjutkan).
 */
function hitungStreak(dates, today) {
  const set = new Set(dates);
  let cursor = set.has(today) ? today : kemarin(today);
  let n = 0;
  while (set.has(cursor)) {
    n += 1;
    cursor = kemarin(cursor);
  }
  return n;
}

/** Ringkasan satu topik dari daftar subtopiknya: [{level, rr}] */
function ringkasTopik(subs) {
  const di_level = { 1: 0, 2: 0, 3: 0 };
  let total = 0;
  let rrSum = 0;
  let terendah = 3;
  for (const s of subs) {
    di_level[s.level] += 1;
    rrSum += s.rr;
    total += 1;
    if (s.level < terendah) terendah = s.level;
  }
  return {
    jumlah_subtopik: total,
    di_level,
    rr_rata_rata: total ? Math.round(rrSum / total) : 0,
    level_terendah: total ? terendah : 1,
    level_terendah_nama: levelNama(total ? terendah : 1),
  };
}

module.exports = { hitungStreak, ringkasTopik, levelNama, NAMA_LEVEL };
