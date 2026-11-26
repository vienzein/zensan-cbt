'use strict';

/** Kelas online (Google Meet) dan pengelolaan program oleh super admin. */

const { HttpError } = require('../errors');
const { withTx } = require('./tx');
const { hitungBerlakuSampai } = require('./aksesLogic');
const { parseKelas, statusKelas, parseProgram, parseBeriAkses } = require('./kelasLogic');

const ID_RE = /^[1-9]\d{0,17}$/;
const cekId = (id) => {
  if (!ID_RE.test(String(id))) throw new HttpError(422, 'VALIDATION_ERROR', 'id kelas tidak valid');
  return String(id);
};

function kelasJson(r, sekarang = new Date()) {
  return {
    id: String(r.id),
    program: { kode: r.program_kode, nama: r.program_nama },
    judul: r.judul,
    deskripsi: r.deskripsi,
    pengajar: r.pengajar,
    mulai_pada: r.mulai_pada,
    selesai_pada: r.selesai_pada,
    link_meet: r.link_meet,
    dibatalkan: Boolean(r.dibatalkan),
    status: r.dibatalkan ? 'dibatalkan' : statusKelas(r.mulai_pada, r.selesai_pada, sekarang),
  };
}

const KOLOM = `c.id, c.program_kode, g.nama AS program_nama, c.judul, c.deskripsi, c.pengajar,
       c.mulai_pada, c.selesai_pada, c.link_meet, c.dibatalkan`;

/** GET /api/me/kelas — kelas yang belum selesai dari program yang akses-nya aktif. Link hanya dikirim ke yang berhak. */
async function kelasSiswa(pool, studentId) {
  const { rows } = await pool.query(
    `SELECT ${KOLOM}
       FROM class_sessions c
       JOIN programs g ON g.kode = c.program_kode
       JOIN student_access a ON a.program_kode = c.program_kode AND a.student_id = $1::uuid
      WHERE NOT c.dibatalkan AND c.selesai_pada > now()
        AND (a.berlaku_sampai IS NULL OR a.berlaku_sampai > now())
   ORDER BY c.mulai_pada
      LIMIT 30`,
    [studentId],
  );
  return rows.map((r) => kelasJson(r));
}

// ---------- Admin: kelas ----------

/** GET /api/admin/kelas?status=semua — bawaan: yang belum selesai (termasuk dibatalkan, agar terlihat). */
async function daftarKelas(pool, status) {
  const semua = status === 'semua';
  const { rows } = await pool.query(
    `SELECT ${KOLOM}
       FROM class_sessions c JOIN programs g ON g.kode = c.program_kode
      WHERE ($1::boolean OR c.selesai_pada > now())
   ORDER BY CASE WHEN $1::boolean THEN -extract(epoch FROM c.mulai_pada) ELSE extract(epoch FROM c.mulai_pada) END
      LIMIT 200`,
    [semua],
  );
  return rows.map((r) => kelasJson(r));
}

async function pastikanProgram(client, kode) {
  const { rows } = await client.query('SELECT kode FROM programs WHERE kode = $1 AND is_active', [kode]);
  if (!rows.length) throw new HttpError(404, 'PROGRAM_TIDAK_ADA', 'Program tidak ditemukan atau tidak aktif');
}

/** POST /api/admin/kelas */
async function buatKelas(pool, adminId, body) {
  const k = parseKelas(body);
  await pastikanProgram(pool, k.programKode);
  const { rows } = await pool.query(
    `INSERT INTO class_sessions (program_kode, judul, deskripsi, pengajar, mulai_pada, selesai_pada, link_meet, dibuat_oleh)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid) RETURNING id`,
    [k.programKode, k.judul, k.deskripsi, k.pengajar, k.mulai, k.selesai, k.linkMeet, adminId],
  );
  return { id: String(rows[0].id) };
}

/** PUT /api/admin/kelas/:id */
async function ubahKelas(pool, id, body) {
  const k = parseKelas(body);
  await pastikanProgram(pool, k.programKode);
  const { rowCount } = await pool.query(
    `UPDATE class_sessions
        SET program_kode = $2, judul = $3, deskripsi = $4, pengajar = $5, mulai_pada = $6, selesai_pada = $7, link_meet = $8
      WHERE id = $1::bigint`,
    [cekId(id), k.programKode, k.judul, k.deskripsi, k.pengajar, k.mulai, k.selesai, k.linkMeet],
  );
  if (!rowCount) throw new HttpError(404, 'KELAS_TIDAK_ADA', 'Kelas tidak ditemukan');
  return { id: String(id) };
}

/** POST /api/admin/kelas/:id/batal — siswa tidak lagi melihatnya. */
async function batalkanKelas(pool, id) {
  const { rowCount } = await pool.query('UPDATE class_sessions SET dibatalkan = TRUE WHERE id = $1::bigint', [cekId(id)]);
  if (!rowCount) throw new HttpError(404, 'KELAS_TIDAK_ADA', 'Kelas tidak ditemukan');
  return { id: String(id), dibatalkan: true };
}

// ---------- Admin: program dan akses manual ----------

/** GET /api/admin/program */
async function daftarProgram(pool) {
  const { rows } = await pool.query(
    `SELECT g.kode, g.nama, g.deskripsi, g.harga_rupiah, g.durasi_hari, g.is_active,
            (SELECT count(*)::int FROM student_access a
              WHERE a.program_kode = g.kode AND (a.berlaku_sampai IS NULL OR a.berlaku_sampai > now())) AS peserta_aktif
       FROM programs g ORDER BY g.urutan, g.nama`,
  );
  return rows.map((r) => ({
    kode: r.kode, nama: r.nama, deskripsi: r.deskripsi, harga: r.harga_rupiah,
    durasi_hari: r.durasi_hari, aktif: r.is_active, peserta_aktif: r.peserta_aktif,
  }));
}

/** POST /api/admin/program */
async function buatProgram(pool, body) {
  const p = parseProgram(body, { baru: true });
  try {
    await pool.query(
      `INSERT INTO programs (kode, nama, deskripsi, harga_rupiah, durasi_hari, urutan)
       VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT max(urutan) + 1 FROM programs), 1))`,
      [p.kode, p.nama, p.deskripsi || '', p.hargaRupiah, p.durasiHari],
    );
  } catch (err) {
    if (err && err.code === '23505') throw new HttpError(409, 'KODE_SUDAH_ADA', 'Kode program sudah dipakai');
    throw err;
  }
  return { kode: p.kode };
}

/** PATCH /api/admin/program/:kode — ubah nama, deskripsi, harga, durasi, atau aktif/nonaktif. */
async function ubahProgram(pool, kode, body) {
  const p = parseProgram(body, { baru: false });
  const kolom = [];
  const nilai = [];
  const set = (nama, v) => { nilai.push(v); kolom.push(`${nama} = $${nilai.length + 1}`); };
  if (p.nama !== undefined) set('nama', p.nama);
  if (p.deskripsi !== undefined) set('deskripsi', p.deskripsi);
  if (p.hargaRupiah !== undefined) set('harga_rupiah', p.hargaRupiah);
  if (p.durasiHari !== undefined) set('durasi_hari', p.durasiHari);
  if (p.isActive !== undefined) set('is_active', p.isActive);
  if (!kolom.length) throw new HttpError(422, 'VALIDATION_ERROR', 'Tidak ada yang diubah');
  const { rowCount } = await pool.query(`UPDATE programs SET ${kolom.join(', ')} WHERE kode = $1`, [kode, ...nilai]);
  if (!rowCount) throw new HttpError(404, 'PROGRAM_TIDAK_ADA', 'Program tidak ditemukan');
  return { kode };
}

/** POST /api/admin/program/akses { email, program_kode, hari? } — beri atau perpanjang akses tanpa pembayaran. */
async function beriAkses(pool, body) {
  const a = parseBeriAkses(body);
  return withTx(pool, async (client) => {
    const siswa = (await client.query('SELECT id, email FROM students WHERE lower(email) = $1', [a.email])).rows[0];
    if (!siswa) throw new HttpError(404, 'SISWA_TIDAK_DITEMUKAN', 'Tidak ada akun dengan email itu. Siswa harus masuk ke aplikasi sekali dulu.');
    const prog = (await client.query('SELECT kode, nama, durasi_hari FROM programs WHERE kode = $1 AND is_active', [a.programKode])).rows[0];
    if (!prog) throw new HttpError(404, 'PROGRAM_TIDAK_ADA', 'Program tidak ditemukan atau tidak aktif');
    const lama = (await client.query(
      'SELECT berlaku_sampai FROM student_access WHERE student_id = $1::uuid AND program_kode = $2 FOR UPDATE',
      [siswa.id, prog.kode],
    )).rows[0];
    const berlakuSampai = hitungBerlakuSampai({
      berlakuSampaiSaatIni: lama ? lama.berlaku_sampai : null,
      durasiHari: a.hari ?? prog.durasi_hari,
    });
    await client.query(
      `INSERT INTO student_access (student_id, program_kode, berlaku_sampai, sumber)
       VALUES ($1::uuid, $2, $3, 'admin')
       ON CONFLICT (student_id, program_kode)
       DO UPDATE SET berlaku_sampai = EXCLUDED.berlaku_sampai, sumber = 'admin'`,
      [siswa.id, prog.kode, berlakuSampai],
    );
    return { email: siswa.email, program: { kode: prog.kode, nama: prog.nama }, berlaku_sampai: berlakuSampai };
  });
}

module.exports = {
  kelasSiswa, daftarKelas, buatKelas, ubahKelas, batalkanKelas,
  daftarProgram, buatProgram, ubahProgram, beriAkses, kelasJson,
};
