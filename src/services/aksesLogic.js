'use strict';

const MS_HARI = 24 * 60 * 60 * 1000;

/** Akses aktif bila tanpa batas (selamanya) atau batasnya masih di masa depan. */
function aksesAktif(berlakuSampai, sekarang = new Date()) {
  if (berlakuSampai === null || berlakuSampai === undefined) return true;
  return new Date(berlakuSampai).getTime() > new Date(sekarang).getTime();
}

/**
 * Batas baru setelah pembayaran disetujui. Bila masih aktif, masa baru disambung dari batas lama
 * (siswa tidak rugi hari karena bayar lebih awal); bila sudah habis, dihitung dari sekarang.
 * durasiHari kosong = selamanya (mengembalikan null).
 */
function hitungBerlakuSampai({ sekarang = new Date(), berlakuSampaiSaatIni = null, durasiHari = null }) {
  if (durasiHari === null || durasiHari === undefined) return null;
  const now = new Date(sekarang).getTime();
  const lama = berlakuSampaiSaatIni ? new Date(berlakuSampaiSaatIni).getTime() : 0;
  const mulai = lama > now ? lama : now;
  return new Date(mulai + durasiHari * MS_HARI);
}

/** Kode unik transfer 1–999 dari angka acak [0,1). Tidak pernah 0 supaya nominal selalu beda dari harga. */
function kodeUnikDari(acak) {
  return 1 + Math.floor(acak * 999);
}

/** Nominal yang harus ditransfer siswa. */
const nominalTransfer = (hargaRupiah, kodeUnik) => hargaRupiah + kodeUnik;

/** Admin dan super admin tidak pernah dikunci oleh akses program. */
const bebasAkses = (role) => role === 'admin_lembaga' || role === 'super_admin';

module.exports = { aksesAktif, hitungBerlakuSampai, kodeUnikDari, nominalTransfer, bebasAkses, MS_HARI };
