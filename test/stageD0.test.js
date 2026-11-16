'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseStageD0, detik, menitDetik } = require('../src/services/stageD0');
const { validasi, parseCsv } = require('../src/services/imporSoal');
const { parseSoalWord } = require('../src/services/imporWord');

// parseSoalWord menerima paragraf berbentuk { teks, gambar, daftar }
const para = (...teks) => teks.map((t) => ({ teks: t, gambar: [], daftar: null }));

const TABEL = (...baris) => [
  '## D0-01 Bilangan Bulat dan Operasi Hitung', '',
  '| Kode stage | Indikator | Level | Isi stage | Soal | Target/soal | Batas stage |',
  '|---|---|---|---|---|---|---|',
  ...baris,
].join('\n');

test('detik dan menitDetik membaca format berkas', () => {
  assert.equal(detik('20 dtk'), 20);
  assert.equal(detik('75 detik'), 75);
  assert.equal(detik('abc'), null);
  assert.equal(menitDetik('1:20'), 80);
  assert.equal(menitDetik('0:40'), 40);
  assert.equal(menitDetik('6:00'), 360);
  assert.equal(menitDetik('1:75'), null);
});

test('berkas stage bawaan: 100 stage, 300 soal, 13 topik, 24 stage gerbang awal, tanpa galat', () => {
  const r = parseStageD0(fs.readFileSync(path.join(__dirname, '../seed/stage-diagnostik-d0.md'), 'utf8'));
  assert.deepEqual(r.galat, []);
  assert.deepEqual(r.peringatan, []);
  assert.equal(r.stages.length, 100);
  assert.equal(r.topik.length, 13);
  assert.equal(r.stages.reduce((a, s) => a + s.jumlahSoal, 0), 300);
  const awal = r.stages.filter((s) => s.level === 1 && ['D0-01', 'D0-02', 'D0-03', 'D0-04'].includes(s.kodeTopik));
  assert.equal(awal.length, 24);
  assert.equal(Math.round(awal.reduce((a, s) => a + s.targetDetik * s.jumlahSoal, 0) / 60), 29);
  assert.equal(Math.round(r.stages.reduce((a, s) => a + s.batasDetik, 0) / 60), 277);
  assert.equal(r.stages.filter((s) => s.gabungan).length, 13);
  const s1 = r.stages[0];
  assert.deepEqual([s1.kode, s1.kodeTopik, s1.level, s1.targetDetik, s1.batasDetik, s1.urutan],
    ['D0-01-01.S1', 'D0-01', 1, 20, 80, 1]);
  assert.deepEqual(r.stages.map((s) => s.urutan), r.stages.map((_, i) => i + 1));
});

test('stage: satu baris benar terbaca lengkap', () => {
  const r = parseStageD0(TABEL('| D0-01-01.S1 | Operasi Bilangan Bulat | L1 | Tambah dan kurang | 3 | 20 dtk | 1:20 |'));
  assert.deepEqual(r.galat, []);
  assert.equal(r.stages[0].namaTopik, 'Bilangan Bulat dan Operasi Hitung');
  assert.equal(r.stages[0].indikator, 'Operasi Bilangan Bulat');
  assert.equal(r.stages[0].gabungan, false);
});

test('stage: batas bukan 4 x target hanya diperingatkan', () => {
  const r = parseStageD0(TABEL('| D0-01-01.S1 | Ind | L1 | Isi | 3 | 20 dtk | 1:30 |'));
  assert.deepEqual(r.galat, []);
  assert.equal(r.peringatan.length, 1);
  assert.match(r.peringatan[0], /4 x target/);
});

test('stage: galat kode, level, waktu, jumlah, dan kode kembar', () => {
  const r = parseStageD0(TABEL(
    '| X-01 | Ind | L1 | Isi | 3 | 20 dtk | 1:20 |',
    '| D0-01-01.S1 | Ind | L9 | Isi | 3 | 20 dtk | 1:20 |',
    '| D0-01-01.S2 | Ind | L1 | Isi | 0 | 20 dtk | 1:20 |',
    '| D0-01-01.S3 | Ind | L1 | Isi | 3 | cepat | 1:20 |',
    '| D0-01-02.S1 | Ind | L1 | Isi | 3 | 20 dtk | satu |',
    '| D0-02-01.S1 | Ind | L1 | Isi | 3 | 20 dtk | 1:20 |',
    '| D0-01-03.S1 | Ind | L1 | Isi | 3 | 20 dtk | 1:20 |',
    '| D0-01-03.S1 | Ind | L1 | Isi | 3 | 20 dtk | 1:20 |',
  ));
  const pesan = r.galat.map((g) => g.pesan).join('\n');
  assert.match(pesan, /kode stage tidak dikenali/);
  assert.match(pesan, /level harus L1 sampai L4/);
  assert.match(pesan, /jumlah soal tidak valid/);
  assert.match(pesan, /target\/soal tidak terbaca/);
  assert.match(pesan, /batas stage tidak terbaca/);
  assert.match(pesan, /berawalan D0-02 tetapi berada di bawah topik D0-01/);
  assert.match(pesan, /kode stage muncul dua kali/);
});

test('stage: kolom tabel yang hilang dan berkas tanpa stage', () => {
  const r = parseStageD0('## D0-01 X\n\n| Kode stage | Indikator |\n|---|---|\n| D0-01-01.S1 | a |');
  assert.ok(r.galat.some((g) => /kolom tabel tidak ada/.test(g.pesan)));
  assert.ok(parseStageD0('tidak ada tabel').galat.length > 0);
});

// ---- soal diagnostik di impor soal -------------------------------------------------------------

const HEADER_STAGE = 'tes,stage,soal,opsi_a,opsi_b,opsi_c,opsi_d,kunci';

test('validasi: berkas stage tidak butuh subtes, topik, subtopik, dan level', () => {
  const { soal, galat } = validasi(parseCsv(`${HEADER_STAGE}\nSNBT,d0-01-01.s1,12 + 9 = ?,19,20,21,22,C`));
  assert.deepEqual(galat, []);
  assert.equal(soal[0].stage, 'D0-01-01.S1');
  assert.equal(soal[0].level, null);
  assert.deepEqual(soal[0].subtopik, []);
  assert.equal(soal[0].waktu, null); // diisi dari target stage saat menyimpan
});

test('validasi: berkas stage tetap memeriksa tes, soal, kunci, dan kode stage', () => {
  const { galat } = validasi(parseCsv(`${HEADER_STAGE}\n,D0-01-01.S1,Soal?,1,2,3,4,C\nSNBT,SALAH,Soal?,1,2,3,4,C\nSNBT,D0-01.G,,1,2,3,4,C\nSNBT,D0-01.G,Soal?,1,2,3,4,Z`));
  const pesan = galat.map((g) => g.pesan).join('\n');
  assert.match(pesan, /kolom tes kosong/);
  assert.match(pesan, /kode stage tidak dikenali/);
  assert.match(pesan, /kolom soal kosong/);
  assert.match(pesan, /kunci "Z"/);
});

test('validasi: level yang ditulis di soal stage harus sah, tetapi boleh dikosongkan', () => {
  const h = 'tes,stage,level,soal,opsi_a,opsi_b,kunci';
  assert.deepEqual(validasi(parseCsv(`${h}\nSNBT,D0-01.G,,S?,1,2,A`)).galat, []);
  assert.deepEqual(validasi(parseCsv(`${h}\nSNBT,D0-01.G,3,S?,1,2,A`)).soal[0].level, 3);
  assert.match(validasi(parseCsv(`${h}\nSNBT,D0-01.G,9,S?,1,2,A`)).galat[0].pesan, /level harus 1-4/);
});

test('validasi: soal biasa tetap wajib lengkap meski berkas punya kolom stage', () => {
  const h = 'tes,subtes,topik,subtopik,level,soal,opsi_a,opsi_b,kunci,stage';
  const { galat } = validasi(parseCsv(`${h}\nSNBT,PM,,,,Soal?,1,2,A,`));
  const pesan = galat.map((g) => g.pesan).join('\n');
  assert.match(pesan, /kolom topik kosong/);
  assert.match(pesan, /level harus 1-4/);
  assert.match(pesan, /subtopik kosong/);
});

test('Word: label Stage dibaca dan diwariskan ke soal berikutnya', () => {
  const p = [
    'Tes: SNBT', 'Stage: D0-01-01.S1', 'Soal: 1 + 1 = ?', 'A. 1', 'B. 2', 'Kunci: B', '---',
    'Soal: 2 + 2 = ?', 'A. 3', 'B. 4', 'Kunci: B', '---',
    'Stage: D0-01-01.S2', 'Soal: 3 + 3 = ?', 'A. 6', 'B. 7', 'Kunci: A',
  ];
  const { baris, galat } = parseSoalWord(para(...p));
  assert.deepEqual(galat, []);
  assert.deepEqual(baris.map((b) => b.stage), ['D0-01-01.S1', 'D0-01-01.S1', 'D0-01-01.S2']);
  const v = validasi({ kolom: ['tes', 'stage', 'soal', 'opsi_a', 'opsi_b', 'kunci'], baris });
  assert.deepEqual(v.galat, []);
  assert.equal(v.soal.length, 3);
});

test('Word: soal biasa dengan Topik sendiri tidak mewarisi Stage', () => {
  const p = [
    'Tes: SNBT', 'Stage: D0-01-01.S1', 'Soal: 1 + 1 = ?', 'A. 1', 'B. 2', 'Kunci: B', '---',
    'Subtes: PM', 'Topik: Aljabar', 'Subtopik: Persamaan', 'Level: 1', 'Soal: 2 + 2 = ?', 'A. 3', 'B. 4', 'Kunci: B', '---',
    'Soal: 5 + 5 = ?', 'A. 10', 'B. 11', 'Kunci: A',
  ];
  const { baris } = parseSoalWord(para(...p));
  assert.deepEqual(baris.map((b) => b.stage), ['D0-01-01.S1', '', '']);
});
