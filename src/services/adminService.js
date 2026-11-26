'use strict';

const { HttpError } = require('../errors');
const { KODE_ALASAN } = require('../config/laporanSoal');
const { PERAN } = require('../config/peran');

const untukLembaga = (admin) => Boolean(admin) && admin.role === PERAN.ADMIN_LEMBAGA;

const STATUS_LAPORAN = Object.freeze(['baru', 'ditinjau', 'selesai', 'ditolak']);
const STATUS_TINDAK = Object.freeze(['ditinjau', 'selesai', 'ditolak']);

const potong = (t, n) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, n);

/** GET /api/admin/ringkasan — super admin: seluruh aplikasi; admin lembaga: hanya lembaganya. */
async function ringkasan(pool, admin) {
  if (untukLembaga(admin)) return ringkasanLembaga(pool, admin.institutionId);
  const { rows } = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM students WHERE role = 'siswa')                         AS siswa,
       (SELECT count(DISTINCT student_id)::int FROM student_answer_history
         WHERE answered_at > now() - interval '7 days')                                  AS siswa_aktif_7_hari,
       (SELECT count(*)::int FROM student_answer_history
         WHERE answered_at > now() - interval '24 hours')                                AS jawaban_24_jam,
       (SELECT count(*)::int FROM questions WHERE is_active AND NOT is_domain0)          AS soal_aktif,
       (SELECT count(*)::int FROM questions WHERE NOT is_active AND hidden_reason IS NOT NULL) AS soal_tersembunyi,
       (SELECT count(DISTINCT question_id)::int FROM question_reports WHERE status = 'baru') AS soal_dilaporkan_baru,
       (SELECT count(*)::int FROM question_reports WHERE status = 'baru')                AS laporan_baru,
       (SELECT count(*)::int FROM institutions WHERE is_active)                          AS lembaga,
       (SELECT count(*)::int FROM questions WHERE approval_status = 'menunggu')          AS soal_menunggu,
       (SELECT count(*)::int FROM payments WHERE status = 'menunggu_verifikasi')         AS pembayaran_menunggu`,
  );
  return { peran: PERAN.SUPER_ADMIN, ...rows[0] };
}

async function ringkasanLembaga(pool, lembagaId) {
  const { rows } = await pool.query(
    `SELECT i.nama AS lembaga, i.kode_undangan,
       (SELECT count(*)::int FROM students s WHERE s.institution_id = i.id AND s.role = 'siswa')  AS siswa,
       (SELECT count(DISTINCT h.student_id)::int FROM student_answer_history h
          JOIN students s ON s.id = h.student_id
         WHERE s.institution_id = i.id AND s.role = 'siswa' AND h.answered_at > now() - interval '7 days') AS siswa_aktif_7_hari,
       (SELECT count(*)::int FROM student_answer_history h JOIN students s ON s.id = h.student_id
         WHERE s.institution_id = i.id AND s.role = 'siswa' AND h.answered_at > now() - interval '24 hours') AS jawaban_24_jam,
       (SELECT CASE WHEN count(*) = 0 THEN NULL ELSE round(100.0 * count(*) FILTER (WHERE h.is_correct) / count(*))::int END
          FROM student_answer_history h JOIN students s ON s.id = h.student_id
         WHERE s.institution_id = i.id AND s.role = 'siswa' AND h.answered_at > now() - interval '30 days') AS akurasi_30_hari,
       (SELECT count(*)::int FROM questions q WHERE q.institution_id = i.id AND q.approval_status = 'menunggu')  AS soal_menunggu,
       (SELECT count(*)::int FROM questions q WHERE q.institution_id = i.id AND q.approval_status = 'disetujui') AS soal_disetujui,
       (SELECT count(*)::int FROM questions q WHERE q.institution_id = i.id AND q.approval_status = 'ditolak')   AS soal_ditolak
       FROM institutions i WHERE i.id = $1`,
    [lembagaId],
  );
  if (!rows.length) throw new HttpError(404, 'LEMBAGA_TIDAK_DITEMUKAN', 'Lembaga tidak ditemukan');
  return { peran: PERAN.ADMIN_LEMBAGA, ...rows[0] };
}

/** GET /api/admin/laporan?status=baru|semua — soal yang dilaporkan, dikelompokkan per soal. */
async function daftarLaporan(pool, { semua }) {
  const { rows } = await pool.query(
    `SELECT r.question_id, count(*)::int AS jumlah_laporan, count(DISTINCT r.student_id)::int AS jumlah_siswa,
            array_agg(DISTINCT r.alasan) AS alasan, max(r.created_at) AS terakhir,
            q.is_active, q.hidden_reason, q.level_soal, q.soal_teks, t.nama AS topik, s.kode AS subtes
       FROM question_reports r
       JOIN questions q ON q.id = r.question_id
       JOIN topics t    ON t.id = q.topic_id
       JOIN subjects s  ON s.id = t.subject_id
      WHERE ($1::boolean OR r.status IN ('baru', 'ditinjau'))
      GROUP BY r.question_id, q.is_active, q.hidden_reason, q.level_soal, q.soal_teks, t.nama, s.kode
      ORDER BY count(DISTINCT r.student_id) DESC, max(r.created_at) DESC
      LIMIT 200`,
    [Boolean(semua)],
  );
  return rows.map((r) => ({
    question_id: String(r.question_id),
    subtes: r.subtes,
    topik: r.topik,
    level: r.level_soal,
    aktif: r.is_active,
    tersembunyi_karena: r.hidden_reason,
    jumlah_siswa: r.jumlah_siswa,
    jumlah_laporan: r.jumlah_laporan,
    alasan: r.alasan,
    terakhir: r.terakhir,
    cuplikan: potong(r.soal_teks, 110),
  }));
}

/** GET /api/admin/laporan/:questionId — soal lengkap + semua laporannya. */
async function detailLaporan(pool, questionId) {
  const q = (await pool.query(
    `SELECT q.id, q.is_active, q.hidden_reason, q.level_soal, q.soal_teks, q.soal_gambar_url, q.opsi_jawaban,
            q.kunci_jawaban, q.pembahasan, t.nama AS topik, s.kode AS subtes
       FROM questions q JOIN topics t ON t.id = q.topic_id JOIN subjects s ON s.id = t.subject_id
      WHERE q.id = $1`,
    [questionId],
  )).rows[0];
  if (!q) throw new HttpError(404, 'SOAL_TIDAK_DITEMUKAN', 'Soal tidak ditemukan');
  const laporan = (await pool.query(
    `SELECT r.id, r.alasan, r.catatan, r.status, r.created_at, st.nama AS siswa
       FROM question_reports r JOIN students st ON st.id = r.student_id
      WHERE r.question_id = $1 ORDER BY r.created_at`,
    [questionId],
  )).rows.map((r) => ({ ...r, id: String(r.id) }));
  return {
    soal: {
      id: String(q.id),
      subtes: q.subtes,
      topik: q.topik,
      level: q.level_soal,
      aktif: q.is_active,
      tersembunyi_karena: q.hidden_reason,
      teks: q.soal_teks,
      gambar_url: q.soal_gambar_url,
      opsi: Array.isArray(q.opsi_jawaban) ? q.opsi_jawaban : [],
      kunci: q.kunci_jawaban,
      pembahasan: q.pembahasan,
    },
    laporan,
  };
}

/**
 * POST /api/admin/laporan/:questionId/tindak
 * Body: { status: 'ditinjau'|'selesai'|'ditolak', soal_aktif?: boolean }
 *   - status       : diterapkan ke semua laporan soal itu yang masih baru/ditinjau
 *   - soal_aktif   : false = sembunyikan soal (hidden_reason 'admin'); true = tampilkan lagi (hidden_reason dikosongkan)
 */
function parseTindak(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'BAD_REQUEST', 'Body harus berupa JSON object');
  }
  const errors = [];
  if (!STATUS_TINDAK.includes(body.status)) errors.push(`status harus salah satu dari: ${STATUS_TINDAK.join(', ')}`);
  if (body.soal_aktif !== undefined && typeof body.soal_aktif !== 'boolean') errors.push('soal_aktif harus true atau false');
  if (errors.length) throw new HttpError(422, 'VALIDATION_ERROR', 'Tindakan tidak valid', errors);
  return { status: body.status, soalAktif: body.soal_aktif };
}

async function tindakLaporan(pool, questionId, { status, soalAktif }) {
  const ada = (await pool.query('SELECT 1 FROM questions WHERE id = $1', [questionId])).rows.length > 0;
  if (!ada) throw new HttpError(404, 'SOAL_TIDAK_DITEMUKAN', 'Soal tidak ditemukan');

  if (soalAktif === false) {
    await pool.query(
      `UPDATE questions SET is_active = false, hidden_reason = 'admin', updated_at = now() WHERE id = $1`, [questionId]);
  } else if (soalAktif === true) {
    await pool.query(
      `UPDATE questions SET is_active = true, hidden_reason = NULL, updated_at = now() WHERE id = $1`, [questionId]);
  }
  const { rowCount } = await pool.query(
    `UPDATE question_reports SET status = $2, updated_at = now()
      WHERE question_id = $1 AND status IN ('baru', 'ditinjau')`,
    [questionId, status],
  );
  return { laporan_diperbarui: rowCount, soal_aktif: soalAktif === undefined ? null : soalAktif };
}

/** GET /api/admin/siswa */
async function daftarSiswa(pool, admin) {
  const lembaga = untukLembaga(admin);
  const { rows } = await pool.query(
    `SELECT s.id, s.email, s.nama, s.created_at, s.role, cg.kode AS tes_kode, i.nama AS lembaga,
            a.sesi, a.terakhir, h.jawaban, h.benar
       FROM students s
  LEFT JOIN curriculum_groups cg ON cg.id = s.active_curriculum_group_id
  LEFT JOIN institutions i ON i.id = s.institution_id
  LEFT JOIN LATERAL (SELECT count(*)::int AS sesi, max(started_at) AS terakhir
                       FROM student_attempts WHERE student_id = s.id) a ON true
  LEFT JOIN LATERAL (SELECT count(*)::int AS jawaban, (count(*) FILTER (WHERE is_correct))::int AS benar
                       FROM student_answer_history WHERE student_id = s.id) h ON true
      WHERE s.role = 'siswa' AND ($1::bigint IS NULL OR s.institution_id = $1)
      ORDER BY a.terakhir DESC NULLS LAST, s.created_at DESC
      LIMIT 300`,
    [lembaga ? admin.institutionId : null],
  );
  return rows.map((r) => ({
    id: r.id,
    nama: r.nama,
    email: r.email,
    lembaga: r.lembaga,
    tes: r.tes_kode,
    daftar: r.created_at,
    terakhir_latihan: r.terakhir,
    sesi: r.sesi,
    jawaban: r.jawaban,
    akurasi: r.jawaban > 0 ? Math.round((r.benar / r.jawaban) * 100) : null,
  }));
}

/** GET /api/admin/siswa/:id — penguasaan per subtopik + sesi terakhir. */
async function detailSiswa(pool, studentId, admin) {
  const s = (await pool.query(
    `SELECT s.id, s.nama, s.email, s.created_at, cg.kode AS tes_kode
       FROM students s LEFT JOIN curriculum_groups cg ON cg.id = s.active_curriculum_group_id
      WHERE s.id = $1::uuid AND s.role = 'siswa' AND ($2::bigint IS NULL OR s.institution_id = $2)`,
    [studentId, untukLembaga(admin) ? admin.institutionId : null],
  )).rows[0];
  if (!s) throw new HttpError(404, 'SISWA_TIDAK_DITEMUKAN', 'Siswa tidak ditemukan');

  const subtopik = (await pool.query(
    `SELECT sj.kode AS subtes, t.nama AS topik, st.nama AS subtopik, m.current_level AS level,
            m.rank_rating AS rr, m.strike_count AS strike, m.last_answered_at AS terakhir
       FROM student_mastery m
       JOIN subtopics st ON st.id = m.subtopic_id
       JOIN topics t     ON t.id = st.topic_id
       JOIN subjects sj  ON sj.id = t.subject_id
      WHERE m.student_id = $1::uuid AND (m.last_answered_at IS NOT NULL OR m.rank_rating > 0 OR m.current_level > 1)
      ORDER BY sj.urutan, sj.id, t.id, st.id`,
    [studentId],
  )).rows;

  const sesi = (await pool.query(
    `SELECT a.mode, a.status, a.started_at, a.jumlah_soal, a.jumlah_benar, a.jumlah_salah, a.total_rr_delta,
            sj.kode AS subtes
       FROM student_attempts a LEFT JOIN subjects sj ON sj.id = a.subject_id
      WHERE a.student_id = $1::uuid ORDER BY a.started_at DESC LIMIT 15`,
    [studentId],
  )).rows;

  return { siswa: { id: s.id, nama: s.nama, email: s.email, daftar: s.created_at, tes: s.tes_kode }, subtopik, sesi };
}

/** GET /api/admin/bank-soal — jumlah soal AKTIF per subtopik dan level (soal multi-subtopik dihitung di tiap subtopiknya). */
async function bankSoal(pool) {
  const { rows } = await pool.query(
    `SELECT cg.kode AS tes, cg.nama AS tes_nama, s.kode AS subtes, t.nama AS topik, st.nama AS subtopik,
            (count(q.id) FILTER (WHERE q.level_soal = 1))::int AS l1,
            (count(q.id) FILTER (WHERE q.level_soal = 2))::int AS l2,
            (count(q.id) FILTER (WHERE q.level_soal = 3))::int AS l3,
            (count(q.id) FILTER (WHERE q.level_soal = 4))::int AS l4
       FROM subjects s
       JOIN curriculum_groups cg ON cg.id = s.curriculum_group_id
       JOIN topics t     ON t.subject_id = s.id AND t.is_active
       JOIN subtopics st ON st.topic_id = t.id AND st.is_active
  LEFT JOIN question_subtopics qs ON qs.subtopic_id = st.id
  LEFT JOIN questions q ON q.id = qs.question_id AND q.is_active AND NOT q.is_domain0
      WHERE s.is_active
      GROUP BY cg.id, s.id, s.urutan, t.id, st.id
      ORDER BY cg.id, s.urutan, s.id, t.id, st.id`,
  );
  return rows;
}

module.exports = {
  STATUS_LAPORAN, STATUS_TINDAK, KODE_ALASAN,
  ringkasan, daftarLaporan, detailLaporan, parseTindak, tindakLaporan, daftarSiswa, detailSiswa, bankSoal,
};
