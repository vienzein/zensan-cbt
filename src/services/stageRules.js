'use strict';

const S = require('../config/stage');

/** Batas waktu stage = jumlah soal x target per soal (waktu dihitung per soal, tanpa pengali). */
const batasStage = (jumlahSoal, targetDetikPerSoal) => jumlahSoal * targetDetikPerSoal;

/**
 * Lulus stage = semua soal benar, tiap soal dikerjakan dalam target-nya (+ toleransi), dan total waktu
 * di server tidak melewati batas stage (+ kelonggaran jaringan). `lewatSoal` = jumlah soal yang melewati target.
 */
function evaluateStage({ jumlahBenar, jumlahSoal, durasiDetik, batasDetik, lewatSoal = 0 }) {
  const semuaBenar = jumlahSoal > 0 && jumlahBenar >= jumlahSoal;
  const tepatWaktu = lewatSoal === 0 && durasiDetik <= batasDetik + S.TOLERANSI_DETIK * jumlahSoal + S.KELONGGARAN_TOTAL_DETIK;
  return { lulus: semuaBenar && tepatWaktu, semuaBenar, tepatWaktu };
}

/** Perbarui hitungan gagal; setelah GAGAL_UNTUK_JEDA kali berturut-turut -> jeda, hitungan diulang. */
function nextFailState(gagalBeruntun, now = new Date()) {
  const n = gagalBeruntun + 1;
  if (n >= S.GAGAL_UNTUK_JEDA) {
    return { gagalBeruntun: 0, cooldownUntil: new Date(now.getTime() + S.JEDA_MENIT * 60_000) };
  }
  return { gagalBeruntun: n, cooldownUntil: null };
}

/** Stage berikutnya = stage aktif pertama (urut silabus) yang belum lulus. */
function pickNextStage(stages, passedIds) {
  return stages.find((s) => !passedIds.has(String(s.id))) || null;
}

/** Gerbang terbuka bila semua stage pada topik gerbang sudah lulus (dan stage-nya ada). */
function gateOpen(stages, passedIds) {
  const gate = stages.filter((s) => S.KODE_TOPIK_GERBANG.includes(s.kode_topik));
  return gate.length > 0 && gate.every((s) => passedIds.has(String(s.id)));
}

module.exports = { batasStage, evaluateStage, nextFailState, pickNextStage, gateOpen };
