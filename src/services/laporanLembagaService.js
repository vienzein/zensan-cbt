'use strict';

const { HttpError } = require('../errors');
const { PERAN } = require('../config/peran');
const { hitungStreak } = require('./profil');
const { profilSiswa } = require('./profilService');
const { hariSejak, statusSiswa, urutkanSiswa, ringkasKelas } = require('./laporanLembaga');

const ZONA = 'Asia/Jakarta';
const untukLembaga = (admin) => Boolean(admin) && admin.role === PERAN.ADMIN_LEMBAGA;
const lingkup = (admin) => (untukLembaga(admin) ? admin.institutionId : null);

/**
 * GET /api/admin/laporan-siswa — laporan keseluruhan siswa 30 hari terakhir.
 * Admin lembaga hanya melihat siswa lembaganya; super admin melihat semua siswa.
 */
async function laporanKeseluruhan(pool, admin) {
  const idLembaga = lingkup(admin);

  const hariIni = (await pool.query(`SELECT (now() AT TIME ZONE '${ZONA}')::date::text AS h`)).rows[0].h;

  const siswaRes = await pool.query(
    `SELECT s.id, s.nama, s.email, i.nama AS lembaga,
            h.jawaban, h.benar, h.hari,
            COALESCE(a.sesi, 0) AS sesi_30,
            m.rr_rata, m.level_maks
       FROM students s
  LEFT JOIN institutions i ON i.id = s.institution_id
  LEFT JOIN LATERAL (SELECT count(*)::int AS jawaban, (count(*) FILTER (WHERE is_correct))::int AS benar,
                            array_agg(DISTINCT (answered_at AT TIME ZONE '${ZONA}')::date::text) AS hari
                       FROM student_answer_history WHERE student_id = s.id) h ON true
  LEFT JOIN LATERAL (SELECT count(*)::int AS sesi FROM student_attempts
                      WHERE student_id = s.id AND started_at > now() - interval '30 days') a ON true
  LEFT JOIN LATERAL (SELECT avg(rank_rating)::float AS rr_rata, max(current_level)::int AS level_maks
                       FROM student_mastery WHERE student_id = s.id AND last_answered_at IS NOT NULL) m ON true
      WHERE s.role = 'siswa' AND ($1::bigint IS NULL OR s.institution_id = $1)
      LIMIT 500`,
    [idLembaga],
  );

  const daftar = siswaRes.rows.map((r) => {
    const hari = r.hari || [];
    const terakhirHari = hari.length ? [...hari].sort().pop() : null;
    const akurasi = r.jawaban > 0 ? Math.round((r.benar / r.jawaban) * 100) : null;
    const sejak = hariSejak(terakhirHari, hariIni);
    return {
      id: r.id,
      nama: r.nama,
      email: r.email,
      lembaga: r.lembaga,
      sesi_30_hari: r.sesi_30,
      jawaban: r.jawaban,
      akurasi,
      streak: hitungStreak(hari, hariIni).saat_ini,
      rr_rata: r.rr_rata === null ? null : Math.round(r.rr_rata * 10) / 10,
      level_maks: r.level_maks,
      terakhir_hari: terakhirHari,
      hari_sejak: sejak,
      status: statusSiswa({ jawaban: r.jawaban, akurasi, hari: sejak }),
    };
  });

  const [aktivitas, subtes, akurasi30] = await Promise.all([
    pool.query(
      `SELECT d::date::text AS hari, COALESCE(c.sesi, 0)::int AS sesi
         FROM generate_series((now() AT TIME ZONE '${ZONA}')::date - 29, (now() AT TIME ZONE '${ZONA}')::date, interval '1 day') d
    LEFT JOIN (SELECT (a.started_at AT TIME ZONE '${ZONA}')::date AS hari, count(*) AS sesi
                 FROM student_attempts a JOIN students s ON s.id = a.student_id
                WHERE s.role = 'siswa' AND ($1::bigint IS NULL OR s.institution_id = $1)
                  AND a.started_at > now() - interval '31 days'
                GROUP BY 1) c ON c.hari = d::date
        ORDER BY d`,
      [idLembaga],
    ),
    pool.query(
      `SELECT sj.kode, sj.nama, round(avg(m.rank_rating)::numeric, 1)::float AS rr_rata, count(DISTINCT m.student_id)::int AS siswa
         FROM student_mastery m
         JOIN students s  ON s.id = m.student_id
         JOIN subtopics st ON st.id = m.subtopic_id
         JOIN topics t    ON t.id = st.topic_id
         JOIN subjects sj ON sj.id = t.subject_id
        WHERE m.last_answered_at IS NOT NULL AND s.role = 'siswa' AND ($1::bigint IS NULL OR s.institution_id = $1)
          AND sj.is_active
        GROUP BY sj.id, sj.kode, sj.nama, sj.urutan
        ORDER BY sj.urutan, sj.id`,
      [idLembaga],
    ),
    pool.query(
      `SELECT count(*)::int AS jawaban, (count(*) FILTER (WHERE h.is_correct))::int AS benar
         FROM student_answer_history h JOIN students s ON s.id = h.student_id
        WHERE s.role = 'siswa' AND ($1::bigint IS NULL OR s.institution_id = $1)
          AND h.answered_at > now() - interval '30 days'`,
      [idLembaga],
    ),
  ]);

  const a30 = akurasi30.rows[0];
  return {
    lembaga: untukLembaga(admin) ? (siswaRes.rows[0]?.lembaga ?? null) : null,
    hari_ini: hariIni,
    ringkasan: { ...ringkasKelas(daftar), akurasi_30_hari: a30.jawaban > 0 ? Math.round((a30.benar / a30.jawaban) * 100) : null },
    aktivitas: aktivitas.rows.map((r) => ({ hari: r.hari, sesi: r.sesi })),
    subtes: subtes.rows.map((r) => ({ kode: r.kode, nama: r.nama, rr_rata: r.rr_rata, siswa: r.siswa })),
    siswa: urutkanSiswa(daftar),
  };
}

/** GET /api/admin/siswa/:id/profil — profil pencapaian satu siswa (sama dengan yang dilihat siswa itu sendiri). */
async function profilUntukAdmin(pool, studentId, admin) {
  const ada = await pool.query(
    `SELECT 1 FROM students WHERE id = $1::uuid AND role = 'siswa' AND ($2::bigint IS NULL OR institution_id = $2)`,
    [studentId, lingkup(admin)],
  );
  if (!ada.rowCount) throw new HttpError(404, 'SISWA_TIDAK_DITEMUKAN', 'Siswa tidak ditemukan');
  return profilSiswa(pool, studentId);
}

module.exports = { laporanKeseluruhan, profilUntukAdmin };
