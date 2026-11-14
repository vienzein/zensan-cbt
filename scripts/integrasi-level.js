'use strict';

/**
 * Tes integrasi ke database SUNGGUHAN untuk jalur naik/turun level:
 * promosi, L2->L3 tertahan, Level 3 terbuka, masuk Elite, Strike 2 (demosi + cooldown).
 *
 * Data contoh bertanda 'ZZ-LEVEL' / integrasi-level@example.com, dihapus otomatis di akhir.
 * Tiap skenario memakai topiknya sendiri. Skenario multi-subtopik menjalankan sesi khusus satu
 * subtopik supaya hasilnya pasti.
 *
 * Jalankan:  npm run test:level   (atau: node --env-file=.env scripts/integrasi-level.js)
 */

const assert = require('node:assert/strict');
const pool = require('../src/db');
const { startDrill } = require('../src/services/drillStartService');
const { submitDrill } = require('../src/services/drillSubmitService');

const KODE = 'ZZ-LEVEL';
const EMAIL = 'integrasi-level@example.com';

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
  await pool.query('DELETE FROM students WHERE email = $1', [EMAIL]);
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
 * Skenario: nama topik + kondisi awal tiap subtopik.
 * Subtopik tanpa baris mastery berarti Level 1, RR 0.
 */
const SKENARIO = {
  promosi:   { subs: [{ level: 1, rr: 95 }] },
  tertahan:  { subs: [{ level: 2, rr: 95 }, { level: 1, rr: 0 }, { level: 1, rr: 0 }] },
  terbuka:   { subs: [{ level: 2, rr: 20 }, { level: 1, rr: 95 }, { level: 1, rr: 0 }] },
  elite:     { subs: [{ level: 3, rr: 50 }, { level: 3, rr: 50 }] },
  strike2:   { subs: [{ level: 2, rr: 0 }] },
  strike2L1: { subs: [{ level: 1, rr: 0 }] },
};

async function seed() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const one = async (sql, params) => (await c.query(sql, params)).rows[0].id;

    const cg = await one(
      `INSERT INTO curriculum_groups (kode, nama, tahun) VALUES ($1, 'Uji Level', 2026) RETURNING id`, [KODE]);
    const subjectId = await one(
      `INSERT INTO subjects (curriculum_group_id, kode, nama, urutan) VALUES ($1, 'PK', 'Uji Level PK', 1) RETURNING id`, [cg]);
    const studentId = await one(
      `INSERT INTO students (email, nama) VALUES ($1, 'Siswa Uji Level') RETURNING id`, [EMAIL]);

    const topik = {};
    for (const [nama, def] of Object.entries(SKENARIO)) {
      // requires_domain0 = FALSE: skenario ini tidak menguji gerbang Domain 0
      const topicId = await one(
        `INSERT INTO topics (subject_id, nama, requires_domain0) VALUES ($1, $2, FALSE) RETURNING id`,
        [subjectId, `Uji ${nama}`]);

      const subIds = [];
      for (let i = 0; i < def.subs.length; i += 1) {
        const sid = await one(
          `INSERT INTO subtopics (topic_id, nama) VALUES ($1, $2) RETURNING id`, [topicId, `Uji ${nama} sub ${i + 1}`]);
        subIds.push(sid);
        await c.query(
          `INSERT INTO student_mastery (student_id, subtopic_id, current_level, rank_rating, strike_count)
           VALUES ($1, $2, $3, $4, 0)`,
          [studentId, sid, def.subs[i].level, def.subs[i].rr]);
      }

      // Aturan database: soal Level 1-2 terikat TEPAT 1 subtopik; soal Level 3 terikat >= 2 subtopik.
      // Maka: 12 soal Level 1 dan 12 soal Level 2 untuk tiap subtopik, dan (hanya jika topik punya
      // >= 2 subtopik) 12 soal Level 3 yang terikat ke seluruh subtopik topik itu.
      const buatSoal = async (level) => (await c.query(
        `INSERT INTO questions (topic_id, level_soal, soal_teks, opsi_jawaban, kunci_jawaban,
                                target_waktu_detik, poin_reward, poin_penalty, is_domain0)
         SELECT $1, $2::int, 'Soal uji level ' || $2::int, $3::jsonb, '"A"'::jsonb, 60, 10, 2, FALSE
           FROM generate_series(1, 12)
         RETURNING id`,
        [topicId, level, OPSI])).rows.map((r) => r.id);

      for (const sid of subIds) {
        for (const level of [1, 2]) {
          const ids = await buatSoal(level);
          await c.query(
            `INSERT INTO question_subtopics (question_id, subtopic_id)
             SELECT qid, $2::bigint FROM unnest($1::bigint[]) AS qid`,
            [ids, sid]);
        }
      }
      if (subIds.length >= 2) {
        const ids = await buatSoal(3);
        await c.query(
          `INSERT INTO question_subtopics (question_id, subtopic_id)
           SELECT qid, sid FROM unnest($1::bigint[]) AS qid, unnest($2::bigint[]) AS sid`,
          [ids, subIds]);
      }

      topik[nama] = { topicId, subIds };
    }

    await c.query('COMMIT');
    return { subjectId, studentId, topik };
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

const jawaban = (soal, benar, durasi = 10) =>
  soal.map((s, i) => ({
    urutan: i + 1,
    questionId: s.question_id,
    jawaban: benar ? 'A' : 'B',
    durasi,
  }));

const sama = (a, b) => String(a) === String(b);

async function main() {
  console.log('Membersihkan sisa data uji lama (jika ada)...');
  await bersihkan();
  console.log('Membuat data contoh...');
  const S = await seed();

  // Sesi 5 soal. Jika `subIndex` diisi, sesi hanya untuk subtopik itu; jika tidak, untuk seluruh topik.
  const mulai = (nama, subIndex) => startDrill(pool, S.studentId, {
    subjectId: S.subjectId,
    mode: 'drill_ranked',
    topicIds: subIndex === undefined ? [S.topik[nama].topicId] : [],
    subtopicIds: subIndex === undefined ? [] : [S.topik[nama].subIds[subIndex]],
    jumlahSoal: 5,
  });
  // Mulai sesi 5 soal, jawab semuanya benar / salah, kembalikan respons submit
  const mainkan = async (nama, benar, subIndex) => {
    const d = await mulai(nama, subIndex);
    assert.equal(d.soal.length, 5, 'sesi harus 5 soal');
    await mundurkanWaktu(d.attempt_id);
    return submitDrill(pool, S.studentId, { attemptId: d.attempt_id, answers: jawaban(d.soal, benar, 10) });
  };
  const masteryDb = async (subId) => (await pool.query(
    'SELECT current_level, rank_rating, strike_count FROM student_mastery WHERE student_id = $1 AND subtopic_id = $2',
    [S.studentId, subId])).rows[0];
  const topikDb = async (topicId) => (await pool.query(
    `SELECT is_elite, elite_rr, level3_unlocked, cooldown_until
       FROM student_topic_mastery WHERE student_id = $1 AND topic_id = $2`,
    [S.studentId, topicId])).rows[0];
  const dari = (r, subId) => r.mastery.find((m) => sama(m.subtopic_id, subId));

  console.log('Menjalankan pengecekan:\n');

  await cek('promosi: RR 95 di Level 1 + jawaban benar -> naik Level 2, RR mulai 20 lalu bertambah', async () => {
    const { subIds } = S.topik.promosi;
    const r = await mainkan('promosi', true);
    const m = dari(r, subIds[0]);
    assert.equal(m.level_before, 1);
    assert.equal(m.level_after, 2);
    assert.equal(m.naik_level, true);
    // jawaban benar pertama: 95+12 -> 100 -> naik, RR 20; empat jawaban berikutnya +12 tiap kali
    assert.equal(m.rr_after, 68);
    const db = await masteryDb(subIds[0]);
    assert.deepEqual([db.current_level, db.rank_rating, db.strike_count], [2, 68, 0]);
  });

  await cek('L2->L3 tertahan: RR 100 di Level 2 saat Level 3 topik belum terbuka', async () => {
    const { subIds, topicId } = S.topik.tertahan;
    const r = await mainkan('tertahan', true, 0); // sesi khusus subtopik Level 2
    const a = dari(r, subIds[0]);
    assert.equal(a.level_after, 2, 'seharusnya tertahan di Level 2');
    assert.equal(a.rr_after, 100);
    assert.equal(a.naik_level, false);
    const t = await topikDb(topicId);
    assert.equal(t.level3_unlocked, false, 'Level 3 belum boleh terbuka (1 dari 3 subtopik di Level 2+)');
  });

  await cek('Level 3 terbuka: subtopik ke-2 naik ke Level 2 (2 dari 3 subtopik >= 50%)', async () => {
    const { subIds, topicId } = S.topik.terbuka;
    const before = await topikDb(topicId);
    assert.ok(!before || before.level3_unlocked === false, 'awalnya terkunci');
    const r = await mainkan('terbuka', true, 1); // sesi khusus subtopik Level 1 ber-RR 95
    assert.equal(dari(r, subIds[1]).naik_level, true);
    assert.equal((await topikDb(topicId)).level3_unlocked, true, 'Level 3 tidak terbuka / tidak tersimpan');
  });

  await cek('Elite: semua subtopik Level 3 + jawaban benar -> topik masuk Elite', async () => {
    const { topicId } = S.topik.elite;
    await mainkan('elite', true);
    const db = await topikDb(topicId);
    assert.equal(db.is_elite, true);
    assert.equal(db.elite_rr, 0);
  });

  await cek('Strike 2 di Level 2: turun ke Level 1, RR 70, strike direset, topik cooldown', async () => {
    const { subIds, topicId } = S.topik.strike2;
    const r = await mainkan('strike2', false);
    const m = dari(r, subIds[0]);
    assert.equal(m.level_before, 2);
    assert.equal(m.level_after, 1);
    assert.equal(m.rr_after, 70);
    assert.equal(m.strike_count, 0);
    assert.equal(m.turun_level, true);
    assert.equal(m.kena_strike_2, true);
    // jawaban salah ke-1 = Strike 1, ke-2 = Strike 2; tiga sisanya dicatat tanpa mengubah RR
    assert.equal(r.hasil.filter((h) => h.efek === 'cooldown').length, 3);
    const db = await masteryDb(subIds[0]);
    assert.deepEqual([db.current_level, db.rank_rating, db.strike_count], [1, 70, 0]);
    const t = await topikDb(topicId);
    assert.ok(t.cooldown_until && new Date(t.cooldown_until) > new Date(), 'cooldown_until tidak terpasang');
  });

  await cek('drill ditolak saat topik cooldown setelah Strike 2', () =>
    harusGagal('TOPIK_COOLDOWN', () => mulai('strike2')));

  await cek('Strike 2 di Level 1: tetap Level 1, RR 0, strike direset', async () => {
    const { subIds } = S.topik.strike2L1;
    const r = await mainkan('strike2L1', false);
    const m = dari(r, subIds[0]);
    assert.equal(m.level_after, 1);
    assert.equal(m.rr_after, 0);
    assert.equal(m.strike_count, 0);
    assert.equal(m.turun_level, false);
    assert.equal(m.kena_strike_2, true);
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
      console.error('GAGAL membersihkan data uji (hapus manual data berkode ZZ-LEVEL):', e.message);
    }
    await pool.end();
    process.exit(gagal ? 1 : 0);
  });
