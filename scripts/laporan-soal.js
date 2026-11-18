'use strict';

/**
 * Laporan soal dari siswa, dikelompokkan per soal (hanya membaca, tidak mengubah apa pun).
 *
 *   npm run laporan:soal                    # soal yang punya laporan berstatus "baru", terbanyak dulu
 *   npm run laporan:soal -- --semua         # termasuk laporan yang sudah ditinjau/selesai/ditolak
 *   npm run laporan:soal -- --soal=1234     # rincian satu soal (teks, opsi, kunci, semua laporan + catatan)
 *
 * Menandai selesai (jalankan di SQL Editor Supabase, setelah soalnya diperbaiki atau disembunyikan):
 *   UPDATE question_reports SET status = 'selesai', updated_at = now() WHERE question_id = 1234 AND status = 'baru';
 * Menyembunyikan soal yang bermasalah dari siswa: UPDATE questions SET is_active = false WHERE id = 1234;
 */

const pool = require('../src/db');
const { ALASAN } = require('../src/config/laporanSoal');

const flag = process.argv.slice(2);
const semua = flag.includes('--semua');
const soalId = (flag.find((f) => f.startsWith('--soal=')) || '').split('=')[1] || '';
const label = new Map(ALASAN.map((a) => [a.kode, a.label]));
const potong = (t, n) => String(t || '').replace(/\s+/g, ' ').slice(0, n);

async function rincian(id) {
  const q = (await pool.query(
    `SELECT q.id, q.is_active, q.level_soal, q.soal_teks, q.opsi_jawaban, q.kunci_jawaban, q.pembahasan,
            q.soal_gambar_url, t.nama AS topik, s.kode AS subtes
       FROM questions q JOIN topics t ON t.id = q.topic_id JOIN subjects s ON s.id = t.subject_id
      WHERE q.id = $1`, [id])).rows[0];
  if (!q) { console.error(`soal ${id} tidak ditemukan`); process.exitCode = 1; return; }
  console.log(`Soal ${q.id} | ${q.subtes} / ${q.topik} | Level ${q.level_soal} | ${q.is_active ? 'aktif' : 'NONAKTIF'}`);
  console.log(`\n${q.soal_teks}\n`);
  if (q.soal_gambar_url) console.log(`Gambar: ${q.soal_gambar_url}\n`);
  (Array.isArray(q.opsi_jawaban) ? q.opsi_jawaban : []).forEach((o) => console.log(`  ${o.kode}. ${o.teks}`));
  console.log(`\nKunci tersimpan: ${JSON.stringify(q.kunci_jawaban)}`);
  if (q.pembahasan) console.log(`Pembahasan: ${potong(q.pembahasan, 300)}`);
  const { rows } = await pool.query(
    `SELECT alasan, catatan, status, created_at FROM question_reports WHERE question_id = $1 ORDER BY created_at`, [id]);
  console.log(`\nLaporan (${rows.length}):`);
  rows.forEach((r) => console.log(`  [${r.status}] ${label.get(r.alasan) || r.alasan}${r.catatan ? ` - "${potong(r.catatan, 200)}"` : ''} (${r.created_at.toISOString().slice(0, 10)})`));
}

async function ringkas() {
  const { rows } = await pool.query(
    `SELECT r.question_id, count(*)::int AS jml, count(DISTINCT r.student_id)::int AS siswa,
            string_agg(DISTINCT r.alasan, ',') AS alasan, max(r.created_at) AS terakhir,
            q.is_active, q.level_soal, left(q.soal_teks, 80) AS cuplikan, t.nama AS topik, s.kode AS subtes
       FROM question_reports r
       JOIN questions q ON q.id = r.question_id
       JOIN topics t ON t.id = q.topic_id
       JOIN subjects s ON s.id = t.subject_id
      WHERE ($1::boolean OR r.status = 'baru')
      GROUP BY r.question_id, q.is_active, q.level_soal, q.soal_teks, t.nama, s.kode
      ORDER BY count(DISTINCT r.student_id) DESC, max(r.created_at) DESC
      LIMIT 100`, [semua]);
  if (!rows.length) { console.log(semua ? 'Belum ada laporan.' : 'Tidak ada laporan baru.'); return; }
  console.log(`${rows.length} soal dilaporkan${semua ? '' : ' (status baru)'}:\n`);
  rows.forEach((r) => {
    console.log(`#${r.question_id} ${r.subtes}/${r.topik} L${r.level_soal}${r.is_active ? '' : ' [NONAKTIF]'}  ${r.siswa} siswa, ${r.jml} laporan`);
    console.log(`   ${r.alasan.split(',').map((a) => label.get(a) || a).join('; ')}`);
    console.log(`   "${potong(r.cuplikan, 80)}"`);
  });
  console.log('\nRincian satu soal: npm run laporan:soal -- --soal=<id>');
}

(soalId ? rincian(soalId) : ringkas())
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => pool.end());
