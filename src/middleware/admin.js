'use strict';

const { HttpError } = require('../errors');

/** Hanya untuk siswa yang students.is_admin = true. Dipasang setelah middleware login (req.user.id terisi). */
function createRequireAdmin({ pool }) {
  return async function requireAdmin(req, res, next) {
    try {
      const id = req.user && req.user.id;
      if (!id) throw new HttpError(401, 'UNAUTHORIZED', 'Harus login');
      const { rows } = await pool.query('SELECT is_admin FROM students WHERE id = $1::uuid', [id]);
      if (!rows.length || rows[0].is_admin !== true) {
        throw new HttpError(403, 'BUKAN_ADMIN', 'Halaman ini khusus admin');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { createRequireAdmin };
