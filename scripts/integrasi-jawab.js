'use strict';

/**
 * Tes integrasi ke database SUNGGUHAN untuk jawaban per soal (popup RR): POST /api/drill/jawab.
 * Data contoh bertanda 'ZZ-JAWAB' / integrasi-jawab@example.com, dihapus otomatis di akhir.
 *
 * Prasyarat: migrasi 006 sudah dijalankan.
 * Jalankan:  npm run test:jawab   (atau: node --env-file=.env scripts/integrasi-jawab.js)
 */

const assert = require('node:assert/strict');
const pool = require('../src/db');
const { startDrill } = require('../src/services/drillStartService');
const { submitDrill } = require('../src/services/drillSubmitService');
const { jawabDrill } = require('../src/services/drillAnswerService');

const KODE = 'ZZ-JAWAB';
const EMAIL = 'integrasi-jawab@example.com';

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

async function seed() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const one = async (sql, params) => (await c.query(sql, params)).rows[0].id;
    const cg = await one(`INSERT INTO curriculum_groups (kode, nama, tahun) VALUES ($1, 'Uji Jawab', 2026) RETURNING id`, [KODE]);
    const subjectId = await one(`INSERT INTO subjects (curriculum_group_id, kode, nama, urutan) VALUES ($1, 'PK', 'Uji PK', 1) RETURNING id`, [cg]);
    const topicId = await one(`INSERT INTO topics (subject_id, nama, requires_domain0) VALUES ($1, 'Uji Topik', FALSE) RETURNING id`, [subjectId]);
    const sub = await one(`INSERT INTO subtopics (topic_id, nama) VALUES ($1, 'Uji Sub') RETURNING id`, [topicId]);
    const studentId = await one(`INSERT INTO students (email, nama) VALUES ($1, 'Siswa Uji Jawab') RETURNING id`, [EMAIL]);

    const opsi = JSON.stringify([
      { kode: 'A', teks: 'Pilihan A' }, { kode: 'B', teks: 'Pilihan B' },
      { kode: 'C', teks: 'Pilihan C' }, { kode: 'D', teks: 'Pilihan D' },
    ]);
    // 20 soal Level 1, kunci 'A', target 60 detik, poin 10; semua terikat 1 subtopik
    const ids = (await c.query(
      `INSERT INTO questions (topic_id, level_soal, soal_teks, opsi_jawaban, kunci_jawaban,
                              target_waktu_detik, poin_reward, poin_penalty, is_domain0)
       SELECT $1, 1, 'Soal uji jawab ' || g, $2::jsonb, '"A"'::jsonb, 60, 10, 2, FALSE
         FROM generate_series(1, 20) g
       RETURNING id`, [topicId, opsi])).rows.map((r) => r.id);
    await c.query(
      `INSERT INTO question_subtopics (question_id, subtopic_id) SELECT q, $2::bigint FROM unnest($1::bigint[]) q`,
      [ids, sub]);
    await c.query('COMMIT');
    return { subjectId, topicId, sub, studentId, semuaSoal: ids };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

const mundurkanWaktu = (attemptId) =>
  pool.query(`UPDATE student_attempts SET started_at = now() - interval '2 hours' WHERE id = $1`, [attemptId]);

async function main() {
  console.log('Membersihkan sisa data uji lama (jika ada)...');
  await bersihkan();
  console.log('Membuat data contoh...');
  const S = await seed();
  const mulai = (mode) => startDrill(pool, S.studentId, {
    subjectId: S.subjectId, mode, topicIds: [S.topicId], subtopicIds: [], jumlahSoal: 5,
  });
  const jawab = (attemptId, soal, jawaban, durasi) => jawabDrill(pool, S.studentId, {
    attemptId,
    answer: { urutan: 1, questionId: soal.question_id, jawaban, durasi },
  });
  console.log('Menjalankan pengecekan:\n');

  const sesi = await mulai('drill_ranked');
  await mundurkanWaktu(sesi.attempt_id);
  const [q1, q2, q3, q4, q5] = sesi.soal;

  await cek('jawaban benar cepat: umpan balik +12 RR (poin 10 + bonus kecepatan 2), streak 1', async () => {
    const r = await jawab(sesi.attempt_id, q1, 'A', 20); // 20 detik < 50% dari 60
    assert.equal(r.is_correct, true);
    assert.equal(r.rr_delta, 12);
    assert.equal(r.is_speed_bonus, true);
    assert.equal(r.streak_benar, 1);
    assert.equal(r.jumlah_dijawab, 1);
  });

  await cek('jawaban salah: umpan balik -2 RR, streak kembali 0', async () => {
    const r = await jawab(sesi.attempt_id, q2, 'B', 30);
    assert.equal(r.is_correct, false);
    assert.equal(r.rr_delta, -2);
    assert.equal(r.streak_benar, 0);
  });

  await cek('RR belum ditulis ke database selama sesi berjalan', async () => {
    const { rows } = await pool.query(
      `SELECT rank_rating FROM student_mastery WHERE student_id = $1 AND subtopic_id = $2`,
      [S.studentId, S.sub]);
    assert.ok(rows.length === 0 || rows[0].rank_rating === 0);
  });

  await cek('jawaban terkunci: menjawab soal yang sama lagi ditolak (409)', () =>
    harusGagal('SUDAH_DIJAWAB', () => jawab(sesi.attempt_id, q1, 'B', 5)));

  await cek('soal di luar sesi ditolak (422)', async () => {
    const dalam = new Set(sesi.soal.map((s) => String(s.question_id)));
    const luar = S.semuaSoal.find((id) => !dalam.has(String(id)));
    await harusGagal('SOAL_BUKAN_BAGIAN_SESI', () =>
      jawabDrill(pool, S.studentId, {
        attemptId: sesi.attempt_id,
        answer: { urutan: 1, questionId: String(luar), jawaban: 'A', durasi: 5 },
      }));
  });

  await cek('durasi melebihi lama sesi ditolak (422)', () =>
    harusGagal('DURASI_TIDAK_VALID', () => jawab(sesi.attempt_id, q3, 'A', 8000)));

  await cek('submit akhir memakai jawaban terkunci: ubahan dan penghilangan di body diabaikan', async () => {
    // body mencoba: mengubah jawaban soal 1 menjadi salah, dan menghilangkan soal 2 (yang salah)
    const body = [
      { urutan: 1, questionId: q1.question_id, jawaban: 'B', durasi: 1 },
      { urutan: 2, questionId: q3.question_id, jawaban: 'A', durasi: 10 },
      { urutan: 3, questionId: q4.question_id, jawaban: 'A', durasi: 10 },
      { urutan: 4, questionId: q5.question_id, jawaban: 'A', durasi: 10 },
    ];
    const r = await submitDrill(pool, S.studentId, { attemptId: sesi.attempt_id, answers: body });
    assert.equal(r.ringkasan.jumlah_dijawab, 5, 'soal terkunci yang dihilangkan tetap dihitung');
    assert.equal(r.ringkasan.jumlah_benar, 4);
    assert.equal(r.ringkasan.jumlah_salah, 1);
    assert.equal(r.hasil[0].is_correct, true, 'jawaban terkunci soal 1 tidak bisa diganti');
    // 12 (cepat) - 2 (salah) + 3 x 12 (benar cepat) = 46, sama dengan jumlah umpan balik per soal
    assert.equal(r.ringkasan.total_rr_delta, 46);
    assert.equal(r.mastery[0].rr_after, 46);
  });

  await cek('menjawab setelah sesi selesai ditolak (409)', () =>
    harusGagal('ATTEMPT_SUDAH_SELESAI', () => jawab(sesi.attempt_id, q3, 'A', 5)));

  await cek('drill_free: umpan balik ada tetapi RR 0 (tanpa RR)', async () => {
    const s2 = await mulai('drill_free');
    await mundurkanWaktu(s2.attempt_id);
    const r = await jawab(s2.attempt_id, s2.soal[0], 'A', 20);
    assert.equal(r.is_correct, true);
    assert.equal(r.rr_delta, 0);
    assert.equal(r.efek, 'tanpa_rr');
  });

  await cek('Strike 1 dan urutan: salah-benar-benar-salah-salah tidak memicu jeda, RR akhir 16', async () => {
    // siswa dan data baru supaya RR mulai dari 0
    await pool.query('DELETE FROM student_mastery WHERE student_id = $1', [S.studentId]);
    await pool.query('DELETE FROM student_topic_mastery WHERE student_id = $1', [S.studentId]);
    const s3 = await mulai('drill_ranked');
    await mundurkanWaktu(s3.attempt_id);
    const urutanBenar = [false, true, true, false, false];
    const umpan = [];
    for (let i = 0; i < 5; i += 1) {
      umpan.push(await jawab(s3.attempt_id, s3.soal[i], urutanBenar[i] ? 'A' : 'B', 30));
    }
    assert.equal(umpan[0].kena_strike, 1, 'salah pertama saat RR 0 = Strike 1');
    assert.equal(umpan[0].rr_delta, 0, 'Strike 1 tidak mengurangi RR');
    const jumlahUmpan = umpan.reduce((t, u) => t + u.rr_delta, 0);
    const r = await submitDrill(pool, S.studentId, {
      attemptId: s3.attempt_id,
      answers: s3.soal.map((q, i) => ({ urutan: i + 1, questionId: q.question_id, jawaban: 'A', durasi: 1 })),
    });
    assert.equal(r.ringkasan.total_rr_delta, jumlahUmpan, 'jumlah popup = total resmi');
    assert.equal(r.mastery[0].rr_after, jumlahUmpan);
    assert.equal(r.topik.some((t) => t.cooldown_until && new Date(t.cooldown_until) > new Date()), false,
      'tidak ada jeda');
  });

  await cek('waktu habis Level 1: tidak mengurangi RR; tombol Lewati (tanpa waktu habis) tetap dihitung salah', async () => {
    await pool.query('DELETE FROM student_mastery WHERE student_id = $1', [S.studentId]);
    await pool.query('DELETE FROM student_topic_mastery WHERE student_id = $1', [S.studentId]);
    const s4 = await mulai('drill_ranked');
    await mundurkanWaktu(s4.attempt_id);
    const kirim = (q, jawaban, durasi, waktuHabis) => jawabDrill(pool, S.studentId, {
      attemptId: s4.attempt_id,
      answer: { urutan: 1, questionId: q.question_id, jawaban, durasi, waktuHabis },
    });
    const a = await kirim(s4.soal[0], 'A', 40, false);         // benar, RR naik
    assert.ok(a.rr_delta > 0);
    const b = await kirim(s4.soal[1], null, 58, true);          // waktu habis (target 60 detik)
    assert.equal(b.efek, 'waktu_habis');
    assert.equal(b.rr_delta, 0);
    const c = await kirim(s4.soal[2], null, 58, false);         // Lewati: bukan waktu habis
    assert.equal(c.efek, 'diterapkan');
    assert.ok(c.rr_delta < 0);
    const d = await kirim(s4.soal[3], null, 20, true);          // klaim waktu habis tetapi terlalu cepat
    assert.equal(d.efek, 'diterapkan');
    assert.ok(d.rr_delta < 0);
  });

  console.log(`\n${lulus} lulus, ${gagal} gagal`);
}

main()
  .catch((e) => {
    console.error('\nTes berhenti karena error tak terduga:', e);
    gagal += 1;
  })
  .finally(async () => {
    console.log('Menghapus data uji...');
    try {
      await bersihkan();
      console.log('Data uji terhapus.');
    } catch (e) {
      console.error('Gagal menghapus data uji:', e.message);
    }
    await pool.end();
    process.exit(gagal ? 1 : 0);
  });
