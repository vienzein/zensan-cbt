'use strict';

/**
 * Mengubah dokumen Word soal menjadi CSV, tanpa database, untuk MENINJAU apa yang terbaca dari dokumen
 * (dan memeriksa aturan soal) sebelum diimpor. CSV-nya bisa dibuka di Excel / Google Sheets.
 *
 *   npm run docx:csv -- seed/soal-saya.docx                  # menulis seed/soal-saya.csv
 *   npm run docx:csv -- seed/soal-saya.docx keluaran.csv
 */

const fs = require('node:fs');
const path = require('node:path');
const { validasi } = require('../src/services/imporSoal');
const { docxKeBaris, keCsv } = require('../src/services/imporWord');

const [, , masuk, keluarArg] = process.argv;
if (!masuk) {
  console.error('Pemakaian: npm run docx:csv -- <berkas.docx> [keluaran.csv]');
  process.exit(2);
}
if (!fs.existsSync(masuk)) {
  console.error(`Berkas tidak ditemukan: ${masuk}`);
  process.exit(2);
}

let w;
try { w = docxKeBaris(fs.readFileSync(masuk)); } catch (e) { console.error(e.message); process.exit(1); }

const tujuan = keluarArg || path.join(path.dirname(masuk), `${path.basename(masuk, path.extname(masuk))}.csv`);
fs.writeFileSync(tujuan, keCsv(w.kolom, w.baris));
console.log(`Terbaca ${w.baris.length} soal -> ${tujuan}`);

w.peringatan.forEach((p) => console.warn(`  perhatian: ${p}`));
const bergambar = w.baris.filter((r) => r._gambarSoal || r._gambarPembahasan).length;
if (bergambar) {
  console.log(`  ${bergambar} soal memiliki gambar tertanam. Kolom gambar_url di CSV ini kosong; gambar baru diunggah saat impor dengan --tulis.`);
}

const { galat } = validasi({ kolom: w.kolom, baris: w.baris });
const semuaGalat = [...w.galat, ...galat];
if (semuaGalat.length) {
  const cup = new Map(w.baris.map((r) => [r._nomor, r._cuplikan]));
  console.error(`\nAda ${semuaGalat.length} masalah yang harus diperbaiki di dokumen:`);
  semuaGalat.slice(0, 50).forEach((g) => console.error(`  soal ke-${g.baris}${cup.get(g.baris) ? ` ("${cup.get(g.baris)}")` : ''}: ${g.pesan}`));
  process.exit(1);
}
console.log('Semua soal lolos pemeriksaan aturan. Lanjutkan dengan: npm run impor:soal -- <berkas.docx>');
