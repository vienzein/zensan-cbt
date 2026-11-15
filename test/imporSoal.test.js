'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, validasi, topikButuhDomain0 } = require('../src/services/imporSoal');

const HEADER = 'tes,subtes,topik,subtopik,level,soal,opsi_a,opsi_b,opsi_c,opsi_d,opsi_e,kunci,waktu_detik,poin,domain0';
const csv = (...baris) => [HEADER, ...baris].join('\n');
const ok = 'SNBT,PM,Aljabar,Persamaan kuadrat,1,Akar x²−9=0?,3,-3,"3 dan -3",9,,C,,,';

test('parseCsv: koma, kutip berisi koma, kutip ganda, baris baru di dalam kutip, BOM', () => {
  const t = `﻿a,b,c\r\n1,"x, y","dia bilang ""hai"""\r\n2,"baris1\nbaris2",z\r\n`;
  const { kolom, baris } = parseCsv(t);
  assert.deepEqual(kolom, ['a', 'b', 'c']);
  assert.equal(baris.length, 2);
  assert.equal(baris[0].b, 'x, y');
  assert.equal(baris[0].c, 'dia bilang "hai"');
  assert.equal(baris[1].b, 'baris1\nbaris2');
  assert.equal(baris[1]._nomor, 3);
});

test('parseCsv: titik koma (Excel Indonesia) dan tab dikenali otomatis', () => {
  assert.deepEqual(parseCsv('a;b\n1;2').baris[0].b, '2');
  assert.deepEqual(parseCsv('a\tb\n1\t2').baris[0].b, '2');
});

test('parseCsv: baris kosong diabaikan', () => {
  assert.equal(parseCsv('a,b\n1,2\n\n,\n').baris.length, 1);
});

test('baris valid: waktu bawaan mengikuti subtes dan level, poin bawaan 10', () => {
  const { soal, galat } = validasi(parseCsv(csv(ok)));
  assert.deepEqual(galat, []);
  assert.equal(soal[0].waktu, 55); // PM level 1
  assert.equal(soal[0].poin, 10);
  assert.equal(soal[0].kunci, 'C');
  assert.deepEqual(soal[0].opsi.map((o) => o.kode), ['A', 'B', 'C', 'D']);
});

test('waktu_detik di file menimpa waktu bawaan', () => {
  const { soal } = validasi(parseCsv(csv('SNBT,PM,A,S,1,q,a,b,,,,A,40,,')));
  assert.equal(soal[0].waktu, 40);
});

test('Level 1-2 harus 1 subtopik; Level 3-4 minimal 2 subtopik', () => {
  const dua = validasi(parseCsv(csv('SNBT,PM,A,S1|S2,1,q,a,b,,,,A,,,')));
  assert.match(dua.galat[0].pesan, /tepat 1 subtopik/);
  const satu = validasi(parseCsv(csv('SNBT,PM,A,S1,3,q,a,b,,,,A,,,')));
  assert.match(satu.galat[0].pesan, /minimal 2 subtopik/);
  const bagus = validasi(parseCsv(csv('SNBT,PM,A,S1|S2,3,q,a,b,,,,A,,,')));
  assert.deepEqual(bagus.galat, []);
  assert.deepEqual(bagus.soal[0].subtopik, ['S1', 'S2']);
});

test('kunci harus cocok dengan opsi; opsi minimal A dan B; tidak boleh ada celah', () => {
  assert.match(validasi(parseCsv(csv('SNBT,PM,A,S,1,q,a,b,,,,D,,,'))).galat[0].pesan, /kunci/);
  assert.match(validasi(parseCsv(csv('SNBT,PM,A,S,1,q,a,,,,,A,,,'))).galat[0].pesan, /opsi A dan B/);
  assert.match(validasi(parseCsv(csv('SNBT,PM,A,S,1,q,a,b,,d,,A,,,'))).galat.map((g) => g.pesan).join(' '), /tanpa celah/);
});

test('level di luar 1-4, waktu, poin, domain0 tidak valid dilaporkan beserta nomor baris', () => {
  const { galat } = validasi(parseCsv(csv(
    'SNBT,PM,A,S,9,q,a,b,,,,A,,,',
    'SNBT,PM,A,S,1,q,a,b,,,,A,2,,',
    'SNBT,PM,A,S,1,q,a,b,,,,A,,0,',
    'SNBT,PM,A,S,1,q,a,b,,,,A,,,mungkin',
  )));
  assert.deepEqual(galat.map((g) => g.baris), [2, 3, 4, 5]); // tepat satu pesan per baris salah
});

test('kolom wajib hilang dilaporkan', () => {
  const { galat } = validasi(parseCsv('tes,subtes\nSNBT,PM'));
  assert.match(galat[0].pesan, /Kolom wajib/);
});

test('aturan bawaan Domain 0 pada topik baru: matematika ya, lainnya tidak, bisa ditimpa', () => {
  assert.equal(topikButuhDomain0({ subtes: 'PM', topikButuhDomain0: null }), true);
  assert.equal(topikButuhDomain0({ subtes: 'PK', topikButuhDomain0: null }), true);
  assert.equal(topikButuhDomain0({ subtes: 'PU', topikButuhDomain0: null }), false);
  assert.equal(topikButuhDomain0({ subtes: 'PM', topikButuhDomain0: false }), false);
});
