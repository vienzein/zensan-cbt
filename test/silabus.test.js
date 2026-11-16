'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseSilabus, ringkasSilabus } = require('../src/services/silabus');
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

test('silabus-snbt.md asli: terbaca tanpa galat, 7 subtes, 110 subtopik, hanya 1 topik bersubtopik tunggal', () => {
  const md = fs.readFileSync(path.join(__dirname, '../seed/silabus-snbt.md'), 'utf8');
  const { baris, galat } = parseSilabus(md);
  assert.deepEqual(galat, []);
  assert.equal(baris.length, 110);
  assert.deepEqual([...new Set(baris.map((b) => b.subtes))], ['PU', 'PPU', 'PBM', 'PK', 'LBI', 'LBE', 'PM']);
  assert.deepEqual(ringkasSilabus(baris).tunggal, [{ subtes: 'PPU', topik: 'Penalaran Pola Bahasa' }]);
});

test('contoh di templat (CSV dan Word) memakai nama topik/subtopik yang ada di silabus dan lolos validasi', () => {
  const md = fs.readFileSync(path.join(__dirname, '../seed/silabus-snbt.md'), 'utf8');
  const ada = new Set(parseSilabus(md).baris.map((b) => `${b.subtes}|${b.topik}|${b.subtopik}`));
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
