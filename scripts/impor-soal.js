'use strict';

/**
 * Impor bank soal dari CSV ke database.
 *
 *   npm run impor:soal -- seed/soal-saya.csv            # SIMULASI: memeriksa semuanya, tidak menyimpan
 *   npm run impor:soal -- seed/soal-saya.csv --tulis    # menyimpan
 *   --lewati-bertanda : soal yang masih memuat [GAMBAR DIPERLUKAN...] / [RUMUS PERLU...] / [TIDAK TERBACA...] dilewati (dilaporkan), sisanya diimpor.
 *                       Tanpa opsi ini, soal bertanda dianggap galat dan tidak ada yang disimpan.
 *   npm run impor:soal -- seed/soal-saya.docx           # sama, dari dokumen Word (lihat PETUNJUK-IMPOR-WORD.md)
 *   npm run impor:soal -- seed/soal-d0.json             # soal stage dalam JSON (kodeStage, soal, opsi, kunci, pembahasan)
 *
 * Soal diagnostik Domain 0: beri kolom/label "Stage" (mis. D0-01-01.S1); stage harus sudah diimpor
 * (npm run impor:stage). Subtes, topik, subtopik, level, dan waktu soal diambil dari stage-nya.
 *
 * Aturan: tes dan subtes harus sudah ada; topik dan subtopik yang belum ada dibuat otomatis; soal yang
 * sama (topik + teks soal + gambar) dilewati, jadi aman dijalankan ulang. Semua atau tidak sama sekali (satu transaksi).
 * Format kolom: lihat seed/PETUNJUK-IMPOR-SOAL.md dan seed/templat-soal.csv.
 * Format Word: lihat seed/PETUNJUK-IMPOR-WORD.md dan seed/templat-soal.docx.
 */

const fs = require('node:fs');
const pool = require('../src/db');
const { parseCsv, jsonKeBaris, validasi, adaPenanda } = require('../src/services/imporSoal');
const { docxKeBaris } = require('../src/services/imporWord');
const { simpanSoal, siapkanGambar } = require('../src/services/imporSoalService');

const [, , berkas, ...flag] = process.argv;
const tulis = flag.includes('--tulis');

function keluar(kode, pesan) {
  if (pesan) console.error(pesan);
  process.exit(kode);
}

async function main() {
  if (!berkas) keluar(2, 'Pemakaian: npm run impor:soal -- <berkas.csv | berkas.docx | berkas.json> [--tulis] [--tes=SNBT]');
  if (!fs.existsSync(berkas)) keluar(2, `Berkas tidak ditemukan: ${berkas}`);

  const dariWord = /\.docx$/i.test(berkas);
  let terbaca;
  let galatBaca = [];
  let media = new Map();
  const cuplikan = new Map();
  if (dariWord) {
    let w;
    try { w = docxKeBaris(fs.readFileSync(berkas)); } catch (e) { keluar(1, e.message); }
    w.peringatan.forEach((p) => console.warn(`  perhatian: ${p}`));
    w.baris.forEach((r) => cuplikan.set(r._nomor, r._cuplikan));
    galatBaca = w.galat;
    media = w.media;
    terbaca = { kolom: w.kolom, baris: w.baris };
  } else if (/\.json$/i.test(berkas)) {
    const tesFlag = (flag.find((f) => f.startsWith('--tes=')) || '--tes=SNBT').slice(6).trim().toUpperCase();
    try { terbaca = jsonKeBaris(fs.readFileSync(berkas, 'utf8'), tesFlag); } catch (e) { keluar(1, e.message); }
  } else {
    terbaca = parseCsv(fs.readFileSync(berkas, 'utf8'));
  }
  // Penunjuk lokasi masalah: nomor baris di spreadsheet, atau nomor soal (+ awal kalimatnya) di Word.
  const lokasi = (n) => (dariWord ? `soal ke-${n}${cuplikan.get(n) ? ` ("${cuplikan.get(n)}")` : ''}` : `baris ${n}`);

  // --lewati-bertanda: soal yang masih bertanda [GAMBAR DIPERLUKAN...] dkk. tidak ikut diimpor (dilaporkan), sisanya jalan terus.
  if (flag.includes('--lewati-bertanda')) {
    const bertanda = terbaca.baris.filter((r) => adaPenanda(r));
    terbaca = { ...terbaca, baris: terbaca.baris.filter((r) => !adaPenanda(r)) };
    if (bertanda.length) {
      console.log(`Dilewati karena masih bertanda sementara: ${bertanda.length} soal`);
      bertanda.forEach((r) => console.log(`  ${lokasi(r._nomor)}`));
      console.log('');
    }
  }

  const hasil = validasi(terbaca);
  const { soal } = hasil;
  const galat = [...galatBaca, ...hasil.galat];
  if (galat.length) {
    console.error(`Ada ${galat.length} masalah di berkas. Perbaiki lalu jalankan lagi (belum ada yang disimpan):\n`);
    galat.slice(0, 50).forEach((g) => console.error(`  ${lokasi(g.baris)}: ${g.pesan}`));
    if (galat.length > 50) console.error(`  ... dan ${galat.length - 50} lainnya`);
    keluar(1);
  }
  if (!soal.length) keluar(1, 'Tidak ada soal di berkas.');

  // Gambar tertanam di Word diunggah ke Supabase Storage saat --tulis. Periksa pengaturannya SEBELUM menyentuh database.
  const { simpanGambar, masalahGambar } = await siapkanGambar(soal);
  if (masalahGambar) {
    if (tulis) keluar(1, `${masalahGambar}\n  Lihat seed/PETUNJUK-IMPOR-WORD.md bagian "Gambar".\n\nBelum ada yang disimpan.`);
    console.warn(`  perhatian: ${masalahGambar}\n             (Simulasi tetap jalan, tetapi --tulis akan berhenti sebelum menyimpan apa pun.)`);
  }

  let hasilSimpan;
  try {
    hasilSimpan = await simpanSoal(pool, { soal, media, tulis, simpanGambar });
  } catch (e) {
    keluar(1, `Dibatalkan, tidak ada yang disimpan. Penyebab:\n  ${e.message}`);
  }
  const { masalah, stat, gambar } = hasilSimpan;
  const perKelompok = new Map(hasilSimpan.perKelompok);
  if (masalah.length) {
    console.error(`Ada ${masalah.length} masalah (belum ada yang disimpan):\n`);
    masalah.slice(0, 50).forEach((g) => console.error(`  ${lokasi(g.baris)}: ${g.pesan}`));
    keluar(1);
  }

  console.log(tulis ? '\nTERSIMPAN' : '\nSIMULASI (tidak ada yang disimpan; tambahkan --tulis untuk menyimpan)');
  console.log(`  soal baru            : ${stat.baru}`);
  console.log(`  sudah ada (dilewati) : ${stat.ada}`);
  if (stat.kembar) console.log(`  kembar di berkas     : ${stat.kembar}`);
  console.log(`  topik baru           : ${stat.topikBaru}`);
  console.log(`  subtopik baru        : ${stat.subBaru}`);
  if (gambar) {
    console.log(tulis
      ? `  gambar diunggah      : ${gambar}`
      : `  gambar (diunggah saat --tulis): ${gambar}`);
  }
  if (stat.domain0TakTerpakai) {
    console.log(`  PERHATIAN: ${stat.domain0TakTerpakai} soal bertanda domain0 berada di topik yang tidak butuh Domain 0, jadi tidak akan dipakai.`);
  }
  if (perKelompok.size) {
    console.log('\nSoal baru per kelompok:');
    [...perKelompok].sort().forEach(([k, n]) => console.log(`  ${k}: ${n}`));
  }
}

main()
  .catch((e) => keluar(1, `Error tak terduga: ${e.message}`))
  .finally(() => pool.end());
