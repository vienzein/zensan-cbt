'use strict';

const { HttpError } = require('../errors');
const plan = require('../config/plan');
const stageCfg = require('../config/stage');
const { hasPassedDomain0 } = require('./domain0Service');
const { hitungStreak, ringkasTopik, levelNama } = require('./progress');

/** GET /api/me */
async function getMe(pool, studentId) {
  const { rows } = await pool.query(
    `SELECT s.id, s.email, s.nama, s.is_admin, s.active_curriculum_group_id,
            cg.kode AS tes_kode, cg.nama AS tes_nama
       FROM students s
  LEFT JOIN curriculum_groups cg ON cg.id = s.active_curriculum_group_id AND cg.is_active
      WHERE s.id = $1::uuid`,
    [studentId],
  );
  if (!rows.length) throw new HttpError(404, 'SISWA_TIDAK_DITEMUKAN', 'Siswa tidak ditemukan');
  const r = rows[0];
  return {
    id: r.id,
    email: r.email,
    nama: r.nama,
    is_admin: r.is_admin === true,
    paket: 'gratis',
    tes_aktif: r.tes_kode
      ? { id: r.active_curriculum_group_id, kode: r.tes_kode, nama: r.tes_nama }
      : null,
  };
}

/** PUT /api/me/tes — pilih tes yang dilatih */
async function setActiveTest(pool, studentId, curriculumGroupId) {
  const cg = await pool.query(
    `SELECT id FROM curriculum_groups WHERE id = $1 AND is_active`, [curriculumGroupId]);
  if (!cg.rows.length) throw new HttpError(404, 'KURIKULUM_TIDAK_DITEMUKAN', 'Tes tidak ditemukan');
  await pool.query(
    `UPDATE students SET active_curriculum_group_id = $2 WHERE id = $1::uuid`,
    [studentId, curriculumGroupId],
  );
  return getMe(pool, studentId);
}

/** GET /api/kurikulum — daftar tes yang tersedia */
async function listCurricula(pool, studentId) {
  const { rows } = await pool.query(
    `SELECT cg.id, cg.kode, cg.nama,
            count(DISTINCT s.id)::int AS jumlah_subtes,
            COALESCE(bool_or(t.requires_domain0), false) AS butuh_domain0
       FROM curriculum_groups cg
  LEFT JOIN subjects s ON s.curriculum_group_id = cg.id AND s.is_active
  LEFT JOIN topics t   ON t.subject_id = s.id AND t.is_active
      WHERE cg.is_active
      GROUP BY cg.id
      ORDER BY cg.id`,
  );
  const me = await pool.query(
    `SELECT active_curriculum_group_id AS aktif FROM students WHERE id = $1::uuid`, [studentId]);
  const aktif = me.rows.length ? me.rows[0].aktif : null;
  return rows.map((r) => ({
    id: r.id,
    kode: r.kode,
    nama: r.nama,
    jumlah_subtes: r.jumlah_subtes,
    butuh_domain0: r.butuh_domain0,
    aktif: aktif !== null && String(aktif) === String(r.id),
  }));
}

/** GET /api/kurikulum/:id/beranda — semua data untuk layar beranda */
async function getBeranda(pool, studentId, curriculumGroupId) {
  const cg = await pool.query(
    `SELECT id, kode, nama FROM curriculum_groups WHERE id = $1 AND is_active`, [curriculumGroupId]);
  if (!cg.rows.length) throw new HttpError(404, 'KURIKULUM_TIDAK_DITEMUKAN', 'Tes tidak ditemukan');

  const tree = await pool.query(
    `SELECT s.id AS subtes_id, s.kode AS subtes_kode, s.nama AS subtes_nama, s.urutan,
            t.id AS topic_id, t.nama AS topic_nama, t.requires_domain0,
            st.id AS subtopic_id, st.nama AS subtopic_nama,
            COALESCE(sm.current_level, 1) AS lvl,
            COALESCE(sm.rank_rating, 0)   AS rr,
            COALESCE(sm.strike_count, 0)  AS strike,
            COALESCE(tm.is_elite, false)  AS is_elite,
            COALESCE(tm.elite_rr, 0)      AS elite_rr,
            COALESCE(tm.level3_unlocked, false) AS level3_unlocked,
            tm.cooldown_until,
            COALESCE(tm.cooldown_until > now(), false) AS cooling
       FROM subjects s
       JOIN topics t     ON t.subject_id = s.id AND t.is_active
       JOIN subtopics st ON st.topic_id = t.id AND st.is_active
  LEFT JOIN student_mastery sm
         ON sm.student_id = $1::uuid AND sm.subtopic_id = st.id
  LEFT JOIN student_topic_mastery tm
         ON tm.student_id = $1::uuid AND tm.topic_id = t.id
      WHERE s.curriculum_group_id = $2 AND s.is_active
      ORDER BY s.urutan, s.id, t.id, st.id`,
    [studentId, curriculumGroupId],
  );

  const butuhDomain0 = tree.rows.some((r) => r.requires_domain0);
  const lulusDomain0 = butuhDomain0 ? await hasPassedDomain0(pool, studentId, curriculumGroupId) : true;
  let domain0Cooldown = null;
  for (const r of tree.rows) {
    if (r.requires_domain0 && r.cooling) {
      if (!domain0Cooldown || r.cooldown_until > domain0Cooldown) domain0Cooldown = r.cooldown_until;
    }
  }

  // Susun subtes -> topik -> subtopik
  const subtesMap = new Map();
  const topikMap = new Map();
  for (const r of tree.rows) {
    if (!subtesMap.has(r.subtes_id)) {
      subtesMap.set(r.subtes_id, {
        id: r.subtes_id, kode: r.subtes_kode, nama: r.subtes_nama, urutan: r.urutan, topik: [],
      });
    }
    if (!topikMap.has(r.topic_id)) {
      const t = {
        id: r.topic_id,
        nama: r.topic_nama,
        requires_domain0: r.requires_domain0,
        terkunci_domain0: r.requires_domain0 && !lulusDomain0,
        is_elite: r.is_elite,
        elite_rr: r.elite_rr,
        level3_unlocked: r.level3_unlocked,
        cooldown_aktif: r.cooling,
        cooldown_until: r.cooling ? r.cooldown_until : null,
        subtopik: [],
      };
      topikMap.set(r.topic_id, t);
      subtesMap.get(r.subtes_id).topik.push(t);
    }
    topikMap.get(r.topic_id).subtopik.push({
      id: r.subtopic_id,
      nama: r.subtopic_nama,
      level: r.lvl,
      level_nama: levelNama(r.lvl),
      rr: r.rr,
      strike_count: r.strike,
    });
  }
  for (const t of topikMap.values()) {
    t.ringkasan = ringkasTopik(t.subtopik.map((s) => ({ level: s.level, rr: s.rr })));
  }

  // Kuota harian (zona Asia/Jakarta) dan hari beruntun
  const tz = plan.TIMEZONE;
  const kuota = await pool.query(
    `SELECT COALESCE(sum(COALESCE(jumlah_benar, 0) + COALESCE(jumlah_salah, 0)), 0)::int AS n
       FROM student_attempts
      WHERE student_id = $1::uuid AND mode = 'drill_ranked' AND status = 'selesai'
        AND finished_at >= (date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2)`,
    [studentId, tz],
  );
  const hari = await pool.query(
    `SELECT DISTINCT to_char(finished_at AT TIME ZONE $2, 'YYYY-MM-DD') AS d
       FROM student_attempts
      WHERE student_id = $1::uuid AND status = 'selesai'
        AND mode IN ('drill_ranked', 'drill_free')
        AND finished_at > now() - interval '400 days'`,
    [studentId, tz],
  );
  const today = (await pool.query(
    `SELECT to_char(now() AT TIME ZONE $1, 'YYYY-MM-DD') AS d`, [tz])).rows[0].d;

  const terpakai = kuota.rows[0].n;
  return {
    tes: cg.rows[0],
    paket: 'gratis',
    kuota: {
      batas: plan.FREE_DAILY_QUESTIONS,
      terpakai,
      sisa: Math.max(plan.FREE_DAILY_QUESTIONS - terpakai, 0),
    },
    streak_hari: hitungStreak(hari.rows.map((r) => r.d), today),
    domain0: {
      mode: stageCfg.mode(),
      diperlukan: butuhDomain0,
      lulus: lulusDomain0,
      cooldown_until: domain0Cooldown,
    },
    subtes: [...subtesMap.values()],
  };
}

module.exports = { getMe, setActiveTest, listCurricula, getBeranda };
