'use strict';

/** Lembaga mitra: kelola lembaga (super admin), kode undangan, akun admin lembaga, dan siswa bergabung. */

const crypto = require('node:crypto');
const { HttpError } = require('../errors');
const { PERAN } = require('../config/peran');

const ABJAD = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa 0/O/1/I agar mudah dibaca
const PANJANG_KODE = 8;

function buatKode() {
  const b = crypto.randomBytes(PANJANG_KODE);
  return Array.from(b, (x) => ABJAD[x % ABJAD.length]).join('');
}
const normalKode = (v) => String(v ?? '').toUpperCase().replace(/[\s-]/g, '');

function parseNama(body) {
  const nama = String((body && body.nama) ?? '').trim().replace(/\s+/g, ' ');
  if (nama.length < 3 || nama.length > 100) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Nama lembaga tidak valid', ['nama lembaga harus 3-100 karakter']);
  }
  return nama;
}

/** GET /api/admin/lembaga */
async function daftarLembaga(pool) {
  const { rows } = await pool.query(
    `SELECT i.id, i.nama, i.kode_undangan, i.is_active, i.created_at,
            (SELECT count(*)::int FROM students s WHERE s.institution_id = i.id AND s.role = 'siswa')        AS siswa,
            (SELECT count(*)::int FROM students s WHERE s.institution_id = i.id AND s.role = 'admin_lembaga') AS admin,
            (SELECT count(*)::int FROM questions q WHERE q.institution_id = i.id AND q.approval_status = 'menunggu') AS soal_menunggu,
            (SELECT count(*)::int FROM questions q WHERE q.institution_id = i.id AND q.approval_status = 'disetujui') AS soal_disetujui
       FROM institutions i ORDER BY i.is_active DESC, i.nama`,
  );
  const admins = (await pool.query(
    `SELECT id, email, nama, institution_id FROM students WHERE role = 'admin_lembaga' ORDER BY email`)).rows;
  return rows.map((r) => ({
    id: String(r.id), nama: r.nama, kode_undangan: r.kode_undangan, aktif: r.is_active, dibuat: r.created_at,
    siswa: r.siswa, jumlah_admin: r.admin, soal_menunggu: r.soal_menunggu, soal_disetujui: r.soal_disetujui,
    admin: admins.filter((a) => String(a.institution_id) === String(r.id)).map((a) => ({ id: a.id, email: a.email, nama: a.nama })),
  }));
}

/** POST /api/admin/lembaga { nama } */
async function buatLembaga(pool, body) {
  const nama = parseNama(body);
  for (let i = 0; i < 5; i += 1) {
    try {
      const { rows } = await pool.query(
        'INSERT INTO institutions (nama, kode_undangan) VALUES ($1, $2) RETURNING id, nama, kode_undangan', [nama, buatKode()]);
      return { id: String(rows[0].id), nama: rows[0].nama, kode_undangan: rows[0].kode_undangan };
    } catch (e) {
      if (e.code !== '23505') throw e;
      if (/nama/.test(e.constraint || e.detail || '')) throw new HttpError(409, 'LEMBAGA_SUDAH_ADA', 'Nama lembaga itu sudah ada');
      // bentrok kode undangan (sangat jarang): ulangi dengan kode baru
    }
  }
  throw new HttpError(500, 'GAGAL_BUAT_KODE', 'Gagal membuat kode undangan, coba lagi');
}

/** PATCH /api/admin/lembaga/:id { nama?, aktif?, kode_baru? } */
async function ubahLembaga(pool, id, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'BAD_REQUEST', 'Body harus berupa JSON object');
  const galat = [];
  if (body.aktif !== undefined && typeof body.aktif !== 'boolean') galat.push('aktif harus true atau false');
  if (body.kode_baru !== undefined && body.kode_baru !== true) galat.push('kode_baru hanya boleh true');
  if (galat.length) throw new HttpError(422, 'VALIDATION_ERROR', 'Perubahan tidak valid', galat);
  const nama = body.nama === undefined ? null : parseNama(body);
  const kode = body.kode_baru === true ? buatKode() : null;
  let r;
  try {
    r = await pool.query(
      `UPDATE institutions SET nama = COALESCE($2, nama), is_active = COALESCE($3, is_active),
              kode_undangan = COALESCE($4, kode_undangan), updated_at = now()
        WHERE id = $1 RETURNING id, nama, kode_undangan, is_active`,
      [id, nama, body.aktif === undefined ? null : body.aktif, kode],
    );
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'LEMBAGA_SUDAH_ADA', 'Nama lembaga itu sudah ada');
    throw e;
  }
  if (!r.rows.length) throw new HttpError(404, 'LEMBAGA_TIDAK_DITEMUKAN', 'Lembaga tidak ditemukan');
  return { id: String(r.rows[0].id), nama: r.rows[0].nama, kode_undangan: r.rows[0].kode_undangan, aktif: r.rows[0].is_active };
}

/** POST /api/admin/lembaga/:id/admin { email } — jadikan akun yang sudah pernah masuk sebagai admin lembaga itu. */
async function tambahAdmin(pool, lembagaId, body) {
  const email = String((body && body.email) ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Email tidak valid', ['email tidak valid']);
  }
  const lem = (await pool.query('SELECT id FROM institutions WHERE id = $1', [lembagaId])).rows[0];
  if (!lem) throw new HttpError(404, 'LEMBAGA_TIDAK_DITEMUKAN', 'Lembaga tidak ditemukan');
  const s = (await pool.query('SELECT id, role FROM students WHERE lower(email) = $1', [email])).rows[0];
  if (!s) {
    throw new HttpError(404, 'AKUN_BELUM_ADA', 'Akun dengan email itu belum pernah masuk ke aplikasi. Minta yang bersangkutan mendaftar dulu, lalu ulangi.');
  }
  if (s.role === PERAN.SUPER_ADMIN) throw new HttpError(409, 'AKUN_SUPER_ADMIN', 'Akun itu sudah super admin');
  await pool.query(`UPDATE students SET role = 'admin_lembaga', institution_id = $2 WHERE id = $1`, [s.id, lembagaId]);
  return { id: s.id, email };
}

/** DELETE /api/admin/lembaga/:id/admin/:studentId — kembalikan menjadi siswa biasa. */
async function cabutAdmin(pool, lembagaId, studentId) {
  const r = await pool.query(
    `UPDATE students SET role = 'siswa' WHERE id = $1::uuid AND institution_id = $2 AND role = 'admin_lembaga' RETURNING id`,
    [studentId, lembagaId]);
  if (!r.rows.length) throw new HttpError(404, 'ADMIN_TIDAK_DITEMUKAN', 'Admin lembaga itu tidak ditemukan');
  return { id: r.rows[0].id };
}

/** POST /api/me/lembaga { kode } — siswa bergabung lewat kode undangan. */
async function gabungLembaga(pool, studentId, body) {
  const kode = normalKode(body && body.kode);
  if (kode.length !== PANJANG_KODE) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Kode undangan tidak valid', [`kode undangan terdiri dari ${PANJANG_KODE} huruf/angka`]);
  }
  const me = (await pool.query('SELECT role FROM students WHERE id = $1::uuid', [studentId])).rows[0];
  if (!me) throw new HttpError(404, 'SISWA_TIDAK_DITEMUKAN', 'Siswa tidak ditemukan');
  if (me.role !== PERAN.SISWA) throw new HttpError(409, 'AKUN_ADMIN', 'Akun admin tidak bergabung lewat kode undangan');
  const lem = (await pool.query(
    'SELECT id, nama FROM institutions WHERE kode_undangan = $1 AND is_active', [kode])).rows[0];
  if (!lem) throw new HttpError(404, 'KODE_TIDAK_DITEMUKAN', 'Kode undangan tidak ditemukan atau lembaganya tidak aktif');
  await pool.query('UPDATE students SET institution_id = $2 WHERE id = $1::uuid', [studentId, lem.id]);
  return { lembaga: { id: String(lem.id), nama: lem.nama } };
}

/** DELETE /api/me/lembaga */
async function keluarLembaga(pool, studentId) {
  await pool.query(`UPDATE students SET institution_id = NULL WHERE id = $1::uuid AND role = 'siswa'`, [studentId]);
  return { lembaga: null };
}

module.exports = {
  buatKode, normalKode, parseNama, daftarLembaga, buatLembaga, ubahLembaga, tambahAdmin, cabutAdmin, gabungLembaga, keluarLembaga,
  PANJANG_KODE,
};
