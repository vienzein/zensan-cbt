'use strict';

/**
 * Menyimpan soal hasil validasi ke database (dipakai skrip impor:soal DAN halaman admin).
 * Semua atau tidak sama sekali (satu transaksi). tulis=false = simulasi: semua diperiksa, lalu dibatalkan.
 */

const { hashGambar, dariEnv } = require('./penyimpananGambar');
const { topikButuhDomain0 } = require('./imporSoal');

/**
 * Menyiapkan penyimpanan gambar bila soal memuat gambar tertanam. Mengembalikan { simpanGambar, masalahGambar }:
 * masalahGambar terisi bila pengaturan Supabase belum lengkap (simulasi boleh lanjut; penulisan harus berhenti).
 */
async function siapkanGambar(soal, env = process.env) {
  const perlu = soal.some((s) => s.gambarBerkas || s.pembahasanGambarBerkas);
  if (!perlu) return { simpanGambar: null, masalahGambar: null };
  const { penyimpanan, kurang } = dariEnv(env);
  if (!penyimpanan) {
    return { simpanGambar: null, masalahGambar: `Dokumen berisi gambar, tetapi pengaturan penyimpanan (.env) belum lengkap: ${kurang.join(', ')}.` };
  }
  try {
    const cek = await penyimpanan.periksa();
    return cek.ok ? { simpanGambar: penyimpanan, masalahGambar: null } : { simpanGambar: null, masalahGambar: cek.pesan };
  } catch (e) {
    return { simpanGambar: null, masalahGambar: e.message };
  }
}

/**
 * @returns {Promise<{masalah:{baris,pesan}[], stat:object, perKelompok:[string,number][], gambar:number}>}
 * Melempar Error bila database menolak (transaksi sudah dibatalkan).
 */
async function simpanSoal(pool, { soal, media = new Map(), tulis, simpanGambar, lembagaId = null }) {
  // Soal dari admin lembaga: berstatus 'menunggu' dan TIDAK aktif sampai super admin menyetujuinya.
  const menunggu = lembagaId !== null;
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
  const perKelompok = new Map();
  const idBaru = [];
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

      // Soal dianggap sama bila topik, teks, DAN gambarnya sama. Teks kembar dengan gambar berbeda (mis. "Banyak persegi
      // pada bangun di atas") adalah soal berbeda. Tanpa gambar, perbandingannya tetap topik + teks.
      const idGambar = s.gambarBerkas ? hashGambar(media.get(s.gambarBerkas)) : (s.gambarUrl || '');
      const kunciSoal = `${topicId.id}|${s.teks}|${idGambar}`;
      if (dalamBerkas.has(kunciSoal)) { stat.kembar += 1; continue; }
      dalamBerkas.add(kunciSoal);
      const sudah = idGambar
        ? await c.query(
          `SELECT id FROM questions WHERE topic_id = $1 AND soal_teks = $2 AND COALESCE(soal_gambar_url, '') LIKE $3 LIMIT 1`,
          [topicId.id, s.teks, `%${idGambar.replace(/[%_\\]/g, '\\$&')}%`])
        : await c.query('SELECT id FROM questions WHERE topic_id = $1 AND soal_teks = $2 LIMIT 1', [topicId.id, s.teks]);
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
                                pembahasan, pembahasan_gambar_url, institution_id, approval_status, is_active)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`,
        [topicId.id, level, s.teks, gambarUrl, JSON.stringify(s.opsi), JSON.stringify(s.kunci),
          waktu, s.poin, Math.max(1, Math.round(s.poin * 0.2)), stageRow ? true : s.domain0,
          s.pembahasan, pembahasanGambarUrl, lembagaId, menunggu ? 'menunggu' : 'disetujui', !menunggu],
      );
      for (const sid of subIds) {
        await c.query('INSERT INTO question_subtopics (question_id, subtopic_id) VALUES ($1, $2)', [q.rows[0].id, sid]);
      }
      if (stageRow) {
        await c.query('INSERT INTO d0_stage_questions (stage_id, question_id) VALUES ($1, $2)', [stageRow.id, q.rows[0].id]);
      }
      stat.baru += 1;
      idBaru.push(String(q.rows[0].id));
      if (!stageRow && s.domain0 && !topicId.butuhD0) stat.domain0TakTerpakai += 1;
      const k = stageRow ? `${s.tes} / Stage ${s.stage}` : `${s.tes} / ${s.subtes} / Level ${level}`;
      perKelompok.set(k, (perKelompok.get(k) || 0) + 1);
    }

    if (masalah.length) {
      await c.query('ROLLBACK');
      return { masalah, stat, perKelompok: [...perKelompok], gambar: gambarSiap.size, idBaru };
    }

    if (tulis) {
      await c.query('COMMIT'); // aturan ikatan subtopik di database diperiksa di sini
    } else {
      await c.query('SET CONSTRAINTS ALL IMMEDIATE'); // periksa aturan database seolah-olah sungguhan
      await c.query('ROLLBACK');
    }
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* sudah ditutup */ }
    throw e;
  } finally {
    c.release();
  }
  return { masalah, stat, perKelompok: [...perKelompok], gambar: gambarSiap.size, idBaru };
}

module.exports = { simpanSoal, siapkanGambar };
