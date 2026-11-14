'use strict';

/**
 * Tes integrasi ke database SUNGGUHAN untuk endpoint baca: /api/me, /api/me/tes,
 * /api/kurikulum, /api/kurikulum/:id/beranda.
 * Data contoh bertanda 'ZZ-BACA' dan 'ZZ-BACB' / integrasi-baca@example.com, dihapus otomatis di akhir.
 *
 * Prasyarat: migrasi 005 sudah dijalankan.
 * Jalankan:  npm run test:baca   (atau: node --env-file=.env scripts/integrasi-baca.js)
 */

const assert = require('node:assert/strict');
const express = require('express');
const pool = require('../src/db');
const { getMe, setActiveTest, listCurricula, getBeranda } = require('../src/services/readService');
const meRouter = require('../src/routes/me');
const kurikulumRouter = require('../src/routes/kurikulum');

const KODE_A = 'ZZ-BACA';
const KODE_B = 'ZZ-BACB';
const EMAIL = 'integrasi-baca@example.com';

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
  for (const kode of [KODE_A, KODE_B]) {
    const c = await pool.query('SELECT id FROM curriculum_groups WHERE kode = $1', [kode]);
    if (!c.rows.length) continue;
    const cg = c.rows[0].id;
    const topikSub = `SELECT t.id FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE s.curriculum_group_id = $1`;
    await pool.query(`DELETE FROM subtopics WHERE topic_id IN (${topikSub})`, [cg]);
    await pool.query(`DELETE FROM topics WHERE id IN (${topikSub})`, [cg]);
    await pool.query('DELETE FROM subjects WHERE curriculum_group_id = $1', [cg]);
    await pool.query('DELETE FROM curriculum_groups WHERE id = $1', [cg]);
  }
}

async function seed() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const one = async (sql, params) => (await c.query(sql, params)).rows[0].id;

    // Tes A: dua subtes. Subtes 1 punya topik matematika (butuh Domain 0) dengan 2 subtopik.
    const A = await one(`INSERT INTO curriculum_groups (kode, nama, tahun) VALUES ($1, 'Uji Tes A', 2026) RETURNING id`, [KODE_A]);
    const s1 = await one(`INSERT INTO subjects (curriculum_group_id, kode, nama, urutan) VALUES ($1, 'PK', 'Uji Kuantitatif', 1) RETURNING id`, [A]);
    const s2 = await one(`INSERT INTO subjects (curriculum_group_id, kode, nama, urutan) VALUES ($1, 'PBM', 'Uji Bacaan', 2) RETURNING id`, [A]);
    const tMat = await one(`INSERT INTO topics (subject_id, nama, requires_domain0) VALUES ($1, 'Uji Aljabar', TRUE) RETURNING id`, [s1]);
    const tTeks = await one(`INSERT INTO topics (subject_id, nama, requires_domain0) VALUES ($1, 'Uji Teks', FALSE) RETURNING id`, [s2]);
    const subM1 = await one(`INSERT INTO subtopics (topic_id, nama) VALUES ($1, 'Uji Persamaan') RETURNING id`, [tMat]);
    const subM2 = await one(`INSERT INTO subtopics (topic_id, nama) VALUES ($1, 'Uji Fungsi') RETURNING id`, [tMat]);
    const subT1 = await one(`INSERT INTO subtopics (topic_id, nama) VALUES ($1, 'Uji Gagasan Utama') RETURNING id`, [tTeks]);

    // Tes B: satu subtes, tanpa topik matematika (tidak butuh Domain 0)
    const B = await one(`INSERT INTO curriculum_groups (kode, nama, tahun) VALUES ($1, 'Uji Tes B', 2026) RETURNING id`, [KODE_B]);
    const sB = await one(`INSERT INTO subjects (curriculum_group_id, kode, nama, urutan) VALUES ($1, 'TWK', 'Uji Wawasan', 1) RETURNING id`, [B]);
    const tB = await one(`INSERT INTO topics (subject_id, nama, requires_domain0) VALUES ($1, 'Uji Pancasila', FALSE) RETURNING id`, [sB]);
    const subB1 = await one(`INSERT INTO subtopics (topic_id, nama) VALUES ($1, 'Uji Sila') RETURNING id`, [tB]);

    const studentId = await one(`INSERT INTO students (email, nama) VALUES ($1, 'Siswa Uji Baca') RETURNING id`, [EMAIL]);

    // Kondisi penguasaan siswa pada Tes A
    await c.query(
      `INSERT INTO student_mastery (student_id, subtopic_id, current_level, rank_rating, strike_count) VALUES
         ($1, $2, 2, 68, 0), ($1, $3, 1, 30, 1), ($1, $4, 3, 100, 0)`,
      [studentId, subM1, subM2, subT1]);
    await c.query(
      `INSERT INTO student_topic_mastery (student_id, topic_id, is_elite, elite_rr, level3_unlocked, cooldown_until)
       VALUES ($1, $2, TRUE, 40, TRUE, now() + interval '7 minutes')`,
      [studentId, tTeks]);

    await c.query('COMMIT');
    return { A, B, s1, s2, tMat, tTeks, subM1, subM2, subT1, studentId };
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

async function main() {
  console.log('Membersihkan sisa data uji lama (jika ada)...');
  await bersihkan();
  console.log('Membuat data contoh...');
  const S = await seed();
  const sama = (a, b) => String(a) === String(b);
  const cari = (arr, id) => arr.find((x) => sama(x.id, id));

  console.log('Menjalankan pengecekan:\n');

  await cek('daftar tes memuat Tes A dan Tes B dengan jumlah subtes dan syarat Domain 0', async () => {
    const list = await listCurricula(pool, S.studentId);
    const a = cari(list, S.A);
    const b = cari(list, S.B);
    assert.ok(a && b, 'Tes uji tidak ada di daftar');
    assert.equal(a.jumlah_subtes, 2);
    assert.equal(a.butuh_domain0, true);
    assert.equal(b.jumlah_subtes, 1);
    assert.equal(b.butuh_domain0, false);
    assert.equal(a.aktif, false);
  });

  await cek('profil awal: belum ada tes aktif', async () => {
    const me = await getMe(pool, S.studentId);
    assert.equal(me.email, EMAIL);
    assert.equal(me.nama, 'Siswa Uji Baca');
    assert.equal(me.tes_aktif, null);
    assert.equal(me.paket, 'gratis');
  });

  await cek('pilih tes: tes aktif tersimpan dan hanya satu yang ditandai aktif', async () => {
    const me = await setActiveTest(pool, S.studentId, S.A);
    assert.ok(sama(me.tes_aktif.id, S.A));
    assert.equal(me.tes_aktif.kode, KODE_A);
    const list = await listCurricula(pool, S.studentId);
    assert.equal(cari(list, S.A).aktif, true);
    assert.equal(cari(list, S.B).aktif, false);
  });

  await cek('pindah ke Tes B lalu kembali; tes yang tidak ada ditolak', async () => {
    const me = await setActiveTest(pool, S.studentId, S.B);
    assert.equal(me.tes_aktif.kode, KODE_B);
    await setActiveTest(pool, S.studentId, S.A);
    await harusGagal('KURIKULUM_TIDAK_DITEMUKAN', () => setActiveTest(pool, S.studentId, '999999999999'));
  });

  await cek('beranda Tes A: topik, subtopik, level, RR, Elite, dan cooldown sesuai data', async () => {
    const b = await getBeranda(pool, S.studentId, S.A);
    assert.equal(b.tes.kode, KODE_A);
    assert.equal(b.paket, 'gratis');
    assert.equal(b.subtes.length, 2);
    assert.deepEqual(b.subtes.map((x) => x.kode), ['PK', 'PBM']);

    const mat = cari(b.subtes[0].topik, S.tMat);
    assert.equal(mat.subtopik.length, 2);
    const m1 = cari(mat.subtopik, S.subM1);
    assert.deepEqual([m1.level, m1.level_nama, m1.rr], [2, 'Pejuang', 68]);
    const m2 = cari(mat.subtopik, S.subM2);
    assert.deepEqual([m2.level, m2.rr, m2.strike_count], [1, 30, 1]);
    assert.equal(mat.ringkasan.rr_rata_rata, 49);
    assert.equal(mat.ringkasan.level_terendah, 1);
    assert.equal(mat.level3_unlocked, false);
    assert.equal(mat.cooldown_aktif, false);
    assert.equal(mat.cooldown_until, null);

    const teks = cari(b.subtes[1].topik, S.tTeks);
    assert.equal(teks.is_elite, true);
    assert.equal(teks.elite_rr, 40);
    assert.equal(teks.cooldown_aktif, true);
    assert.ok(teks.cooldown_until, 'cooldown_until kosong');
    assert.equal(teks.subtopik[0].level_nama, 'Ahli');
  });

  await cek('Domain 0: topik matematika terkunci sebelum lulus, topik lain tidak', async () => {
    const b = await getBeranda(pool, S.studentId, S.A);
    assert.deepEqual([b.domain0.diperlukan, b.domain0.lulus], [true, false]);
    assert.equal(cari(b.subtes[0].topik, S.tMat).terkunci_domain0, true);
    assert.equal(cari(b.subtes[1].topik, S.tTeks).terkunci_domain0, false);
  });

  await cek('setelah Domain 0 lulus: topik matematika terbuka', async () => {
    await pool.query(
      `INSERT INTO student_attempts (student_id, subject_id, curriculum_group_id, mode, jumlah_soal,
                                     status, jumlah_benar, jumlah_salah, finished_at)
       VALUES ($1, NULL, $2, 'domain0', 5, 'selesai', 5, 0, now())`,
      [S.studentId, S.A]);
    const b = await getBeranda(pool, S.studentId, S.A);
    assert.deepEqual([b.domain0.diperlukan, b.domain0.lulus], [true, true]);
    assert.equal(cari(b.subtes[0].topik, S.tMat).terkunci_domain0, false);
  });

  await cek('kuota harian dan hari beruntun dihitung dari latihan yang selesai', async () => {
    const awal = await getBeranda(pool, S.studentId, S.A);
    assert.deepEqual([awal.kuota.batas, awal.kuota.terpakai, awal.kuota.sisa], [20, 0, 20]);
    assert.equal(awal.streak_hari, 0);

    const ins = (mode, benar, salah, geser) => pool.query(
      `INSERT INTO student_attempts (student_id, subject_id, curriculum_group_id, mode, jumlah_soal,
                                     status, jumlah_benar, jumlah_salah, finished_at)
       VALUES ($1, $2, $3, $4, $5, 'selesai', $6, $7, now() - $8::interval)`,
      [S.studentId, S.s1, S.A, mode, benar + salah, benar, salah, geser]);
    await ins('drill_ranked', 5, 2, '0 days');      // hari ini: 7 soal
    await ins('drill_free', 4, 1, '1 day');         // kemarin
    await ins('drill_ranked', 3, 0, '2 days');      // dua hari lalu
    const b = await getBeranda(pool, S.studentId, S.A);
    assert.deepEqual([b.kuota.terpakai, b.kuota.sisa], [7, 13]);
    assert.equal(b.streak_hari, 3);
  });

  await cek('beranda Tes B: tanpa Domain 0, semua subtopik mulai dari Level 1 RR 0', async () => {
    const b = await getBeranda(pool, S.studentId, S.B);
    assert.equal(b.tes.kode, KODE_B);
    assert.deepEqual([b.domain0.diperlukan, b.domain0.lulus], [false, true]);
    assert.equal(b.subtes.length, 1);
    const sub = b.subtes[0].topik[0].subtopik[0];
    assert.deepEqual([sub.level, sub.rr, sub.strike_count], [1, 0, 0]);
    assert.equal(b.subtes[0].topik[0].terkunci_domain0, false);
  });

  await cek('beranda untuk tes yang tidak ada ditolak', () =>
    harusGagal('KURIKULUM_TIDAK_DITEMUKAN', () => getBeranda(pool, S.studentId, '999999999999')));

  // ---- Lapisan HTTP (rute), dengan login palsu karena auth sudah diuji terpisah ----
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = { id: S.studentId }; next(); });
  app.use('/api/me', meRouter);
  app.use('/api/kurikulum', kurikulumRouter);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: { code: err.code || 'INTERNAL', message: err.message } });
  });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const http = async (method, path, body) => {
    const r = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, json: await r.json() };
  };

  await cek('HTTP GET /api/me dan GET /api/kurikulum', async () => {
    const me = await http('GET', '/api/me');
    assert.equal(me.status, 200);
    assert.equal(me.json.email, EMAIL);
    const k = await http('GET', '/api/kurikulum');
    assert.equal(k.status, 200);
    assert.ok(Array.isArray(k.json.tes) && k.json.tes.length >= 2);
  });

  await cek('HTTP PUT /api/me/tes: sukses, body salah 422, tes tidak ada 404', async () => {
    const ok = await http('PUT', '/api/me/tes', { curriculum_group_id: String(S.B) });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.tes_aktif.kode, KODE_B);
    const bad = await http('PUT', '/api/me/tes', { curriculum_group_id: 'abc' });
    assert.equal(bad.status, 422);
    const none = await http('PUT', '/api/me/tes', { curriculum_group_id: '999999999999' });
    assert.equal(none.status, 404);
  });

  await cek('HTTP GET /api/kurikulum/:id/beranda: sukses, ID salah 422, tidak ada 404', async () => {
    const ok = await http('GET', `/api/kurikulum/${S.A}/beranda`);
    assert.equal(ok.status, 200);
    assert.equal(ok.json.tes.kode, KODE_A);
    assert.equal(ok.json.subtes.length, 2);
    const bad = await http('GET', '/api/kurikulum/abc/beranda');
    assert.equal(bad.status, 422);
    const none = await http('GET', '/api/kurikulum/999999999999/beranda');
    assert.equal(none.status, 404);
  });

  server.close();
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
      console.error('GAGAL membersihkan data uji (hapus manual data berkode ZZ-BACA / ZZ-BACB):', e.message);
    }
    await pool.end();
    process.exit(gagal ? 1 : 0);
  });
