'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseSilabus, parseSilabusJson, ringkasSilabus } = require('../src/services/silabus');
const { parseCsv, validasi } = require('../src/services/imporSoal');
const { docxKeBaris } = require('../src/services/imporWord');

const MD = `# Judul

## PU – Penalaran Umum

| Kode | Topik | Sub Topik | Cakupan | Tingkat |
|---|---|---|---|---|
| PU-01-01 | Penalaran Deduktif | Logika Proposisi | c1 | Dasar |
| PU-01-02 |  | Silogisme | c2 | Dasar |
| PU-02-01 | Penalaran Induktif | Generalisasi | c3 | Menengah |

## PK – Pengetahuan Kuantitatif

| Kode | Topik | Sub Topik | Cakupan | Tingkat |
|---|---|---|---|---|
| PK-01-01 | Bilangan | Sifat Bilangan | c4 | Dasar |
`;

test('parseSilabus: topik kosong mengikuti baris di atas, subtes dari judul, judul kolom dan pemisah dilewati', () => {
  const { baris, galat } = parseSilabus(MD);
  assert.deepEqual(galat, []);
  assert.deepEqual(baris.map((b) => [b.subtes, b.topik, b.subtopik]), [
    ['PU', 'Penalaran Deduktif', 'Logika Proposisi'],
    ['PU', 'Penalaran Deduktif', 'Silogisme'],
    ['PU', 'Penalaran Induktif', 'Generalisasi'],
    ['PK', 'Bilangan', 'Sifat Bilangan'],
  ]);
  assert.equal(baris[0].tingkat, 'Dasar');
});

test('parseSilabus: galat untuk baris sebelum judul subtes, sub topik kosong, dan subtopik ganda', () => {
  const r = parseSilabus('| X-01 | T | S | c | Dasar |\n## PU – Umum\n| PU-1 | T | | c | d |\n| PU-2 | T | S | c | d |\n| PU-3 |  | S | c | d |');
  const pesan = r.galat.map((g) => g.pesan).join(' | ');
  assert.match(pesan, /sebelum judul subtes/);
  assert.match(pesan, /sub topik kosong/);
  assert.match(pesan, /sub topik ganda/);
});

test('ringkasSilabus: topik dengan satu subtopik dilaporkan (tidak bisa punya soal Level 3-4)', () => {
  const { tunggal } = ringkasSilabus(parseSilabus(MD).baris);
  assert.deepEqual(tunggal, [
    { subtes: 'PU', topik: 'Penalaran Induktif' },
    { subtes: 'PK', topik: 'Bilangan' },
  ]);
});

test('contoh di templat (CSV dan Word) memakai nama topik/subtopik yang ada di silabus dan lolos validasi', () => {
  const teks = fs.readFileSync(path.join(__dirname, '../seed/silabus-snbt.json'), 'utf8');
  const ada = new Set(parseSilabusJson(teks).baris.map((b) => `${b.subtes}|${b.topik}|${b.subtopik}`));
  const cocok = (soal) => soal.subtopik.every((sub) => ada.has(`${soal.subtes}|${soal.topik}|${sub}`));

  const dariCsv = validasi(parseCsv(fs.readFileSync(path.join(__dirname, '../seed/templat-soal.csv'), 'utf8')));
  assert.deepEqual(dariCsv.galat, []);
  assert.ok(dariCsv.soal.length >= 3 && dariCsv.soal.every(cocok), 'templat CSV memakai nama di luar silabus');

  const w = docxKeBaris(fs.readFileSync(path.join(__dirname, '../seed/templat-soal.docx')));
  assert.deepEqual(w.galat, []);
  const dariWord = validasi({ kolom: w.kolom, baris: w.baris });
  assert.deepEqual(dariWord.galat, []);
  assert.equal(dariWord.soal.length, 4);
  assert.ok(dariWord.soal.every(cocok), 'templat Word memakai nama di luar silabus');
});

test('silabus-snbt.json (silabus baru): 5 subtes, 22 topik, 92 subtopik, tanpa galat, kode unik', () => {
  const teks = fs.readFileSync(path.join(__dirname, '../seed/silabus-snbt.json'), 'utf8');
  const { baris, galat, subtes } = parseSilabusJson(teks);
  assert.deepEqual(galat, []);
  assert.deepEqual(subtes.map((s) => s.kode), ['PU', 'KL', 'NUM', 'LBI', 'LBE']);
  assert.equal(subtes.find((s) => s.kode === 'NUM').nama, 'Kemampuan Numerasi');
  assert.equal(baris.length, 92);
  assert.equal(new Set(baris.map((b) => `${b.subtes}|${b.topik}`)).size, 22);
  assert.equal(new Set(baris.map((b) => b.kode)).size, 92);
  assert.deepEqual(ringkasSilabus(baris).tunggal, []);
});

test('parseSilabusJson: galat untuk JSON rusak, kode kosong, dan kode ganda', () => {
  assert.match(parseSilabusJson('{bukan json').galat[0].pesan, /tidak bisa dibaca/);
  assert.match(parseSilabusJson('{}').galat[0].pesan, /larik "subtes"/);
  const rusak = JSON.stringify({ subtes: [{ kode: 'PU', nama: 'Umum', topik: [{ nama: 'T', subTopik: [
    { kode: 'A', nama: 'S1' }, { kode: 'A', nama: 'S2' }, { kode: '', nama: 'S3' }, { kode: 'B', nama: '' }] }] }] });
  const pesan = parseSilabusJson(rusak).galat.map((g) => g.pesan).join(' | ');
  assert.match(pesan, /kode ganda: A/);
  assert.match(pesan, /subtopik tanpa kode/);
  assert.match(pesan, /nama subtopik kosong/);
});
