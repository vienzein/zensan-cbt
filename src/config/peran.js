'use strict';

/** Peran akun. `kode` harus sama dengan CHECK di migrasi 014. */
const PERAN = Object.freeze({ SISWA: 'siswa', ADMIN_LEMBAGA: 'admin_lembaga', SUPER_ADMIN: 'super_admin' });
const adalahAdmin = (role) => role === PERAN.ADMIN_LEMBAGA || role === PERAN.SUPER_ADMIN;

module.exports = { PERAN, adalahAdmin };
