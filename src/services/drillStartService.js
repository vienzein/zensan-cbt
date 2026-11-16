'use strict';

const { HttpError } = require('../errors');
const { composeSession, poolKey } = require('./sessionComposer');
const { assignQuestions } = require('./attemptQuestions');
const { hasPassedDomain0 } = require('./domain0Service');

/**
 * Memulai sesi drill: pilih soal di server, buat attempt, simpan daftar soal sesi.
 * Kunci jawaban & pembahasan TIDAK pernah dikirim ke client.
 */
async function startDrill(pool, studentId, { subjectId, mode, topicIds, subtopicIds, jumlahSoal }) {
  const client = await pool.connect();
  let releaseErr;
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = '10s'`);

    // 1. Subtes
    const subj = await client.query(
      `SELECT id, curriculum_group_id FROM subjects WHERE id = $1 AND is_active`,
      [subjectId],
    );
    if (!subj.rows.length) throw new HttpError(404, 'SUBTES_TIDAK_DITEMUKAN', 'Subtes tidak ditemukan');
    const curriculumGroupId = subj.rows[0].curriculum_group_id;

    // 2. Subtopik terpilih + status siswa (level, Elite, cooldown)
    const { rows: stRows } = await client.query(
      `SELECT st.id AS subtopic_id, st.topic_id, t.requires_domain0,
              COALESCE(sm.current_level, 1) AS lvl,
              COALESCE(tm.is_elite, false)  AS is_elite,
              tm.cooldown_until,
              COALESCE(tm.cooldown_until > now(), false) AS cooling
         FROM subtopics st
         JOIN topics t ON t.id = st.topic_id
    LEFT JOIN student_mastery sm
           ON sm.student_id = $1::uuid AND sm.subtopic_id = st.id
    LEFT JOIN student_topic_mastery tm
           ON tm.student_id = $1::uuid AND tm.topic_id = t.id
        WHERE t.subject_id = $2 AND st.is_active AND t.is_active
          AND (st.id = ANY($3::bigint[]) OR t.id = ANY($4::bigint[]))`,
      [studentId, subjectId, subtopicIds, topicIds],
    );

    const foundSub = new Set(stRows.map((r) => r.subtopic_id));
    const foundTop = new Set(stRows.map((r) => r.topic_id));
    if (subtopicIds.some((id) => !foundSub.has(id)) || topicIds.some((id) => !foundTop.has(id))) {
      throw new HttpError(422, 'TOPIK_TIDAK_VALID', 'Ada topik/subtopik yang tidak ada di subtes ini');
    }

    // 3. Gerbang akses: Domain 0 (topik matematika) dan cooldown (khusus ranked)
    const needD0 = stRows.some((r) => r.requires_domain0);
    let domain0Passed = true;
    if (needD0) {
      domain0Passed = await hasPassedDomain0(client, studentId, curriculumGroupId);
    }

    const dilewati = new Map(); // topicId -> {alasan, cooldown_until}
    const aktif = [];
    for (const r of stRows) {
      if (r.requires_domain0 && !domain0Passed) {
        dilewati.set(r.topic_id, { topic_id: r.topic_id, alasan: 'domain0_belum_lulus' });
      } else if (mode === 'drill_ranked' && r.cooling) {
        dilewati.set(r.topic_id, { topic_id: r.topic_id, alasan: 'cooldown', cooldown_until: r.cooldown_until });
      } else {
        aktif.push(r);
      }
    }
    if (!aktif.length) {
      const reasons = [...dilewati.values()];
      if (reasons.some((x) => x.alasan === 'domain0_belum_lulus')) {
        throw new HttpError(403, 'DOMAIN0_BELUM_LULUS', 'Lulus Domain 0 dulu untuk membuka topik matematika', reasons);
      }
      throw new HttpError(423, 'TOPIK_COOLDOWN', 'Semua topik terpilih sedang cooldown', reasons);
    }

    // 4. Unit pemilihan: topik Elite = 1 unit; selain itu per subtopik
    const eliteTopics = [...new Set(aktif.filter((r) => r.is_elite).map((r) => r.topic_id))];
    const normal = aktif.filter((r) => !r.is_elite);
    const units = [
      ...eliteTopics.map((id) => ({ type: 'elite', id })),
      ...normal.map((r) => ({ type: 'subtopic', id: r.subtopic_id, level: r.lvl })),
    ];

    // 5. Kumpulan kandidat soal (belum pernah dikerjakan diprioritaskan)
    const pools = new Map();
    if (normal.length) {
      const { rows } = await client.query(
        `SELECT subtopic_id, level_soal, question_id FROM (
           SELECT qs.subtopic_id, q.level_soal, q.id AS question_id,
                  row_number() OVER (
                    PARTITION BY qs.subtopic_id, q.level_soal
                    ORDER BY EXISTS (SELECT 1 FROM student_answer_history h
                                      WHERE h.student_id = $1::uuid AND h.question_id = q.id),
                             random()) AS rn
             FROM questions q
             JOIN question_subtopics qs ON qs.question_id = q.id
            WHERE q.is_active
              AND qs.subtopic_id = ANY($2::bigint[])
              AND q.level_soal BETWEEN 1 AND 3
              AND (q.level_soal < 3 OR NOT EXISTS (   -- Level 3: semua subtopik terikat harus >= Level 2
                    SELECT 1 FROM question_subtopics x
               LEFT JOIN student_mastery sm
                      ON sm.student_id = $1::uuid AND sm.subtopic_id = x.subtopic_id
                   WHERE x.question_id = q.id AND COALESCE(sm.current_level, 1) < 2))
         ) z
         WHERE rn <= $3
         ORDER BY subtopic_id, level_soal, rn`,
        [studentId, normal.map((r) => r.subtopic_id), jumlahSoal],
      );
      for (const r of rows) {
        const key = poolKey({ type: 'subtopic', id: r.subtopic_id }, r.level_soal);
        if (!pools.has(key)) pools.set(key, []);
        pools.get(key).push(r.question_id);
      }
    }
    if (eliteTopics.length) {
      const { rows } = await client.query(
        `SELECT topic_id, level_soal, question_id FROM (
           SELECT q.topic_id, q.level_soal, q.id AS question_id,
                  row_number() OVER (
                    PARTITION BY q.topic_id, q.level_soal
                    ORDER BY EXISTS (SELECT 1 FROM student_answer_history h
                                      WHERE h.student_id = $1::uuid AND h.question_id = q.id),
                             random()) AS rn
             FROM questions q
            WHERE q.is_active AND q.topic_id = ANY($2::bigint[]) AND q.level_soal IN (3, 4)
         ) z
         WHERE rn <= $3
         ORDER BY topic_id, level_soal, rn`,
        [studentId, eliteTopics, jumlahSoal],
      );
      for (const r of rows) {
        const key = poolKey({ type: 'elite', id: r.topic_id }, r.level_soal);
        if (!pools.has(key)) pools.set(key, []);
        pools.get(key).push(r.question_id);
      }
    }

    // 6. Susun sesi
    const questionIds = composeSession({ units, n: jumlahSoal, pools });
    if (!questionIds.length) {
      throw new HttpError(422, 'SOAL_TIDAK_TERSEDIA', 'Belum ada soal yang tersedia untuk pilihan ini');
    }

    // 7. Isi soal untuk client (tanpa kunci & pembahasan)
    const { rows: qRows } = await client.query(
      `SELECT id, level_soal, tipe_soal, soal_teks, soal_gambar_url, opsi_jawaban, target_waktu_detik
         FROM questions WHERE id = ANY($1::bigint[])`,
      [questionIds],
    );
    const qById = new Map(qRows.map((q) => [q.id, q]));

    // 8. Buat attempt + tetapkan daftar soalnya
    const ins = await client.query(
      `INSERT INTO student_attempts (student_id, subject_id, curriculum_group_id, mode, jumlah_soal)
       VALUES ($1::uuid, $2, $3, $4, $5)
       RETURNING id, started_at`,
      [studentId, subjectId, curriculumGroupId, mode, questionIds.length],
    );
    const attempt = ins.rows[0];
    await assignQuestions(client, attempt.id, questionIds);

    await client.query('COMMIT');

    return {
      attempt_id: attempt.id,
      mode,
      started_at: attempt.started_at,
      jumlah_soal: questionIds.length,
      jumlah_soal_diminta: jumlahSoal,
      topik_dilewati: [...dilewati.values()],
      soal: questionIds.map((id, i) => {
        const q = qById.get(id);
        return {
          urutan: i + 1,
          question_id: q.id,
          level_soal: q.level_soal,
          tipe_soal: q.tipe_soal,
          soal_teks: q.soal_teks,
          soal_gambar_url: q.soal_gambar_url,
          opsi_jawaban: q.opsi_jawaban,
          target_waktu_detik: q.target_waktu_detik,
        };
      }),
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[drill/start] ROLLBACK gagal:', rollbackErr);
      releaseErr = rollbackErr;
    }
    throw err;
  } finally {
    client.release(releaseErr);
  }
}

module.exports = { startDrill };
