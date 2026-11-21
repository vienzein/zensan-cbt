'use strict';

const { HttpError } = require('../errors');
const { BATAS_PER_HARI, AMBANG_SEMBUNYI_OTOMATIS } = require('../config/laporanSoal');

/**
 * Simpan laporan soal dari siswa. Hanya soal yang pernah muncul di sesi milik siswa itu yang boleh dilaporkan
 * (drill/tryout/kalibrasi lewat student_attempt_questions, atau stage Domain 0 lewat d0_stage_attempt_questions).
 * Laporan dengan alasan yang sama untuk soal yang sama hanya memperbarui catatan (tidak menggandakan).
 */
async function laporSoal(pool, studentId, { questionId, alasan, catatan }) {
  const pernah = (await pool.query(
    `SELECT 1 FROM student_attempt_questions aq
              JOIN student_attempts a ON a.id = aq.attempt_id
             WHERE aq.question_id = $1 AND a.student_id = $2
     UNION ALL
     SELECT 1 FROM d0_stage_attempt_questions dq
              JOIN d0_stage_attempts da ON da.id = dq.attempt_id
             WHERE dq.question_id = $1 AND da.student_id = $2
     LIMIT 1`,
    [questionId, studentId],
  )).rows.length > 0;
  if (!pernah) throw new HttpError(404, 'SOAL_TIDAK_DITEMUKAN', 'Soal ini tidak ada di riwayat Anda');

  // Laporan yang sama (soal + alasan) hanya memperbarui catatan, tidak dihitung ke batas harian.
  const ada = (await pool.query(
    `UPDATE question_reports
        SET catatan = COALESCE($4, catatan), updated_at = now()
      WHERE student_id = $1 AND question_id = $2 AND alasan = $3
  RETURNING id`,
    [studentId, questionId, alasan, catatan],
  )).rows[0];
  if (ada) return { id: String(ada.id), sudah_pernah: true };

  const hariIni = (await pool.query(
    `SELECT count(*)::int AS n FROM question_reports
      WHERE student_id = $1 AND created_at > now() - interval '24 hours'`,
    [studentId],
  )).rows[0].n;
  if (hariIni >= BATAS_PER_HARI) {
    throw new HttpError(429, 'LAPORAN_TERLALU_BANYAK', 'Terlalu banyak laporan hari ini. Coba lagi besok.');
  }

  const baru = (await pool.query(
    `INSERT INTO question_reports (student_id, question_id, alasan, catatan)
          VALUES ($1, $2, $3, $4)
     ON CONFLICT (student_id, question_id, alasan) DO UPDATE SET updated_at = now()
       RETURNING id`,
    [studentId, questionId, alasan, catatan],
  )).rows[0];
  await sembunyikanBilaPerlu(pool, questionId);
  return { id: String(baru.id), sudah_pernah: false };
}

/**
 * Bila jumlah siswa berbeda yang melapor soal ini (laporan yang belum selesai/ditolak) mencapai ambang,
 * soal disembunyikan (is_active = false, hidden_reason = 'laporan_otomatis') sampai admin meninjaunya.
 * Soal yang sudah nonaktif tidak disentuh.
 */
async function sembunyikanBilaPerlu(pool, questionId) {
  const { rows } = await pool.query(
    `UPDATE questions q
        SET is_active = false, hidden_reason = 'laporan_otomatis', updated_at = now()
      WHERE q.id = $1 AND q.is_active
        AND (SELECT count(DISTINCT r.student_id) FROM question_reports r
              WHERE r.question_id = q.id AND r.status IN ('baru', 'ditinjau')) >= $2
  RETURNING q.id`,
    [questionId, AMBANG_SEMBUNYI_OTOMATIS],
  );
  return rows.length > 0;
}

module.exports = { laporSoal, sembunyikanBilaPerlu };
