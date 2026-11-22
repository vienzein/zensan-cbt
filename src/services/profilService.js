'use strict';

const { HttpError } = require('../errors');
const { hitungStreak, hitungLencana, rekomendasi, rata } = require('./profil');

const ZONA = 'Asia/Jakarta';

/** GET /api/me/profil — profil pencapaian siswa untuk tes aktifnya. */
async function profilSiswa(pool, studentId) {
  const s = (await pool.query(
    `SELECT s.id, s.nama, s.email, s.created_at, s.active_curriculum_group_id AS tes_id, cg.kode AS tes_kode, cg.nama AS tes_nama,
            i.nama AS lembaga,
            (now() AT TIME ZONE '${ZONA}')::date::text AS hari_ini
       FROM students s
  LEFT JOIN curriculum_groups cg ON cg.id = s.active_curriculum_group_id
  LEFT JOIN institutions i ON i.id = s.institution_id
      WHERE s.id = $1::uuid`,
    [studentId],
  )).rows[0];
  if (!s) throw new HttpError(404, 'SISWA_TIDAK_DITEMUKAN', 'Siswa tidak ditemukan');

  const [total, hari, harian, sesi, peta] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS jawaban, (count(*) FILTER (WHERE is_correct))::int AS benar
         FROM student_answer_history WHERE student_id = $1::uuid`, [studentId]),
    pool.query(
      `SELECT DISTINCT (answered_at AT TIME ZONE '${ZONA}')::date::text AS hari
         FROM student_answer_history WHERE student_id = $1::uuid`, [studentId]),
    pool.query(
      `SELECT (answered_at AT TIME ZONE '${ZONA}')::date::text AS hari, count(*)::int AS jawaban,
              (count(*) FILTER (WHERE is_correct))::int AS benar, COALESCE(sum(rr_delta), 0)::float AS rr_delta
         FROM student_answer_history
        WHERE student_id = $1::uuid AND answered_at >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 1`, [studentId]),
    pool.query(
      `SELECT a.id, a.mode, a.status, a.started_at, a.jumlah_soal, a.jumlah_benar, a.jumlah_salah, a.total_rr_delta, sj.kode AS subtes
         FROM student_attempts a LEFT JOIN subjects sj ON sj.id = a.subject_id
        WHERE a.student_id = $1::uuid ORDER BY a.started_at DESC LIMIT 10`, [studentId]),
    pool.query(
      `SELECT sj.kode AS subtes, sj.nama AS subtes_nama, t.id AS topik_id, t.nama AS topik, st.id AS subtopik_id, st.nama AS subtopik,
              m.current_level AS level, m.rank_rating AS rr, (m.last_answered_at IS NOT NULL) AS dilatih,
              EXISTS (SELECT 1 FROM question_subtopics qs JOIN questions q ON q.id = qs.question_id
                       WHERE qs.subtopic_id = st.id AND q.is_active AND NOT q.is_domain0) AS punya_soal
         FROM subjects sj
         JOIN topics t     ON t.subject_id = sj.id AND t.is_active
         JOIN subtopics st ON st.topic_id = t.id AND st.is_active
    LEFT JOIN student_mastery m ON m.subtopic_id = st.id AND m.student_id = $1::uuid
        WHERE sj.is_active AND sj.curriculum_group_id = $2
        ORDER BY sj.urutan, sj.id, t.id, st.id`,
      [studentId, s.tes_id]),
  ]);

  const jawaban = total.rows[0].jawaban;
  const benar = total.rows[0].benar;
  const akurasi = jawaban ? Math.round((100 * benar) / jawaban) : null;
  const streak = hitungStreak(hari.rows.map((r) => r.hari), s.hari_ini);
  const sesiSelesai = (await pool.query(
    `SELECT count(*)::int AS n FROM student_attempts WHERE student_id = $1::uuid AND status = 'selesai'`, [studentId])).rows[0].n;

  // subtes -> topik -> subtopik
  const baris = peta.rows.map((r) => ({
    ...r, level: r.level ?? 1, rr: Number(r.rr ?? 0), dilatih: r.dilatih === true, punya_soal: r.punya_soal === true,
  }));
  const subtes = [];
  for (const r of baris) {
    let sj = subtes.find((x) => x.kode === r.subtes);
    if (!sj) { sj = { kode: r.subtes, nama: r.subtes_nama, topik: [] }; subtes.push(sj); }
    let tp = sj.topik.find((x) => x.id === String(r.topik_id));
    if (!tp) { tp = { id: String(r.topik_id), nama: r.topik, subtopik: [] }; sj.topik.push(tp); }
    tp.subtopik.push({ nama: r.subtopik, level: r.level, rr: r.rr, dilatih: r.dilatih });
  }
  for (const sj of subtes) {
    const dilatih = sj.topik.flatMap((t) => t.subtopik).filter((x) => x.dilatih);
    sj.subtopik_dilatih = dilatih.length;
    sj.subtopik_total = sj.topik.reduce((n, t) => n + t.subtopik.length, 0);
    sj.rr_rata = rata(dilatih.map((x) => x.rr));
    sj.level_tertinggi = dilatih.reduce((m, x) => Math.max(m, x.level), 1);
    for (const t of sj.topik) {
      const d = t.subtopik.filter((x) => x.dilatih);
      t.rr_rata = rata(d.map((x) => x.rr));
      t.subtopik_dilatih = d.length;
    }
  }
  const dilatihSemua = baris.filter((b) => b.dilatih);
  const metrik = {
    jawaban, akurasi: akurasi ?? 0, sesi_selesai: sesiSelesai, streak_terpanjang: streak.terpanjang,
    subtopik_level2: dilatihSemua.filter((b) => b.level >= 2).length,
    subtopik_level3: dilatihSemua.filter((b) => b.level >= 3).length,
  };
  const urut = [...dilatihSemua].sort((a, b) => b.level - a.level || b.rr - a.rr);

  return {
    siswa: { nama: s.nama, email: s.email, bergabung: s.created_at, lembaga: s.lembaga },
    tes: s.tes_id ? { kode: s.tes_kode, nama: s.tes_nama } : null,
    ringkasan: {
      jawaban, benar, akurasi, sesi_selesai: sesiSelesai, hari_aktif: hari.rows.length,
      subtopik_dilatih: dilatihSemua.length, subtopik_total: baris.length,
    },
    streak,
    lencana: hitungLencana(metrik),
    subtes,
    terkuat: urut.slice(0, 3).map((b) => ({ subtes: b.subtes, topik: b.topik, subtopik: b.subtopik, level: b.level, rr: b.rr })),
    grafik: harian.rows.map((r) => ({
      hari: r.hari, jawaban: r.jawaban, benar: r.benar, akurasi: Math.round((100 * r.benar) / r.jawaban), rr_delta: Math.round(r.rr_delta * 10) / 10,
    })),
    sesi: sesi.rows.map((r) => ({
      id: r.id, mode: r.mode, status: r.status, mulai: r.started_at, subtes: r.subtes,
      soal: r.jumlah_soal, benar: r.jumlah_benar, salah: r.jumlah_salah, rr_delta: Number(r.total_rr_delta ?? 0),
    })),
    rekomendasi: rekomendasi(baris, 3),
  };
}

module.exports = { profilSiswa };
