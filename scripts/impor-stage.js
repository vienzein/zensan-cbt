'use strict';

/**
 * Memasukkan daftar stage tes diagnostik Domain 0 dari berkas markdown ke database.
 *
 *   npm run impor:stage -- seed/stage-diagnostik-d0.md            # SIMULASI: tidak menyimpan
 *   npm run impor:stage -- seed/stage-diagnostik-d0.md --tulis    # menyimpan
 *   opsi: --tes=SNBT (bawaan)  --subtes=NUM (subtes tempat topik tersembunyi dibuat; bawaan NUM)
 *
 * Yang dibuat: baris d0_stages, serta topik dan subtopik TERSEMBUNYI (is_active = false) tempat soal stage
 * disimpan, supaya soal stage tidak muncul di drill/tryout/beranda. Aman dijalankan ulang: stage yang sudah ada
 * diperbarui bila isinya berubah (target, batas, indikator, level), tidak pernah dihapus.
 * Migrasi 009 harus sudah dijalankan.
 */

const fs = require('node:fs');
const pool = require('../src/db');
const { parseStageD0, namaTopikTersembunyi, namaSubtopikTersembunyi } = require('../src/services/stageD0');

const [, , berkas, ...flag] = process.argv;
const tulis = flag.includes('--tulis');
const opsi = (nama, bawaan) => ((flag.find((f) => f.startsWith(`--${nama}=`)) || `--${nama}=${bawaan}`).split('=')[1] || bawaan).toUpperCase();
const tes = opsi('tes', 'SNBT');
const subtes = opsi('subtes', 'NUM');

function keluar(kode, pesan) {
  if (pesan) console.error(pesan);
  process.exit(kode);
}

async function main() {
  if (!berkas) keluar(2, 'Pemakaian: npm run impor:stage -- <berkas.md> [--tulis] [--tes=SNBT] [--subtes=NUM]');
  if (!fs.existsSync(berkas)) keluar(2, `Berkas tidak ditemukan: ${berkas}`);

  const { stages, galat, peringatan } = parseStageD0(fs.readFileSync(berkas, 'utf8'));
  if (galat.length) {
    console.error(`Ada ${galat.length} masalah di berkas stage (belum ada yang disimpan):\n`);
    galat.forEach((g) => console.error(`  ${g.baris ? `baris ${g.baris}: ` : ''}${g.pesan}`));
    keluar(1);
  }
  if (peringatan.length) {
    console.log(`Peringatan (${peringatan.length}):`);
    peringatan.slice(0, 20).forEach((p) => console.log(`  ${p}`));
  }

  const c = await pool.connect();
  const stat = { baru: 0, diperbarui: 0, sama: 0, topikBaru: 0, subBaru: 0 };
  let tidakAdaDiBerkas = [];
  try {
    await c.query('BEGIN');
    const cg = (await c.query('SELECT id FROM curriculum_groups WHERE upper(kode) = $1', [tes])).rows[0]?.id;
    if (!cg) throw new Error(`tes "${tes}" belum ada di database`);
    const subjectId = (await c.query(
      'SELECT id FROM subjects WHERE curriculum_group_id = $1 AND upper(kode) = $2', [cg, subtes])).rows[0]?.id;
    if (!subjectId) throw new Error(`subtes "${subtes}" belum ada di tes ${tes}`);

    const topics = new Map();
    const subs = new Map();
    for (const s of stages) {
      const namaTopik = namaTopikTersembunyi(s);
      if (!topics.has(namaTopik)) {
        const ada = await c.query('SELECT id FROM topics WHERE subject_id = $1 AND nama = $2', [subjectId, namaTopik]);
        if (ada.rows.length) topics.set(namaTopik, ada.rows[0].id); else {
          const baru = await c.query(
            'INSERT INTO topics (subject_id, nama, requires_domain0, is_active) VALUES ($1, $2, FALSE, FALSE) RETURNING id',
            [subjectId, namaTopik]);
          topics.set(namaTopik, baru.rows[0].id);
          stat.topikBaru += 1;
        }
      }
      const topicId = topics.get(namaTopik);
      const namaSub = namaSubtopikTersembunyi(s);
      const kunciSub = `${topicId}|${namaSub}`;
      if (!subs.has(kunciSub)) {
        const ada = await c.query('SELECT id FROM subtopics WHERE topic_id = $1 AND nama = $2', [topicId, namaSub]);
        if (ada.rows.length) subs.set(kunciSub, ada.rows[0].id); else {
          const baru = await c.query(
            'INSERT INTO subtopics (topic_id, nama, is_active) VALUES ($1, $2, FALSE) RETURNING id', [topicId, namaSub]);
          subs.set(kunciSub, baru.rows[0].id);
          stat.subBaru += 1;
        }
      }
      const subtopicId = subs.get(kunciSub);

      const ada = await c.query(
        `SELECT id, kode_topik, nama_topik, indikator, level_soal, isi, jumlah_soal, target_detik_per_soal,
                batas_detik, urutan, is_gabungan, topic_id, subtopic_id
           FROM d0_stages WHERE curriculum_group_id = $1 AND kode = $2`, [cg, s.kode]);
      if (!ada.rows.length) {
        await c.query(
          `INSERT INTO d0_stages (curriculum_group_id, kode, kode_topik, nama_topik, indikator, level_soal, isi,
                                  jumlah_soal, target_detik_per_soal, batas_detik, urutan, is_gabungan,
                                  topic_id, subtopic_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [cg, s.kode, s.kodeTopik, s.namaTopik, s.indikator, s.level, s.isi, s.jumlahSoal, s.targetDetik,
            s.batasDetik, s.urutan, s.gabungan, topicId, subtopicId]);
        stat.baru += 1;
      } else {
        const r = ada.rows[0];
        const beda = r.kode_topik !== s.kodeTopik || r.nama_topik !== s.namaTopik || r.indikator !== s.indikator
          || r.level_soal !== s.level || r.isi !== s.isi || r.jumlah_soal !== s.jumlahSoal
          || r.target_detik_per_soal !== s.targetDetik || r.batas_detik !== s.batasDetik || r.urutan !== s.urutan
          || r.is_gabungan !== s.gabungan || String(r.topic_id) !== String(topicId) || String(r.subtopic_id) !== String(subtopicId);
        if (beda) {
          await c.query(
            `UPDATE d0_stages SET kode_topik=$2, nama_topik=$3, indikator=$4, level_soal=$5, isi=$6, jumlah_soal=$7,
                    target_detik_per_soal=$8, batas_detik=$9, urutan=$10, is_gabungan=$11, topic_id=$12, subtopic_id=$13
              WHERE id = $1`,
            [r.id, s.kodeTopik, s.namaTopik, s.indikator, s.level, s.isi, s.jumlahSoal, s.targetDetik,
              s.batasDetik, s.urutan, s.gabungan, topicId, subtopicId]);
          stat.diperbarui += 1;
        } else stat.sama += 1;
      }
    }

    const kodeBerkas = stages.map((s) => s.kode);
    tidakAdaDiBerkas = (await c.query(
      'SELECT kode FROM d0_stages WHERE curriculum_group_id = $1 AND NOT (kode = ANY($2::text[])) ORDER BY urutan', [cg, kodeBerkas]))
      .rows.map((r) => r.kode);

    if (tulis) await c.query('COMMIT'); else await c.query('ROLLBACK');
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* sudah ditutup */ }
    keluar(1, `Dibatalkan, tidak ada yang disimpan. Penyebab:\n  ${e.message}`);
  } finally {
    c.release();
  }

  console.log(tulis ? '\nTERSIMPAN' : '\nSIMULASI (tidak ada yang disimpan; tambahkan --tulis untuk menyimpan)');
  console.log(`  stage di berkas       : ${stages.length} (${stages.reduce((a, s) => a + s.jumlahSoal, 0)} soal per putaran semua stage)`);
  console.log(`  stage baru            : ${stat.baru}`);
  console.log(`  stage diperbarui      : ${stat.diperbarui}`);
  console.log(`  stage tidak berubah   : ${stat.sama}`);
  console.log(`  topik tersembunyi baru: ${stat.topikBaru}`);
  console.log(`  subtopik tersembunyi baru: ${stat.subBaru}`);
  if (tidakAdaDiBerkas.length) {
    console.log(`\nAda di database tetapi TIDAK ada di berkas (tidak diubah): ${tidakAdaDiBerkas.join(', ')}`);
  }
}

main()
  .catch((e) => keluar(1, `Error tak terduga: ${e.message}`))
  .finally(() => pool.end());
