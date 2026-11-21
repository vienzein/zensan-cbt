import test from 'node:test';
import assert from 'node:assert/strict';
import { pecahTeksSoal } from '../web/src/lib/teksSoal.js';

test('baris berpemisah " | " dengan kolom sama menjadi tabel; teks sekitarnya tetap paragraf', () => {
  const t = 'Data penjualan.\nToko | Robusta (kg) | Arabika (kg)\nI | 48 | 30\nII | 6 | 44\nToko mana yang terbesar?';
  const b = pecahTeksSoal(t);
  assert.equal(b.length, 3);
  assert.deepEqual(b[0], { jenis: 'teks', isi: 'Data penjualan.' });
  assert.deepEqual(b[1], { jenis: 'tabel', judul: ['Toko', 'Robusta (kg)', 'Arabika (kg)'], baris: [['I', '48', '30'], ['II', '6', '44']] });
  assert.deepEqual(b[2], { jenis: 'teks', isi: 'Toko mana yang terbesar?' });
});

test('satu baris berpipa, nilai mutlak, dan kolom tidak sama bukan tabel', () => {
  assert.deepEqual(pecahTeksSoal('Nilai |x − 2| ≥ 3'), [{ jenis: 'teks', isi: 'Nilai |x − 2| ≥ 3' }]);
  assert.deepEqual(pecahTeksSoal('a | b\nteks biasa'), [{ jenis: 'teks', isi: 'a | b\nteks biasa' }]);
  const b = pecahTeksSoal('a | b\nc | d | e');
  assert.ok(b.every((x) => x.jenis === 'teks'));
});

test('tepi tabel berbentuk |a | b| dirapikan dan teks kosong aman', () => {
  const b = pecahTeksSoal('| A | B |\n| 1 | 2 |');
  assert.equal(b[0].jenis, 'tabel');
  assert.deepEqual(b[0].judul, ['A', 'B']);
  assert.deepEqual(pecahTeksSoal(null), []);
});
