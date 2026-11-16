'use strict';

/**
 * Laporan jumlah soal aktif per stage diagnostik Domain 0 (hanya membaca, tidak mengubah apa pun).
 *
 *   npm run laporan:stage                 # semua stage tes SNBT
 *   npm run laporan:stage -- --tes=SNBT --topik=D0-01     # satu topik saja
 *
 * Status tiap stage: KOSONG (0 soal), KURANG (kurang dari jumlah soal yang ditampilkan, stage belum bisa
 * dilayani), TIPIS (cukup, tetapi kurang dari 3 kali jumlah tampil, jadi acakannya mudah berulang), OK.
 */

const pool = require('../src/db');

const flag = process.argv.slice(2);
const opsi = (nama, bawaan) => ((flag.find((f) => f.startsWith(`--${nama}=`)) || `--${nama}=${bawaan}`).split('=')[1] || bawaan);
const tes = opsi('tes', 'SNBT').toUpperCase();
const topik = opsi('topik', '').toUpperCase();

const status = (n, tampil) => (n === 0 ? 'KOSONG' : n < tampil ? 'KURANG' : n < 3 * tampil ? 'TIPIS' : 'OK');

async function main() {
  const cg = (await pool.query('SELECT id FROM curriculum_groups WHERE upper(kode) = $1', [tes])).rows[0]?.id;
  if (!cg) { console.error(`tes "${tes}" belum ada di database`); process.exitCode = 1; return; }
  const { rows } = await pool.query(
    `SELECT s.kode, s.kode_topik, s.nama_topik, s.level_soal, s.jumlah_soal, s.urutan,
            count(q.id) FILTER (WHERE q.is_active) AS soal
       FROM d0_stages s
  LEFT JOIN d0_stage_questions sq ON sq.stage_id = s.id
  LEFT JOIN questions q ON q.id = sq.question_id
      WHERE s.curriculum_group_id = $1 AND s.is_active
   GROUP BY s.id ORDER BY s.urutan`, [cg]);
  const dipilih = topik ? rows.filter((r) => r.kode_topik === topik) : rows;
  if (!dipilih.length) { console.log('Tidak ada stage. Jalankan dulu: npm run impor:stage -- seed/stage-diagnostik-d0.md --tulis'); return; }

  const ringkas = { KOSONG: 0, KURANG: 0, TIPIS: 0, OK: 0 };
  let topikSaatIni = null;
  for (const r of dipilih) {
    if (r.kode_topik !== topikSaatIni) {
      topikSaatIni = r.kode_topik;
      console.log(`\n${r.kode_topik} ${r.nama_topik}`);
    }
    const n = Number(r.soal);
    const st = status(n, r.jumlah_soal);
    ringkas[st] += 1;
    console.log(`  ${r.kode.padEnd(13)} L${r.level_soal}  ${String(n).padStart(3)} soal (tampil ${r.jumlah_soal})  ${st}`);
  }
  console.log(`\nRingkasan ${dipilih.length} stage: OK ${ringkas.OK}, TIPIS ${ringkas.TIPIS}, KURANG ${ringkas.KURANG}, KOSONG ${ringkas.KOSONG}`);
  console.log(`Total soal aktif di stage terpilih: ${dipilih.reduce((a, r) => a + Number(r.soal), 0)}`);
}

main().catch((e) => { console.error(`Error: ${e.message}`); process.exitCode = 1; }).finally(() => pool.end());
