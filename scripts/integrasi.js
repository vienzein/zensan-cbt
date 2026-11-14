'use strict';

/**
 * Tes integrasi ke database SUNGGUHAN (lewat DATABASE_URL).
 * Membuat data contoh bertanda 'ZZ-TEST' / integrasi-test@example.com, menjalankan satu
 * alur lengkap, lalu menghapus semuanya. Data lain tidak disentuh.
 *
 * Jalankan:  node --env-file=.env scripts/integrasi.js
 */

const assert = require('node:assert/strict');
const pool = require('../src/db');
const { startDomain0, submitDomain0 } = require('../src/services/domain0Service');
const { startDrill } = require('../src/services/drillStartService');
const { submitDrill } = require('../src/services/drillSubmitService');

const KODE = 'ZZ-TEST';
const EMAIL = 'integrasi-test@example.com';

let lulus = 0;
let gagal = 0;

async function cek(nama, fn) {
  try {
    await fn();
    console.log(`✔ ${nama}`);
    lulus += 1;
  } catch (e) {
    console.log(`✘ ${nama}\n    ${e.message}`);
    gagal += 1;
  }
}

async function harusGagal(kode, fn) {
  try {
    await fn();
  } catch (e) {
    assert.equal(e.code, kode, `kode error '${e.code}' (${e.message}), diharapkan '${kode}'`);
    return;
  }
  assert.fail(`seharusnya gagal dengan kode ${kode}`);
}

// ---------------------------------------------------------------------------
// Data contoh
// ---------------------------------------------------------------------------

async function bersihkan() {
  await pool.query('DELETE FROM students WHERE email = $1', [EMAIL]); // cascade: attempt, jawaban, mastery
  const c = await pool.query('SELECT id FROM curriculum_groups WHERE kode = $1', [KODE]);
  if (!c.rows.length) return;
  const cg = c.rows[0].id;
  const topikSub = `SELECT t.id FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE s.curriculum_group_id = $1`;
  await pool.query(`DELETE FROM questions WHERE topic_id IN (${topikSub})`, [cg]);
  await pool.query(`DELETE FROM subtopics WHERE topic_id IN (${topikSub})`, [cg]);
  await pool.query(`DELETE FROM topics WHERE id IN (${topikSub})`, [cg]);
  await pool.query('DELETE FROM subjects WHERE curriculum_group_id = $1', [cg]);
  await pool.query('DELETE FROM curriculum_groups WHERE id = $1', [cg]);
}

async function seed() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const one = async (sql, params) => (await c.query(sql, params)).rows[0].id;

    const cg = await one(
      `INSERT INTO curriculum_groups (kode, nama, tahun) VALUES ($1, 'Uji Integrasi', 2026) RETURNING id`, [KODE]);
    const subjectId = await one(
      `INSERT INTO subjects (curriculum_group_id, kode, nama, urutan) VALUES ($1, 'PK', 'Uji PK', 1) RETURNING id`, [cg]);
    const topicId = await one(
      `INSERT INTO topics (subject_id, nama, requires_domain0) VALUES ($1, 'Uji Aljabar', TRUE) RETURNING id`, [subjectId]);
    const subA = await one(`INSERT INTO subtopics (topic_id, nama) VALUES ($1, 'Uji Sub A') RETURNING id`, [topicId]);
    const subB = await one(`INSERT INTO subtopics (topic_id, nama) VALUES ($1, 'Uji Sub B') RETURNING id`, [topicId]);
    const studentId = await one(
      `INSERT INTO students (email, nama) VALUES ($1, 'Siswa Uji Integrasi') RETURNING id`, [EMAIL]);

    const opsi = JSON.stringify([
      { kode: 'A', teks: 'Pilihan A' }, { kode: 'B', teks: 'Pilihan B' },
      { kode: 'C', teks: 'Pilihan C' }, { kode: 'D', teks: 'Pilihan D' },
    ]);
    const soal = async (level, subs, domain0) => {
      const qid = await one(
        `INSERT INTO questions (topic_id, level_soal, soal_teks, opsi_jawaban, kunci_jawaban,
                                target_waktu_detik, poin_reward, poin_penalty, is_domain0)
         VALUES ($1, $2, $3, $4::jsonb, '"A"'::jsonb, 60, 10, 2, $5) RETURNING id`,
        [topicId, level, `Soal uji level ${level}`, opsi, domain0]);
      for (const s of subs) {
        await c.query('INSERT INTO question_subtopics (question_id, subtopic_id) VALUES ($1, $2)', [qid, s]);
      }
    };
    for (const sub of [subA, subB]) {
      for (let i = 0; i < 6; i += 1) {
        await soal(1, [sub], i < 3); // 3 soal per subtopik ditandai Domain 0 (total 6)
        await soal(2, [sub], false);
      }
    }
    for (let i = 0; i < 4; i += 1) await soal(3, [subA, subB], false);

    await c.query('COMMIT');
    return { cg, subjectId, topicId, studentId };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

// ---------------------------------------------------------------------------
// Pembantu
// ---------------------------------------------------------------------------

const mundurkanWaktu = (attemptId) =>
  pool.query(`UPDATE student_attempts SET started_at = now() - interval '2 hours' WHERE id = $1`, [attemptId]);

// Jawaban untuk semua soal sesi; benar = pakai kunci 'A', salah = 'B'
const jawaban = (soal, benar, durasi = 10) =>
  soal.map((s, i) => ({
    urutan: i + 1,
    questionId: s.question_id,
    jawaban: benar ? 'A' : 'B',
    durasi,
  }));

// ---------------------------------------------------------------------------
// Alur uji
// ---------------------------------------------------------------------------

async function main() {
  console.log('Membersihkan sisa data uji lama (jika ada)...');
  await bersihkan();
  console.log('Membuat data contoh...');
  const S = await seed();
  const startRanked = (jumlahSoal) => startDrill(pool, S.studentId, {
    subjectId: S.subjectId, mode: 'drill_ranked', topicIds: [S.topicId], subtopicIds: [], jumlahSoal,
  });
  console.log('Menjalankan pengecekan:\n');

  await cek('drill ditolak sebelum Domain 0 lulus', () =>
    harusGagal('DOMAIN0_BELUM_LULUS', () => startRanked(5)));

  await cek('Domain 0 gagal -> hasil tidak lulus dan cooldown terpasang', async () => {
    const d = await startDomain0(pool, S.studentId, { curriculumGroupId: S.cg });
    assert.equal(d.jumlah_soal, 6);
    await mundurkanWaktu(d.attempt_id);
    const r = await submitDomain0(pool, S.studentId, {
      attemptId: d.attempt_id, answers: jawaban(d.soal, false),
    });
    assert.equal(r.lulus, false);
    assert.ok(r.cooldown_until, 'cooldown_until kosong');
    assert.equal(r.topik_terkunci, 1);
  });

  await cek('Domain 0 ditolak selama cooldown', () =>
    harusGagal('DOMAIN0_COOLDOWN', () => startDomain0(pool, S.studentId, { curriculumGroupId: S.cg })));

  await cek('Domain 0 lulus jika semua benar', async () => {
    await pool.query('UPDATE student_topic_mastery SET cooldown_until = NULL WHERE student_id = $1', [S.studentId]);
    const d = await startDomain0(pool, S.studentId, { curriculumGroupId: S.cg });
    await mundurkanWaktu(d.attempt_id);
    const r = await submitDomain0(pool, S.studentId, {
      attemptId: d.attempt_id, answers: jawaban(d.soal, true),
    });
    assert.equal(r.lulus, true);
    assert.equal(r.cooldown_until, null);
  });

  await cek('Domain 0 tidak bisa diulang setelah lulus', () =>
    harusGagal('DOMAIN0_SUDAH_LULUS', () => startDomain0(pool, S.studentId, { curriculumGroupId: S.cg })));

  let drill;
  await cek('drill start: 5 soal, kunci jawaban tidak dikirim', async () => {
    drill = await startRanked(5);
    assert.equal(drill.soal.length, 5);
    assert.equal('kunci_jawaban' in drill.soal[0], false);
    assert.equal('pembahasan' in drill.soal[0], false);
  });

  await cek('submit ditolak jika total durasi melebihi lama sesi', () =>
    harusGagal('DURASI_TIDAK_VALID', () => submitDrill(pool, S.studentId, {
      attemptId: drill.attempt_id, answers: jawaban(drill.soal, true, 100),
    })));

  await cek('submit ditolak jika ada soal di luar sesi', async () => {
    const dalam = new Set(drill.soal.map((s) => s.question_id));
    const { rows } = await pool.query('SELECT id FROM questions WHERE topic_id = $1', [S.topicId]);
    const luar = rows.find((r) => !dalam.has(r.id));
    assert.ok(luar, 'tidak ada soal di luar sesi untuk diuji');
    const answers = jawaban(drill.soal, true);
    answers[0].questionId = luar.id;
    await harusGagal('SOAL_BUKAN_BAGIAN_SESI', () => submitDrill(pool, S.studentId, {
      attemptId: drill.attempt_id, answers,
    }));
  });

  await cek('submit semua benar: RR, riwayat jawaban, dan log mastery tercatat', async () => {
    await mundurkanWaktu(drill.attempt_id);
    const r = await submitDrill(pool, S.studentId, {
      attemptId: drill.attempt_id, answers: jawaban(drill.soal, true, 10),
    });
    assert.equal(r.ringkasan.jumlah_benar, 5);
    assert.equal(r.ringkasan.total_rr_delta, 60); // 5 x (10 + speed bonus 2)
    assert.ok(r.hasil.every((h) => h.is_speed_bonus), 'speed bonus tidak terpasang');

    const rr = await pool.query(
      'SELECT COALESCE(sum(rank_rating), 0)::int AS total FROM student_mastery WHERE student_id = $1', [S.studentId]);
    assert.equal(rr.rows[0].total, 60);
    const h = await pool.query(
      'SELECT count(*)::int AS n FROM student_answer_history WHERE attempt_id = $1', [drill.attempt_id]);
    assert.equal(h.rows[0].n, 5);
    const l = await pool.query(
      'SELECT count(*)::int AS n FROM student_answer_mastery_log WHERE student_id = $1', [S.studentId]);
    assert.equal(l.rows[0].n, 5);
    const a = await pool.query('SELECT status, jumlah_benar FROM student_attempts WHERE id = $1', [drill.attempt_id]);
    assert.deepEqual([a.rows[0].status, a.rows[0].jumlah_benar], ['selesai', 5]);
  });

  await cek('submit kedua untuk sesi yang sama ditolak', () =>
    harusGagal('ATTEMPT_SUDAH_SELESAI', () => submitDrill(pool, S.studentId, {
      attemptId: drill.attempt_id, answers: jawaban(drill.soal, true, 10),
    })));

  await cek('5 salah beruntun memicu cooldown topik; soal sesudahnya tidak mengubah RR', async () => {
    const d = await startRanked(10);
    assert.equal(d.soal.length, 10);
    await mundurkanWaktu(d.attempt_id);
    const r = await submitDrill(pool, S.studentId, {
      attemptId: d.attempt_id, answers: jawaban(d.soal, false, 10),
    });
    assert.ok(r.topik.some((t) => t.cooldown_until), 'cooldown_until tidak terpasang');
    assert.equal(r.hasil.filter((h) => h.efek === 'cooldown').length, 5);
  });

  await cek('drill ditolak saat topik cooldown', () =>
    harusGagal('TOPIK_COOLDOWN', () => startRanked(5)));

  console.log(`\n${lulus} lulus, ${gagal} gagal`);
}

main()
  .catch((e) => {
    console.error('\nSkrip berhenti karena error:', e.message);
    gagal += 1;
  })
  .finally(async () => {
    try {
      console.log('Menghapus data uji...');
      await bersihkan();
      console.log('Data uji terhapus.');
    } catch (e) {
      console.error('GAGAL membersihkan data uji (hapus manual data berkode ZZ-TEST):', e.message);
    }
    await pool.end();
    process.exit(gagal ? 1 : 0);
  });
