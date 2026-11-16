'use strict';

/**
 * Memasukkan topik dan subtopik dari silabus ke database, supaya namanya PERSIS sama dengan yang
 * dipakai di dokumen soal.
 *
 *   npm run impor:silabus -- seed/silabus-snbt.md            # SIMULASI: tidak menyimpan
 *   npm run impor:silabus -- seed/silabus-snbt.md --tulis    # menyimpan
 *
 * Aman dijalankan ulang: yang sudah ada dilewati. Tidak pernah menghapus atau mengubah topik yang sudah ada
 * (topik di database yang tidak ada di silabus hanya dilaporkan). Tes bawaan SNBT; ganti dengan --tes=CPNS.
 */

const fs = require('node:fs');
const pool = require('../src/db');
const { parseSilabus, ringkasSilabus } = require('../src/services/silabus');
const { topikButuhDomain0 } = require('../src/services/imporSoal');

const [, , berkas, ...flag] = process.argv;
const tulis = flag.includes('--tulis');
const tes = ((flag.find((f) => f.startsWith('--tes=')) || '--tes=SNBT').split('=')[1] || 'SNBT').toUpperCase();

function keluar(kode, pesan) {
  if (pesan) console.error(pesan);
  process.exit(kode);
}

async function main() {
  if (!berkas) keluar(2, 'Pemakaian: npm run impor:silabus -- <silabus.md> [--tulis] [--tes=SNBT]');
  if (!fs.existsSync(berkas)) keluar(2, `Berkas tidak ditemukan: ${berkas}`);

  const { baris, galat } = parseSilabus(fs.readFileSync(berkas, 'utf8'));
  if (galat.length) {
    console.error(`Ada ${galat.length} masalah di silabus (belum ada yang disimpan):\n`);
    galat.forEach((g) => console.error(`  ${g.baris ? `baris ${g.baris}: ` : ''}${g.pesan}`));
    keluar(1);
  }
  if (!baris.length) keluar(1, 'Tidak ada subtopik terbaca di silabus.');

  const { tunggal } = ringkasSilabus(baris);
  const c = await pool.connect();
  const stat = { topikBaru: 0, topikAda: 0, subBaru: 0, subAda: 0 };
  const perSubtes = new Map();
  const masalah = [];
  try {
    await c.query('BEGIN');
    const cg = (await c.query('SELECT id FROM curriculum_groups WHERE upper(kode) = $1', [tes])).rows[0]?.id;
    if (!cg) throw new Error(`tes "${tes}" belum ada di database`);

    const subjects = new Map();
    const topics = new Map();
    for (const b of baris) {
      if (!subjects.has(b.subtes)) {
        const r = await c.query('SELECT id FROM subjects WHERE curriculum_group_id = $1 AND upper(kode) = $2', [cg, b.subtes]);
        subjects.set(b.subtes, r.rows[0]?.id ?? null);
      }
      const subjectId = subjects.get(b.subtes);
      if (!subjectId) { masalah.push(`${b.kode}: subtes "${b.subtes}" belum ada di tes ${tes}`); continue; }

      const kunciTopik = `${subjectId}|${b.topik}`;
      if (!topics.has(kunciTopik)) {
        const ada = await c.query('SELECT id FROM topics WHERE subject_id = $1 AND nama = $2', [subjectId, b.topik]);
        if (ada.rows.length) { topics.set(kunciTopik, ada.rows[0].id); stat.topikAda += 1; } else {
          const baru = await c.query(
            'INSERT INTO topics (subject_id, nama, requires_domain0) VALUES ($1, $2, $3) RETURNING id',
            [subjectId, b.topik, topikButuhDomain0({ subtes: b.subtes, topikButuhDomain0: null })]);
          topics.set(kunciTopik, baru.rows[0].id);
          stat.topikBaru += 1;
        }
      }
      const topicId = topics.get(kunciTopik);
      const adaSub = await c.query('SELECT 1 FROM subtopics WHERE topic_id = $1 AND nama = $2', [topicId, b.subtopik]);
      if (adaSub.rows.length) stat.subAda += 1; else {
        await c.query('INSERT INTO subtopics (topic_id, nama) VALUES ($1, $2)', [topicId, b.subtopik]);
        stat.subBaru += 1;
        perSubtes.set(b.subtes, (perSubtes.get(b.subtes) || 0) + 1);
      }
    }
    if (masalah.length) {
      await c.query('ROLLBACK');
      console.error(`Ada ${masalah.length} masalah (belum ada yang disimpan):\n`);
      masalah.forEach((m) => console.error(`  ${m}`));
      keluar(1);
    }

    // Topik di database (tes ini) yang tidak ada di silabus: hanya dilaporkan.
    const dalamSilabus = new Set(baris.map((b) => `${b.subtes}|${b.topik}`));
    const semua = await c.query(
      `SELECT upper(s.kode) AS subtes, t.nama AS topik,
              (SELECT count(*) FROM questions q WHERE q.topic_id = t.id) AS soal
         FROM topics t JOIN subjects s ON s.id = t.subject_id
        WHERE s.curriculum_group_id = $1 ORDER BY 1, 2`, [cg]);
    const asing = semua.rows.filter((r) => !dalamSilabus.has(`${r.subtes}|${r.topik}`));

    if (tulis) await c.query('COMMIT');
    else { await c.query('SET CONSTRAINTS ALL IMMEDIATE'); await c.query('ROLLBACK'); }

    console.log(tulis ? '\nTERSIMPAN' : '\nSIMULASI (tidak ada yang disimpan; tambahkan --tulis untuk menyimpan)');
    console.log(`  topik baru      : ${stat.topikBaru}  (sudah ada: ${stat.topikAda})`);
    console.log(`  subtopik baru   : ${stat.subBaru}  (sudah ada: ${stat.subAda})`);
    if (perSubtes.size) console.log(`  subtopik baru per subtes: ${[...perSubtes].map(([k, n]) => `${k} ${n}`).join(', ')}`);
    if (tunggal.length) {
      console.log('\nPERHATIAN: topik berikut hanya punya 1 subtopik, jadi TIDAK bisa punya soal Level 3-4 (aturan: minimal 2 subtopik dalam satu topik):');
      tunggal.forEach((t) => console.log(`  ${t.subtes} / ${t.topik}`));
    }
    if (asing.length) {
      console.log('\nAda di database tetapi TIDAK ada di silabus (tidak diubah; dibiarkan):');
      asing.forEach((r) => console.log(`  ${r.subtes} / ${r.topik}  (${r.soal} soal)`));
    }
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* sudah ditutup */ }
    keluar(1, `Dibatalkan, tidak ada yang disimpan. Penyebab:\n  ${e.message}`);
  } finally {
    c.release();
  }
}

main()
  .catch((e) => keluar(1, `Error tak terduga: ${e.message}`))
  .finally(() => pool.end());
