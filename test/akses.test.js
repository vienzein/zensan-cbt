'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { aksesAktif, hitungBerlakuSampai, kodeUnikDari, nominalTransfer, bebasAkses, MS_HARI } = require('../src/services/aksesLogic');

const T = new Date('2026-11-27T00:00:00Z');

test('aksesAktif: tanpa batas = aktif; batas masa depan aktif; batas lewat tidak', () => {
  assert.equal(aksesAktif(null, T), true);
  assert.equal(aksesAktif(undefined, T), true);
  assert.equal(aksesAktif('2026-11-28T00:00:00Z', T), true);
  assert.equal(aksesAktif('2026-11-27T00:00:00Z', T), false); // tepat habis = tidak aktif
  assert.equal(aksesAktif('2026-11-01T00:00:00Z', T), false);
});

test('hitungBerlakuSampai: akses baru dihitung dari sekarang', () => {
  const r = hitungBerlakuSampai({ sekarang: T, berlakuSampaiSaatIni: null, durasiHari: 30 });
  assert.equal(r.getTime(), T.getTime() + 30 * MS_HARI);
});

test('hitungBerlakuSampai: akses habis dihitung dari sekarang, bukan dari batas lama', () => {
  const r = hitungBerlakuSampai({ sekarang: T, berlakuSampaiSaatIni: '2026-10-01T00:00:00Z', durasiHari: 30 });
  assert.equal(r.getTime(), T.getTime() + 30 * MS_HARI);
});

test('hitungBerlakuSampai: perpanjang saat masih aktif menyambung dari batas lama', () => {
  const lama = new Date(T.getTime() + 10 * MS_HARI);
  const r = hitungBerlakuSampai({ sekarang: T, berlakuSampaiSaatIni: lama, durasiHari: 30 });
  assert.equal(r.getTime(), lama.getTime() + 30 * MS_HARI);
});

test('hitungBerlakuSampai: tanpa durasi = selamanya (null)', () => {
  assert.equal(hitungBerlakuSampai({ sekarang: T, durasiHari: null }), null);
});

test('kodeUnikDari: selalu 1-999', () => {
  assert.equal(kodeUnikDari(0), 1);
  assert.equal(kodeUnikDari(0.9999999), 999);
  for (let i = 0; i < 1000; i += 1) {
    const k = kodeUnikDari(i / 1000);
    assert.ok(k >= 1 && k <= 999);
  }
});

test('nominalTransfer dan bebasAkses', () => {
  assert.equal(nominalTransfer(99000, 217), 99217);
  assert.equal(bebasAkses('super_admin'), true);
  assert.equal(bebasAkses('admin_lembaga'), true);
  assert.equal(bebasAkses('siswa'), false);
});
