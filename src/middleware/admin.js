'use strict';

const { HttpError } = require('../errors');
const { PERAN, adalahAdmin } = require('../config/peran');

/**
 * Hanya untuk akun admin (admin_lembaga atau super_admin). Dipasang setelah middleware login.
 * Mengisi req.admin = { id, role, institutionId } yang dipakai untuk membatasi data admin lembaga.
 */
function createRequireAdmin({ pool }) {
  return async function requireAdmin(req, res, next) {
    try {
      const id = req.user && req.user.id;
      if (!id) throw new HttpError(401, 'UNAUTHORIZED', 'Harus login');
      const { rows } = await pool.query('SELECT role, institution_id FROM students WHERE id = $1::uuid', [id]);
      if (!rows.length || !adalahAdmin(rows[0].role)) {
        throw new HttpError(403, 'BUKAN_ADMIN', 'Halaman ini khusus admin');
      }
      req.admin = {
        id,
        role: rows[0].role,
        institutionId: rows[0].institution_id === null ? null : String(rows[0].institution_id),
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Hanya super admin. Dipasang setelah requireAdmin. */
function requireSuper(req, res, next) {
  if (!req.admin || req.admin.role !== PERAN.SUPER_ADMIN) {
    return next(new HttpError(403, 'KHUSUS_SUPER_ADMIN', 'Hanya super admin yang boleh melakukan ini'));
  }
  return next();
}

module.exports = { createRequireAdmin, requireSuper };
