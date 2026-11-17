'use strict';

/**
 * Impor bank soal dari CSV ke database.
 *
 *   npm run impor:soal -- seed/soal-saya.csv            # SIMULASI: memeriksa semuanya, tidak menyimpan
 *   npm run impor:soal -- seed/soal-saya.csv --tulis    # menyimpan
 *   --lewati-bertanda : soal yang masih memuat [GAMBAR DIPERLUKAN...] / [RUMUS PERLU...] / [TIDAK TERBACA...] dilewati (dilaporkan), sisanya diimpor.
 *                       Tanpa opsi ini, soal bertanda dianggap galat dan tidak ada yang disimpan.
 *   npm run impor:soal -- seed/soal-saya.docx           # sama, dari dokumen Word (lihat PETUNJUK-IMPOR-WORD.md)
 *   npm run impor:soal -- seed/soal-d0.json             # soal stage dalam JSON (kodeStage, soal, opsi, kunci, pembahasan)
 *
 * Soal diagnostik Domain 0: beri kolom/label "Stage" (mis. D0-01-01.S1); stage harus sudah diimpor
 * (npm run impor:stage). Subtes, topik, subtopik, level, dan waktu soal diambil dari stage-nya.
 *
 * Aturan: tes dan subtes harus sudah ada; topik dan subtopik yang belum ada dibuat otomatis; soal yang
 * sama (topik + teks soal) dilewati, jadi aman dijalankan ulang. Semua atau tidak sama sekali (satu transaksi).
 * Format kolom: lihat seed/PETUNJUK-IMPOR-SOAL.md dan seed/templat-soal.csv.
 * Format Word: lihat seed/PETUNJUK-IMPOR-WORD.md dan seed/templat-soal.docx.
 */

const fs = require('node:fs');
const pool = require('../src/db');
const { parseCsv, jsonKeBaris, validasi, topikButuhDomain0, adaPenanda } = require('../src/services/imporSoal');
const { docxKeBaris } = require('../src/services/imporWord');
const { dariEnv } = require('../src/services/penyimpananGambar');

const [, , berkas, ...flag] = process.argv;
const tulis = flag.includes('--tulis');

function keluar(kode, pesan) {
  if (pesan) console.error(pesan);
  process.exit(kode);
}

async function main() {
  if (!berkas) keluar(2, 'Pemakaian: npm run impor:soal -- <berkas.csv | berkas.docx | berkas.json> [--tulis] [--tes=SNBT]');
  if (!fs.existsSync(berkas)) keluar(2, `Berkas tidak ditemukan: ${berkas}`);

  const dariWord = /\.docx$/i.test(berkas);
  let terbaca;
  let galatBaca = [];
  let media = new Map();
  const cuplikan = new Map();
  if (dariWord) {
    let w;
    try { w = docxKeBaris(fs.readFileSync(berkas)); } catch (e) { keluar(1, e.message); }
    w.peringatan.forEach((p) => console.warn(`  perhatian: ${p}`));
    w.baris.forEach((r) => cuplikan.set(r._nomor, r._cuplikan));
    galatBaca = w.galat;
    media = w.media;
    terbaca = { kolom: w.kolom, baris: w.baris };
  } else if (/\.json$/i.test(berkas)) {
    const tesFlag = (flag.find((f) => f.startsWith('--tes=')) || '--tes=SNBT').slice(6).trim().toUpperCase();
    try { terbaca = jsonKeBaris(fs.readFileSync(berkas, 'utf8'), tesFlag); } catch (e) { keluar(1, e.message); }
  } else {
    terbaca = parseCsv(fs.readFileSync(berkas, 'utf8'));
  }
  // Penunjuk lokasi masalah: nomor baris di spreadsheet, atau nomor soal (+ awal kalimatnya) di Word.
  const lokasi = (n) => (dariWord ? `soal ke-${n}${cuplikan.get(n) ? ` ("${cuplikan.get(n)}")` : ''}` : `baris ${n}`);

  // --lewati-bertanda: soal yang masih bertanda [GAMBAR DIPERLUKAN...] dkk. tidak ikut diimpor (dilaporkan), sisanya jalan terus.
  if (flag.includes('--lewati-bertanda')) {
    const bertanda = terbaca.baris.filter((r) => adaPenanda(r));
    terbaca = { ...terbaca, baris: terbaca.baris.filter((r) => !adaPenanda(r)) };
    if (bertanda.length) {
      console.log(`Dilewati karena masih bertanda sementara: ${bertanda.length} soal`);
      bertanda.forEach((r) => console.log(`  ${lokasi(r._nomor)}`));
      console.log('');
    }
  }

  const hasil = validasi(terbaca);
  const { soal } = hasil;
  const galat = [...galatBaca, ...hasil.galat];
  if (galat.length) {
    console.error(`Ada ${galat.length} masalah di berkas. Perbaiki lalu jalankan lagi (belum ada yang disimpan):\n`);
    galat.slice(0, 50).forEach((g) => console.error(`  ${lokasi(g.baris)}: ${g.pesan}`));
    if (galat.length > 50) console.error(`  ... dan ${galat.length - 50} lainnya`);
    keluar(1);
  }
  if (!soal.length) keluar(1, 'Tidak ada soal di berkas.');

  // Gambar tertanam di Word diunggah ke Supabase Storage saat --tulis. Periksa pengaturannya SEBELUM menyentuh database.
  const perluGambar = soal.some((s) => s.gambarBerkas || s.pembahasanGambarBerkas);
  let simpanGambar = null;
  if (perluGambar) {
    const { penyimpanan, kurang } = dariEnv();
    let masalahGambar = null;
    if (!penyimpanan) {
      masalahGambar = `Dokumen berisi gambar, tetapi pengaturan penyimpanan di .env belum lengkap: ${kurang.join(', ')}. Lihat seed/PETUNJUK-IMPOR-WORD.md bagian "Gambar".`;
    } else {
      try {
        const cek = await penyimpanan.periksa();
        if (cek.ok) simpanGambar = penyimpanan; else masalahGambar = cek.pesan;
      } catch (e) { masalahGambar = e.message; }
    }
    if (masalahGambar) {
      if (tulis) keluar(1, `${masalahGambar}\n\nBelum ada yang disimpan.`);
      console.warn(`  perhatian: ${masalahGambar}\n             (Simulasi tetap jalan, tetapi --tulis akan berhenti sebelum menyimpan apa pun.)`);
    }
  }
  const cacheGambar = new Map(); // nama berkas di dokumen -> alamat publik
  const gambarSiap = new Set();
  const alamatGambar = async (nama) => {
    gambarSiap.add(nama);
    if (!tulis) return null;
    if (!cacheGambar.has(nama)) {
      cacheGambar.set(nama, await simpanGambar.unggah(media.get(nama), nama.split('.').pop()));
    }
    return cacheGambar.get(nama);
  };

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

      let topicId;
      let subIds = [];
      let level = s.level;
      let waktu = s.waktu;
      let stageRow = null;
      if (s.stage) {
        // Soal diagnostik Domain 0: topik, subtopik, level, dan waktu ditentukan oleh stage-nya.
        stageRow = await sekali(`st:${cg}:${s.stage}`, async () =>
          (await c.query(
            'SELECT id, topic_id, subtopic_id, level_soal, target_detik_per_soal FROM d0_stages WHERE curriculum_group_id = $1 AND upper(kode) = $2',
            [cg, s.stage])).rows[0] ?? null);
        if (!stageRow || !stageRow.topic_id || !stageRow.subtopic_id) {
          masalah.push({ baris: s.baris, pesan: `stage "${s.stage}" belum ada di database. Jalankan dulu: npm run impor:stage -- seed/stage-diagnostik-d0.md --tulis` });
          continue;
        }
        if (s.level !== null && s.level !== stageRow.level_soal) {
          masalah.push({ baris: s.baris, pesan: `level ${s.level} tidak sama dengan level stage ${s.stage} (Level ${stageRow.level_soal}); kosongkan Level atau samakan` });
          continue;
        }
        topicId = { id: stageRow.topic_id, butuhD0: false };
        subIds = [stageRow.subtopic_id];
        level = stageRow.level_soal;
        if (waktu === null) waktu = stageRow.target_detik_per_soal;
      } else {
        const subjectId = await sekali(`sj:${cg}:${s.subtes}`, async () =>
          (await c.query('SELECT id FROM subjects WHERE curriculum_group_id = $1 AND upper(kode) = $2', [cg, s.subtes]))
            .rows[0]?.id ?? null);
        if (!subjectId) { masalah.push({ baris: s.baris, pesan: `subtes "${s.subtes}" belum ada di tes ${s.tes}` }); continue; }

        const butuhD0 = topikButuhDomain0(s);
        topicId = await sekali(`tp:${subjectId}:${s.topik}`, async () => {
          const ada = await c.query('SELECT id, requires_domain0 FROM topics WHERE subject_id = $1 AND nama = $2', [subjectId, s.topik]);
          if (ada.rows.length) return { id: ada.rows[0].id, butuhD0: ada.rows[0].requires_domain0 };
          const baru = await c.query(
            'INSERT INTO topics (subject_id, nama, requires_domain0) VALUES ($1, $2, $3) RETURNING id', [subjectId, s.topik, butuhD0]);
          stat.topikBaru += 1;
          return { id: baru.rows[0].id, butuhD0 };
        });

        subIds = [];
        for (const nama of s.subtopik) {
          subIds.push(await sekali(`sb:${topicId.id}:${nama}`, async () => {
            const ada = await c.query('SELECT id FROM subtopics WHERE topic_id = $1 AND nama = $2', [topicId.id, nama]);
            if (ada.rows.length) return ada.rows[0].id;
            const baru = await c.query('INSERT INTO subtopics (topic_id, nama) VALUES ($1, $2) RETURNING id', [topicId.id, nama]);
            stat.subBaru += 1;
            return baru.rows[0].id;
          }));
        }
      }

      const kunciSoal = `${topicId.id}|${s.teks}`;
      if (dalamBerkas.has(kunciSoal)) { stat.kembar += 1; continue; }
      dalamBerkas.add(kunciSoal);
      const sudah = await c.query('SELECT id FROM questions WHERE topic_id = $1 AND soal_teks = $2 LIMIT 1', [topicId.id, s.teks]);
      if (sudah.rows.length) {
        stat.ada += 1;
        if (stageRow) { // pastikan soal lama tetap tertaut ke stage
          await c.query('INSERT INTO d0_stage_questions (stage_id, question_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [stageRow.id, sudah.rows[0].id]);
        }
        continue;
      }

      const gambarUrl = s.gambarBerkas ? await alamatGambar(s.gambarBerkas) : s.gambarUrl;
      const pembahasanGambarUrl = s.pembahasanGambarBerkas ? await alamatGambar(s.pembahasanGambarBerkas) : s.pembahasanGambarUrl;
      const q = await c.query(
        `INSERT INTO questions (topic_id, level_soal, soal_teks, soal_gambar_url, opsi_jawaban, kunci_jawaban,
                                target_waktu_detik, poin_reward, poin_penalty, is_domain0,
                                pembahasan, pembahasan_gambar_url)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [topicId.id, level, s.teks, gambarUrl, JSON.stringify(s.opsi), JSON.stringify(s.kunci),
          waktu, s.poin, Math.max(1, Math.round(s.poin * 0.2)), stageRow ? true : s.domain0,
          s.pembahasan, pembahasanGambarUrl],
      );
      for (const sid of subIds) {
        await c.query('INSERT INTO question_subtopics (question_id, subtopic_id) VALUES ($1, $2)', [q.rows[0].id, sid]);
      }
      if (stageRow) {
        await c.query('INSERT INTO d0_stage_questions (stage_id, question_id) VALUES ($1, $2)', [stageRow.id, q.rows[0].id]);
      }
      stat.baru += 1;
      if (!stageRow && s.domain0 && !topicId.butuhD0) stat.domain0TakTerpakai += 1;
      const k = stageRow ? `${s.tes} / Stage ${s.stage}` : `${s.tes} / ${s.subtes} / Level ${level}`;
      perKelompok.set(k, (perKelompok.get(k) || 0) + 1);
    }

    if (masalah.length) {
      await c.query('ROLLBACK');
      console.error(`Ada ${masalah.length} masalah (belum ada yang disimpan):\n`);
      masalah.slice(0, 50).forEach((g) => console.error(`  ${lokasi(g.baris)}: ${g.pesan}`));
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
    keluar(1, `Dibatalkan, tidak ada yang disimpan. Penyebab:\n  ${e.message}`);
  } finally {
    c.release();
  }

  console.log(tulis ? '\nTERSIMPAN' : '\nSIMULASI (tidak ada yang disimpan; tambahkan --tulis untuk menyimpan)');
  console.log(`  soal baru            : ${stat.baru}`);
  console.log(`  sudah ada (dilewati) : ${stat.ada}`);
  if (stat.kembar) console.log(`  kembar di berkas     : ${stat.kembar}`);
  console.log(`  topik baru           : ${stat.topikBaru}`);
  console.log(`  subtopik baru        : ${stat.subBaru}`);
  if (gambarSiap.size) {
    console.log(tulis
      ? `  gambar diunggah      : ${gambarSiap.size}`
      : `  gambar (diunggah saat --tulis): ${gambarSiap.size}`);
  }
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
