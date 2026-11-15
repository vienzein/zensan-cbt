'use strict';

/**
 * Impor bank soal dari CSV ke database.
 *
 *   npm run impor:soal -- seed/soal-saya.csv            # SIMULASI: memeriksa semuanya, tidak menyimpan
 *   npm run impor:soal -- seed/soal-saya.csv --tulis    # menyimpan
 *
 * Aturan: tes dan subtes harus sudah ada; topik dan subtopik yang belum ada dibuat otomatis; soal yang
 * sama (topik + teks soal) dilewati, jadi aman dijalankan ulang. Semua atau tidak sama sekali (satu transaksi).
 * Format kolom: lihat seed/PETUNJUK-IMPOR-SOAL.md dan seed/templat-soal.csv.
 */

const fs = require('node:fs');
const pool = require('../src/db');
const { parseCsv, validasi, topikButuhDomain0 } = require('../src/services/imporSoal');

const [, , berkas, ...flag] = process.argv;
const tulis = flag.includes('--tulis');

function keluar(kode, pesan) {
  if (pesan) console.error(pesan);
  process.exit(kode);
}

async function main() {
  if (!berkas) keluar(2, 'Pemakaian: npm run impor:soal -- <berkas.csv> [--tulis]');
  if (!fs.existsSync(berkas)) keluar(2, `Berkas tidak ditemukan: ${berkas}`);

  const { soal, galat } = validasi(parseCsv(fs.readFileSync(berkas, 'utf8')));
  if (galat.length) {
    console.error(`Ada ${galat.length} masalah di berkas. Perbaiki lalu jalankan lagi (belum ada yang disimpan):\n`);
    galat.slice(0, 50).forEach((g) => console.error(`  baris ${g.baris}: ${g.pesan}`));
    if (galat.length > 50) console.error(`  ... dan ${galat.length - 50} lainnya`);
    keluar(1);
  }
  if (!soal.length) keluar(1, 'Tidak ada soal di berkas.');

  const c = await pool.connect();
  const masalah = [];
  const stat = { baru: 0, ada: 0, kembar: 0, topikBaru: 0, subBaru: 0, domain0TakTerpakai: 0 };
  const perKelompok = new Map(); // "TES / SUBTES / L1" -> jumlah soal baru
  try {
    await c.query('BEGIN');

    const cache = new Map();
    const sekali = async (kunci, fn) => {
      if (!cache.has(kunci)) cache.set(kunci, await fn());
      return cache.get(kunci);
    };
    const dalamBerkas = new Set();

    for (const s of soal) {
      const cg = await sekali(`cg:${s.tes}`, async () =>
        (await c.query('SELECT id FROM curriculum_groups WHERE upper(kode) = $1', [s.tes])).rows[0]?.id ?? null);
      if (!cg) { masalah.push({ baris: s.baris, pesan: `tes "${s.tes}" belum ada di database` }); continue; }

      const subjectId = await sekali(`sj:${cg}:${s.subtes}`, async () =>
        (await c.query('SELECT id FROM subjects WHERE curriculum_group_id = $1 AND upper(kode) = $2', [cg, s.subtes]))
          .rows[0]?.id ?? null);
      if (!subjectId) { masalah.push({ baris: s.baris, pesan: `subtes "${s.subtes}" belum ada di tes ${s.tes}` }); continue; }

      const butuhD0 = topikButuhDomain0(s);
      const topicId = await sekali(`tp:${subjectId}:${s.topik}`, async () => {
        const ada = await c.query('SELECT id, requires_domain0 FROM topics WHERE subject_id = $1 AND nama = $2', [subjectId, s.topik]);
        if (ada.rows.length) return { id: ada.rows[0].id, butuhD0: ada.rows[0].requires_domain0 };
        const baru = await c.query(
          'INSERT INTO topics (subject_id, nama, requires_domain0) VALUES ($1, $2, $3) RETURNING id', [subjectId, s.topik, butuhD0]);
        stat.topikBaru += 1;
        return { id: baru.rows[0].id, butuhD0 };
      });

      const subIds = [];
      for (const nama of s.subtopik) {
        subIds.push(await sekali(`sb:${topicId.id}:${nama}`, async () => {
          const ada = await c.query('SELECT id FROM subtopics WHERE topic_id = $1 AND nama = $2', [topicId.id, nama]);
          if (ada.rows.length) return ada.rows[0].id;
          const baru = await c.query('INSERT INTO subtopics (topic_id, nama) VALUES ($1, $2) RETURNING id', [topicId.id, nama]);
          stat.subBaru += 1;
          return baru.rows[0].id;
        }));
      }

      const kunciSoal = `${topicId.id}|${s.teks}`;
      if (dalamBerkas.has(kunciSoal)) { stat.kembar += 1; continue; }
      dalamBerkas.add(kunciSoal);
      const sudah = await c.query('SELECT 1 FROM questions WHERE topic_id = $1 AND soal_teks = $2 LIMIT 1', [topicId.id, s.teks]);
      if (sudah.rows.length) { stat.ada += 1; continue; }

      const q = await c.query(
        `INSERT INTO questions (topic_id, level_soal, soal_teks, soal_gambar_url, opsi_jawaban, kunci_jawaban,
                                target_waktu_detik, poin_reward, poin_penalty, is_domain0,
                                pembahasan, pembahasan_gambar_url)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [topicId.id, s.level, s.teks, s.gambarUrl, JSON.stringify(s.opsi), JSON.stringify(s.kunci),
          s.waktu, s.poin, Math.max(1, Math.round(s.poin * 0.2)), s.domain0,
          s.pembahasan, s.pembahasanGambarUrl],
      );
      for (const sid of subIds) {
        await c.query('INSERT INTO question_subtopics (question_id, subtopic_id) VALUES ($1, $2)', [q.rows[0].id, sid]);
      }
      stat.baru += 1;
      if (s.domain0 && !topicId.butuhD0) stat.domain0TakTerpakai += 1;
      const k = `${s.tes} / ${s.subtes} / Level ${s.level}`;
      perKelompok.set(k, (perKelompok.get(k) || 0) + 1);
    }

    if (masalah.length) {
      await c.query('ROLLBACK');
      console.error(`Ada ${masalah.length} masalah (belum ada yang disimpan):\n`);
      masalah.slice(0, 50).forEach((g) => console.error(`  baris ${g.baris}: ${g.pesan}`));
      keluar(1);
    }

    if (tulis) {
      await c.query('COMMIT'); // aturan ikatan subtopik di database diperiksa di sini
    } else {
      await c.query('SET CONSTRAINTS ALL IMMEDIATE'); // periksa aturan database seolah-olah sungguhan
      await c.query('ROLLBACK');
    }
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* sudah ditutup */ }
    keluar(1, `Dibatalkan, tidak ada yang disimpan. Penyebab dari database:\n  ${e.message}`);
  } finally {
    c.release();
  }

  console.log(tulis ? '\nTERSIMPAN' : '\nSIMULASI (tidak ada yang disimpan; tambahkan --tulis untuk menyimpan)');
  console.log(`  soal baru            : ${stat.baru}`);
  console.log(`  sudah ada (dilewati) : ${stat.ada}`);
  if (stat.kembar) console.log(`  kembar di berkas     : ${stat.kembar}`);
  console.log(`  topik baru           : ${stat.topikBaru}`);
  console.log(`  subtopik baru        : ${stat.subBaru}`);
  if (stat.domain0TakTerpakai) {
    console.log(`  PERHATIAN: ${stat.domain0TakTerpakai} soal bertanda domain0 berada di topik yang tidak butuh Domain 0, jadi tidak akan dipakai.`);
  }
  if (perKelompok.size) {
    console.log('\nSoal baru per kelompok:');
    [...perKelompok].sort().forEach(([k, n]) => console.log(`  ${k}: ${n}`));
  }
}

main()
  .catch((e) => keluar(1, `Error tak terduga: ${e.message}`))
  .finally(() => pool.end());
