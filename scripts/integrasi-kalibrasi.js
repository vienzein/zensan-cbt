'use strict';

/**
 * Tes integrasi ke database SUNGGUHAN: tryout kalibrasi dan tryout reguler (pay-per-use).
 * Data contoh bertanda 'ZZ-KAL' / integrasi-kalibrasi@example.com, dihapus otomatis di akhir.
 *
 * Aturan ikatan soal-subtopik database: Level 1-2 terikat tepat 1 subtopik, Level 3 minimal 2.
 *
 * Jalankan:  npm run test:kalibrasi   (atau: node --env-file=.env scripts/integrasi-kalibrasi.js)
 */

const assert = require('node:assert/strict');
const pool = require('../src/db');
const { startCalibration, submitCalibration } = require('../src/services/calibrationService');
const { startTryout, submitTryout } = require('../src/services/tryoutService');

const KODE = 'ZZ-KAL';
const EMAIL = 'integrasi-kalibrasi@example.com';

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
  await pool.query('DELETE FROM students WHERE email = $1', [EMAIL]); // cascade: attempt, jawaban, mastery, hak tryout
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

const OPSI = JSON.stringify([
  { kode: 'A', teks: 'Pilihan A' }, { kode: 'B', teks: 'Pilihan B' },
  { kode: 'C', teks: 'Pilihan C' }, { kode: 'D', teks: 'Pilihan D' },
]);

/**
 * Topik dan subtopik. Hasil kalibrasi yang diharapkan:
 *   K1: A, B -> Ahli (Level 3, RR 30)          semua subtopik Level 3, tapi Elite TIDAK diberikan
 *   K2: C, D -> Pejuang (Level 2, RR 30)       soal Level 3 dijawab salah
 *   K3: E, F -> Perintis (Level 1, RR 10)      soal Level 1 dijawab salah
 *   K4: G, H -> G sudah pernah dijawab (Level 2, RR 50) -> TIDAK diubah; H -> Ahli
 * Kebijakan jawaban: benar, kecuali Level 1 milik E/F dan Level 3 milik K2.
 */
const TOPIK = {
  K1: ['A', 'B'],
  K2: ['C', 'D'],
  K3: ['E', 'F'],
  K4: ['G', 'H'],
};
const L1_SALAH = new Set(['E', 'F']);
const L3_SALAH = new Set(['K2']);

async function seed() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const one = async (sql, params) => (await c.query(sql, params)).rows[0].id;

    const cg = await one(
      `INSERT INTO curriculum_groups (kode, nama, tahun) VALUES ($1, 'Uji Kalibrasi', 2026) RETURNING id`, [KODE]);
    const subjectId = await one(
      `INSERT INTO subjects (curriculum_group_id, kode, nama, urutan) VALUES ($1, 'PK', 'Uji Kalibrasi PK', 1) RETURNING id`, [cg]);
    const studentId = await one(
      `INSERT INTO students (email, nama) VALUES ($1, 'Siswa Uji Kalibrasi') RETURNING id`, [EMAIL]);

    const sub = {};       // label -> subtopic id
    const topik = {};     // nama topik -> topic id
    const benar = new Map(); // question id (string) -> apakah dijawab benar

    const buatSoal = async (topicId, level, jumlah, subIds, dijawabBenar) => {
      const ids = (await c.query(
        `INSERT INTO questions (topic_id, level_soal, soal_teks, opsi_jawaban, kunci_jawaban,
                                target_waktu_detik, poin_reward, poin_penalty, is_domain0)
         SELECT $1, $2::int, 'Soal uji level ' || $2::int, $3::jsonb, '"A"'::jsonb, 60, 10, 2, FALSE
           FROM generate_series(1, $4::int)
         RETURNING id`,
        [topicId, level, OPSI, jumlah])).rows.map((r) => r.id);
      await c.query(
        `INSERT INTO question_subtopics (question_id, subtopic_id)
         SELECT qid, sid FROM unnest($1::bigint[]) AS qid, unnest($2::bigint[]) AS sid`,
        [ids, subIds]);
      for (const id of ids) benar.set(String(id), dijawabBenar);
    };

    for (const [namaTopik, labels] of Object.entries(TOPIK)) {
      const topicId = await one(
        `INSERT INTO topics (subject_id, nama, requires_domain0) VALUES ($1, $2, FALSE) RETURNING id`,
        [subjectId, `Uji ${namaTopik}`]);
      topik[namaTopik] = topicId;
      for (const label of labels) {
        sub[label] = await one(
          `INSERT INTO subtopics (topic_id, nama) VALUES ($1, $2) RETURNING id`, [topicId, `Uji sub ${label}`]);
      }
      // Level 1 dan 2: 3 soal per subtopik, terikat tepat 1 subtopik
      for (const label of labels) {
        await buatSoal(topicId, 1, 3, [sub[label]], !L1_SALAH.has(label));
        await buatSoal(topicId, 2, 3, [sub[label]], true);
      }
      // Level 3: 3 soal terikat ke semua subtopik topik ini
      await buatSoal(topicId, 3, 3, labels.map((l) => sub[l]), !L3_SALAH.has(namaTopik));
    }

    // G: sudah pernah dijawab di drill ranked -> tidak boleh ditimpa kalibrasi
    await c.query(
      `INSERT INTO student_mastery (student_id, subtopic_id, current_level, rank_rating, strike_count, last_answered_at)
       VALUES ($1, $2, 2, 50, 0, now())`,
      [studentId, sub.G]);

    await c.query('COMMIT');
    return { cg, subjectId, studentId, sub, topik, benar };
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

const sama = (a, b) => String(a) === String(b);

async function main() {
  console.log('Membersihkan sisa data uji lama (jika ada)...');
  await bersihkan();
  console.log('Membuat data contoh...');
  const S = await seed();
  const masteryDb = async (label) => (await pool.query(
    `SELECT current_level, rank_rating, strike_count, is_calibrated
       FROM student_mastery WHERE student_id = $1 AND subtopic_id = $2`,
    [S.studentId, S.sub[label]])).rows[0];
  const semuaMastery = async () => JSON.stringify((await pool.query(
    `SELECT subtopic_id, current_level, rank_rating, strike_count FROM student_mastery
      WHERE student_id = $1 ORDER BY subtopic_id`, [S.studentId])).rows);

  console.log('Menjalankan pengecekan:\n');

  // ---------------- Tryout kalibrasi ----------------
  let kal;
  await cek('kalibrasi start: soal dikirim tanpa kunci jawaban', async () => {
    kal = await startCalibration(pool, S.studentId, { curriculumGroupId: S.cg });
    assert.equal(kal.melanjutkan, false);
    assert.ok(kal.soal.length >= 8, `soal terlalu sedikit: ${kal.soal.length}`);
    assert.equal('kunci_jawaban' in kal.soal[0], false);
  });

  await cek('kalibrasi start dua kali: sesi yang sama dilanjutkan', async () => {
    const lagi = await startCalibration(pool, S.studentId, { curriculumGroupId: S.cg });
    assert.equal(lagi.melanjutkan, true);
    assert.ok(sama(lagi.attempt_id, kal.attempt_id));
  });

  let hasilKal;
  await cek('kalibrasi submit: level awal tiap subtopik sesuai aturan (Ahli / Pejuang / Perintis)', async () => {
    await mundurkanWaktu(kal.attempt_id);
    const answers = kal.soal.map((s, i) => ({
      urutan: i + 1,
      questionId: s.question_id,
      jawaban: S.benar.get(String(s.question_id)) ? 'A' : 'B',
      durasi: 10,
    }));
    hasilKal = await submitCalibration(pool, S.studentId, { attemptId: kal.attempt_id, answers });
    assert.equal(hasilKal.status, 'selesai');

    const harap = {
      A: [3, 30], B: [3, 30],   // Ahli
      C: [2, 30], D: [2, 30],   // Pejuang
      E: [1, 10], F: [1, 10],   // Perintis, ada salah di Level 1 -> RR 10
      H: [3, 30],               // Ahli
    };
    for (const [label, [level, rr]] of Object.entries(harap)) {
      const db = await masteryDb(label);
      assert.ok(db, `baris mastery ${label} tidak ada`);
      assert.deepEqual([db.current_level, db.rank_rating, db.strike_count, db.is_calibrated],
        [level, rr, 0, true], `subtopik ${label}`);
    }
  });

  await cek('kalibrasi tidak menimpa subtopik yang sudah pernah dijawab (G tetap Level 2, RR 50)', async () => {
    const db = await masteryDb('G');
    assert.deepEqual([db.current_level, db.rank_rating], [2, 50]);
    const g = hasilKal.kalibrasi.find((k) => sama(k.subtopic_id, S.sub.G));
    assert.ok(g, 'G tidak ada di hasil');
    assert.equal(g.diterapkan, false);
    const a = hasilKal.kalibrasi.find((k) => sama(k.subtopic_id, S.sub.A));
    assert.equal(a.diterapkan, true);
  });

  await cek('Level 3 terbuka untuk topik yang >= 50% subtopiknya Level 2+ (K3 tidak)', async () => {
    const terbuka = new Set(hasilKal.topik_level3_terbuka.map(String));
    for (const k of ['K1', 'K2', 'K4']) assert.ok(terbuka.has(String(S.topik[k])), `${k} seharusnya terbuka`);
    assert.equal(terbuka.has(String(S.topik.K3)), false, 'K3 seharusnya tetap terkunci');
    const { rows } = await pool.query(
      `SELECT topic_id, level3_unlocked FROM student_topic_mastery WHERE student_id = $1`, [S.studentId]);
    const byTopic = new Map(rows.map((r) => [String(r.topic_id), r.level3_unlocked]));
    assert.equal(byTopic.get(String(S.topik.K1)), true);
    assert.notEqual(byTopic.get(String(S.topik.K3)), true);
  });

  await cek('Elite TIDAK diberikan lewat kalibrasi (K1: semua subtopik Level 3)', async () => {
    const { rows } = await pool.query(
      `SELECT is_elite FROM student_topic_mastery WHERE student_id = $1 AND topic_id = $2`,
      [S.studentId, S.topik.K1]);
    assert.ok(rows.length === 0 || rows[0].is_elite === false);
  });

  await cek('kalibrasi hanya sekali: start kedua setelah selesai ditolak', () =>
    harusGagal('KALIBRASI_SUDAH_DILAKUKAN', () => startCalibration(pool, S.studentId, { curriculumGroupId: S.cg })));

  // ---------------- Tryout reguler ----------------
  await cek('tryout ditolak tanpa hak tryout (402)', () =>
    harusGagal('TRYOUT_BELUM_DIBAYAR', () => startTryout(pool, S.studentId, { curriculumGroupId: S.cg })));

  const beriHak = (n) => pool.query(
    `INSERT INTO student_tryout_entitlements (student_id, sumber)
     SELECT $1::uuid, 'admin' FROM generate_series(1, $2::int)`, [S.studentId, n]);
  const hakTersedia = async () => (await pool.query(
    `SELECT count(*)::int AS n FROM student_tryout_entitlements WHERE student_id = $1 AND status = 'tersedia'`,
    [S.studentId])).rows[0].n;

  await beriHak(2);

  let tryout;
  await cek('tryout start memakai satu hak; 20 soal, tanpa kunci jawaban', async () => {
    tryout = await startTryout(pool, S.studentId, { curriculumGroupId: S.cg });
    assert.equal(tryout.melanjutkan, false);
    assert.equal(tryout.jumlah_soal, 20);
    assert.equal('kunci_jawaban' in tryout.soal[0], false);
    assert.equal(await hakTersedia(), 1);
    const { rows } = await pool.query(
      `SELECT status, attempt_id FROM student_tryout_entitlements
        WHERE student_id = $1 AND status = 'terpakai'`, [S.studentId]);
    assert.equal(rows.length, 1);
    assert.ok(sama(rows[0].attempt_id, tryout.attempt_id), 'hak harus terhubung ke attempt');
  });

  await cek('tryout start lagi saat sesi berjalan: dilanjutkan tanpa memakai hak baru', async () => {
    const lagi = await startTryout(pool, S.studentId, { curriculumGroupId: S.cg });
    assert.equal(lagi.melanjutkan, true);
    assert.ok(sama(lagi.attempt_id, tryout.attempt_id));
    assert.equal(await hakTersedia(), 1);
  });

  await cek('tryout submit: skor per subtes dan topik; RR siswa tidak berubah', async () => {
    const sebelum = await semuaMastery();
    await mundurkanWaktu(tryout.attempt_id);
    // 14 soal pertama benar, 6 sisanya salah
    const answers = tryout.soal.map((s, i) => ({
      urutan: i + 1, questionId: s.question_id, jawaban: i < 14 ? 'A' : 'B', durasi: 10,
    }));
    const r = await submitTryout(pool, S.studentId, { attemptId: tryout.attempt_id, answers });
    assert.equal(r.status, 'selesai');
    assert.deepEqual([r.skor.benar, r.skor.total, r.skor.persen], [14, 20, 70]);
    assert.equal(r.subtes.length, 1);
    assert.deepEqual([r.subtes[0].benar, r.subtes[0].total], [14, 20]);
    assert.ok(r.topik.length >= 1);
    assert.equal(await semuaMastery(), sebelum, 'RR/level siswa tidak boleh berubah oleh tryout');
  });

  await cek('tryout submit kedua untuk sesi yang sama ditolak', async () => {
    const answers = tryout.soal.map((s, i) => ({
      urutan: i + 1, questionId: s.question_id, jawaban: 'A', durasi: 10,
    }));
    await harusGagal('ATTEMPT_SUDAH_SELESAI', () =>
      submitTryout(pool, S.studentId, { attemptId: tryout.attempt_id, answers }));
  });

  await cek('tryout baru memakai hak berikutnya; setelah habis ditolak lagi (402)', async () => {
    const baru = await startTryout(pool, S.studentId, { curriculumGroupId: S.cg });
    assert.equal(baru.melanjutkan, false);
    assert.ok(!sama(baru.attempt_id, tryout.attempt_id));
    assert.equal(await hakTersedia(), 0);
    await mundurkanWaktu(baru.attempt_id);
    await submitTryout(pool, S.studentId, {
      attemptId: baru.attempt_id,
      answers: baru.soal.map((s, i) => ({ urutan: i + 1, questionId: s.question_id, jawaban: 'A', durasi: 10 })),
    });
    await harusGagal('TRYOUT_BELUM_DIBAYAR', () => startTryout(pool, S.studentId, { curriculumGroupId: S.cg }));
  });

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
      console.error('GAGAL membersihkan data uji (hapus manual data berkode ZZ-KAL):', e.message);
    }
    await pool.end();
    process.exit(gagal ? 1 : 0);
  });
