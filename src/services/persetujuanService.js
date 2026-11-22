'use strict';

/** Antrean persetujuan soal dari admin lembaga. Super admin menyetujui (jadi soal umum aktif) atau menolak dengan catatan. */

const { HttpError } = require('../errors');
const { PERAN } = require('../config/peran');

const STATUS = Object.freeze(['menunggu', 'disetujui', 'ditolak']);
const potong = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);

/** GET /api/admin/soal-lembaga?status=menunggu|semua. Admin lembaga hanya melihat soal lembaganya. */
async function antrean(pool, admin, { status }) {
  const lembaga = admin.role === PERAN.ADMIN_LEMBAGA;
  const filter = STATUS.includes(status) ? status : (lembaga ? null : 'menunggu');
  const { rows } = await pool.query(
    `SELECT q.id, q.level_soal, q.soal_teks, q.approval_status, q.approval_catatan, q.created_at,
            i.nama AS lembaga, i.id AS lembaga_id, t.nama AS topik, s.kode AS subtes
       FROM questions q
       JOIN institutions i ON i.id = q.institution_id
       JOIN topics t ON t.id = q.topic_id
       JOIN subjects s ON s.id = t.subject_id
      WHERE ($1::bigint IS NULL OR q.institution_id = $1)
        AND ($2::text IS NULL OR q.approval_status = $2)
      ORDER BY (q.approval_status = 'menunggu') DESC, q.created_at DESC, q.id DESC
      LIMIT 300`,
    [lembaga ? admin.institutionId : null, filter],
  );
  return rows.map((r) => ({
    id: String(r.id), lembaga: r.lembaga, lembaga_id: String(r.lembaga_id), subtes: r.subtes, topik: r.topik, level: r.level_soal,
    cuplikan: potong(r.soal_teks, 110), status: r.approval_status, catatan: r.approval_catatan, dibuat: r.created_at,
  }));
}

/**
 * POST /api/admin/persetujuan { aksi: 'setujui'|'tolak', ids?: [..], lembaga_id?: .., catatan? }
 * ids (maks 500) ATAU lembaga_id (semua soal menunggu lembaga itu). Menolak wajib disertai catatan.
 */
function parsePutusan(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'BAD_REQUEST', 'Body harus berupa JSON object');
  const galat = [];
  if (!['setujui', 'tolak'].includes(body.aksi)) galat.push('aksi harus setujui atau tolak');
  const ids = body.ids === undefined ? null : body.ids;
  if (ids !== null && (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some((x) => !/^[1-9]\d{0,17}$/.test(String(x))))) {
    galat.push('ids harus daftar 1-500 nomor soal');
  }
  const lembagaId = body.lembaga_id === undefined ? null : String(body.lembaga_id);
  if (lembagaId !== null && !/^[1-9]\d{0,17}$/.test(lembagaId)) galat.push('lembaga_id tidak valid');
  if ((ids === null) === (lembagaId === null)) galat.push('isi salah satu: ids atau lembaga_id');
  const catatan = String(body.catatan ?? '').trim().slice(0, 500) || null;
  if (body.aksi === 'tolak' && !catatan) galat.push('catatan wajib diisi saat menolak');
  if (galat.length) throw new HttpError(422, 'VALIDATION_ERROR', 'Keputusan tidak valid', galat);
  return { aksi: body.aksi, ids: ids && [...new Set(ids.map(String))], lembagaId, catatan };
}

async function putuskan(pool, { aksi, ids, lembagaId, catatan }) {
  const setuju = aksi === 'setujui';
  const r = await pool.query(
    `UPDATE questions
        SET approval_status = $1, approval_catatan = $2, is_active = $3,
            hidden_reason = CASE WHEN $3 THEN NULL ELSE hidden_reason END, updated_at = now()
      WHERE institution_id IS NOT NULL AND approval_status = 'menunggu'
        AND ($4::bigint[] IS NULL OR id = ANY($4::bigint[]))
        AND ($5::bigint IS NULL OR institution_id = $5)
  RETURNING id`,
    [setuju ? 'disetujui' : 'ditolak', setuju ? null : catatan, setuju, ids, lembagaId],
  );
  return { diproses: r.rowCount };
}

module.exports = { antrean, parsePutusan, putuskan, STATUS };
