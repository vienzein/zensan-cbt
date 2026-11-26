'use strict';

const { HttpError } = require('../errors');
const akses = require('../config/akses');
const { punyaAkses, jatahHarian } = require('../services/aksesService');

/**
 * Gerbang akses program. Dipasang setelah middleware login pada rute modul yang berbayar.
 * Bila program wajib bayar dan siswa belum punya akses aktif: HTTP 402 AKSES_DIPERLUKAN, dan web
 * mengarahkan siswa ke halaman bayar. Admin tidak pernah dikunci. Bila program tidak wajib bayar, lewat saja.
 */
function createWajibAkses({ pool, kode }) {
  return async function wajibAkses(req, res, next) {
    try {
      if (!akses.wajibBayar(kode)) return next();
      const id = req.user && req.user.id;
      if (!id) throw new HttpError(401, 'UNAUTHORIZED', 'Harus login');
      const { rows } = await pool.query('SELECT role FROM students WHERE id = $1::uuid', [id]);
      const role = rows.length ? rows[0].role : 'siswa';
      if (!(await punyaAkses(pool, id, kode, role))) {
        throw new HttpError(402, 'AKSES_DIPERLUKAN', 'Akses program ini belum aktif. Selesaikan pembayaran dulu.', { program: kode });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Jatah gratis harian untuk memulai sesi drill. Akun berlangganan, admin, dan keadaan "pembatasan belum
 * dinyalakan" lolos tanpa batas. Bila jatah habis: HTTP 402 (alasan 'jatah_habis'). Bila masih ada, sisa jatah
 * disimpan di req.jatahSisa agar rute memotong jumlah soal sesi.
 */
function createJatahHarian({ pool }) {
  return async function jatahDrill(req, res, next) {
    try {
      if (!akses.wajibBayar(akses.PROGRAM_CBT)) return next();
      const id = req.user && req.user.id;
      if (!id) throw new HttpError(401, 'UNAUTHORIZED', 'Harus login');
      const { rows } = await pool.query('SELECT role FROM students WHERE id = $1::uuid', [id]);
      const j = await jatahHarian(pool, id, rows.length ? rows[0].role : 'siswa');
      if (j.tanpa_batas) return next();
      if (j.sisa <= 0) {
        throw new HttpError(402, 'AKSES_DIPERLUKAN',
          `Jatah gratis hari ini (${j.batas} soal) sudah habis. Berlangganan untuk lanjut tanpa batas.`,
          { program: akses.PROGRAM_CBT, alasan: 'jatah_habis', batas: j.batas });
      }
      req.jatahSisa = j.sisa;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { createWajibAkses, createJatahHarian };
