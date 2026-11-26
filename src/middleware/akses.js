'use strict';

const { HttpError } = require('../errors');
const akses = require('../config/akses');
const { punyaAkses } = require('../services/aksesService');

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

module.exports = { createWajibAkses };
