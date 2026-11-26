'use strict';

/**
 * Aturan akses program.
 *  WAJIB_BAYAR_CBT: bila true, siswa tanpa akses aktif ke program 'cbt' ditolak (HTTP 402) di fitur latihan
 *  dan diarahkan ke halaman bayar. Dimatikan secara bawaan supaya akun yang sudah ada tidak terkunci
 *  sebelum harga dan rekening diisi. Nyalakan dengan WAJIB_BAYAR_CBT=1 di .env.
 */
const WAJIB_BAYAR_CBT = ['1', 'true', 'ya'].includes(String(process.env.WAJIB_BAYAR_CBT || '').toLowerCase());

module.exports = Object.freeze({
  PROGRAM_CBT: 'cbt',
  WAJIB_BAYAR_CBT,
  // Program yang wajib bayar. Program lain (mis. kelas) bisa ditambah di sini tanpa mengubah modul lain.
  wajibBayar: (kode) => kode === 'cbt' && WAJIB_BAYAR_CBT,
  // Petunjuk transfer yang ditampilkan ke siswa. Isi lewat .env (boleh beberapa baris dengan \n).
  rekening: () => String(process.env.PEMBAYARAN_REKENING || '').replace(/\\n/g, '\n').trim(),
  STATUS_PESANAN: Object.freeze({
    MENUNGGU_TRANSFER: 'menunggu_transfer',
    MENUNGGU_VERIFIKASI: 'menunggu_verifikasi',
    LUNAS: 'lunas',
    DITOLAK: 'ditolak',
    DIBATALKAN: 'dibatalkan',
  }),
});
