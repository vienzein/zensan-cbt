'use strict';

/**
 * Input dan edit soal dari halaman admin: unggah docx (simulasi lalu simpan), input langsung lewat form,
 * unggah gambar, dan edit satu soal (mis. dari laporan siswa).
 */

const { HttpError } = require('../errors');
const { validasi, adaPenanda } = require('./imporSoal');
const { docxKeBaris } = require('./imporWord');
const { simpanSoal, siapkanGambar } = require('./imporSoalService');
const { dariEnv } = require('./penyimpananGambar');
const { waktuSoal } = require('../config/waktu');
const { PERAN } = require('../config/peran');

/** Admin lembaga: soal baru berstatus 'menunggu' (tidak aktif). Super admin: langsung aktif. */
const lembagaIdDari = (admin) => (admin && admin.role === PERAN.ADMIN_LEMBAGA ? admin.institutionId : null);

const TES_BAWAAN = 'SNBT';
const HURUF = ['A', 'B', 'C', 'D', 'E'];

/** Pohon pilihan untuk form: subtes -> topik -> subtopik (hanya yang aktif; topik stage D0 tersembunyi). */
async function pilihan(pool) {
  const { rows } = await pool.query(
    `SELECT s.kode AS subtes, s.nama AS subtes_nama, t.id AS topik_id, t.nama AS topik,
            st.id AS subtopik_id, st.nama AS subtopik
       FROM curriculum_groups cg
       JOIN subjects s   ON s.curriculum_group_id = cg.id AND s.is_active
       JOIN topics t     ON t.subject_id = s.id AND t.is_active
       JOIN subtopics st ON st.topic_id = t.id AND st.is_active
      WHERE upper(cg.kode) = $1
      ORDER BY s.urutan, s.id, t.id, st.id`,
    [TES_BAWAAN],
  );
  const peta = new Map();
  for (const r of rows) {
    if (!peta.has(r.subtes)) peta.set(r.subtes, { kode: r.subtes, nama: r.subtes_nama, topik: new Map() });
    const sj = peta.get(r.subtes);
    if (!sj.topik.has(r.topik_id)) sj.topik.set(r.topik_id, { id: String(r.topik_id), nama: r.topik, subtopik: [] });
    sj.topik.get(r.topik_id).subtopik.push({ id: String(r.subtopik_id), nama: r.subtopik });
  }
  return [...peta.values()].map((s) => ({ ...s, topik: [...s.topik.values()] }));
}

// ---------- Unggah docx ----------

/**
 * @param {Buffer} isi  isi berkas .docx
 * @returns {Promise<object>} { ok:false, galat:[{lokasi,pesan}] } atau { ok:true, tulis, stat, perKelompok, gambar, dilewati, peringatan }
 */
async function imporDocx(pool, isi, { tulis, lewatiBertanda, admin }, env = process.env) {
  let w;
  try {
    w = docxKeBaris(isi);
  } catch (e) {
    return { ok: false, galat: [{ lokasi: 'berkas', pesan: e.message }] };
  }
  const cuplikan = new Map(w.baris.map((r) => [r._nomor, r._cuplikan]));
  const lokasi = (n) => `soal ke-${n}${cuplikan.get(n) ? ` ("${cuplikan.get(n)}")` : ''}`;

  let baris = w.baris;
  const dilewati = [];
  if (lewatiBertanda) {
    for (const r of baris) if (adaPenanda(r)) dilewati.push(lokasi(r._nomor));
    baris = baris.filter((r) => !adaPenanda(r));
  }

  const hasil = validasi({ kolom: w.kolom, baris });
  const galat = [...w.galat, ...hasil.galat].map((g) => ({ lokasi: lokasi(g.baris), pesan: g.pesan }));
  if (galat.length) return { ok: false, galat: galat.slice(0, 100), jumlahGalat: galat.length };
  if (!hasil.soal.length) return { ok: false, galat: [{ lokasi: 'berkas', pesan: 'Tidak ada soal di berkas.' }] };

  const peringatan = [...w.peringatan];
  const { simpanGambar, masalahGambar } = await siapkanGambar(hasil.soal, env);
  if (masalahGambar) {
    if (tulis) return { ok: false, galat: [{ lokasi: 'gambar', pesan: `${masalahGambar} Belum ada yang disimpan.` }] };
    peringatan.push(`${masalahGambar} (simulasi tetap jalan, tetapi penyimpanan akan berhenti)`);
  }

  let r;
  try {
    r = await simpanSoal(pool, { soal: hasil.soal, media: w.media, tulis, simpanGambar, lembagaId: lembagaIdDari(admin) });
  } catch (e) {
    return { ok: false, galat: [{ lokasi: 'database', pesan: `Dibatalkan, tidak ada yang disimpan: ${e.message}` }] };
  }
  if (r.masalah.length) {
    return { ok: false, galat: r.masalah.slice(0, 100).map((g) => ({ lokasi: lokasi(g.baris), pesan: g.pesan })) };
  }
  return { ok: true, tulis, stat: r.stat, perKelompok: r.perKelompok, gambar: r.gambar, dilewati, peringatan };
}

// ---------- Input langsung ----------

const teks = (v) => (v === undefined || v === null ? '' : String(v).trim());

/** Memeriksa bentuk body form (tanpa menyentuh database). Mengembalikan nilai bersih atau melempar 422. */
function parseFormSoal(body, { untukEdit = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'BAD_REQUEST', 'Body harus berupa JSON object');
  }
  const galat = [];
  const level = Number(body.level);
  if (!Number.isInteger(level) || level < 1 || level > 4) galat.push('level harus 1-4');
  if (!teks(body.teks)) galat.push('teks soal kosong');
  const opsiIn = body.opsi && typeof body.opsi === 'object' ? body.opsi : {};
  const opsi = {};
  HURUF.forEach((h) => { opsi[h] = teks(opsiIn[h]); });
  const kunci = teks(body.kunci).toUpperCase();
  const subtopikIds = Array.isArray(body.subtopik_ids) ? [...new Set(body.subtopik_ids.map(String))] : [];
  if (!subtopikIds.length) galat.push('pilih minimal satu subtopik');
  if (subtopikIds.some((x) => !/^[1-9]\d{0,17}$/.test(x))) galat.push('id subtopik tidak valid');
  let waktu = null;
  if (body.waktu_detik !== undefined && body.waktu_detik !== null && body.waktu_detik !== '') {
    waktu = Number(body.waktu_detik);
    if (!Number.isInteger(waktu) || waktu < 5 || waktu > 3600) galat.push('waktu_detik harus bilangan bulat 5-3600');
  }
  const url = (v) => {
    const t = teks(v);
    if (t && !/^https?:\/\//i.test(t)) galat.push('alamat gambar harus diawali http:// atau https://');
    return t || null;
  };
  const nilai = {
    level, teks: teks(body.teks), opsi, kunci, subtopikIds, waktu,
    pembahasan: teks(body.pembahasan) || null,
    gambarUrl: url(body.gambar_url),
    pembahasanGambarUrl: url(body.pembahasan_gambar_url),
    subtes: teks(body.subtes).toUpperCase(),
    topikId: teks(body.topik_id),
  };
  if (!untukEdit) {
    if (!nilai.subtes) galat.push('subtes wajib dipilih');
    if (!/^[1-9]\d{0,17}$/.test(nilai.topikId)) galat.push('topik wajib dipilih');
  }
  if (galat.length) throw new HttpError(422, 'VALIDATION_ERROR', 'Soal tidak valid', galat);
  return nilai;
}

/** Baris seperti hasil CSV, supaya melewati pemeriksaan yang sama dengan impor (opsi berurutan, kunci cocok, penanda sementara, dll). */
function barisDariForm(n, { subtes, topik, subtopik }) {
  return {
    _nomor: 1,
    tes: TES_BAWAAN,
    subtes,
    topik,
    subtopik: subtopik.join('|'),
    level: String(n.level),
    soal: n.teks,
    opsi_a: n.opsi.A, opsi_b: n.opsi.B, opsi_c: n.opsi.C, opsi_d: n.opsi.D, opsi_e: n.opsi.E,
    kunci: n.kunci,
    pembahasan: n.pembahasan || '',
    gambar_url: n.gambarUrl || '',
    pembahasan_gambar_url: n.pembahasanGambarUrl || '',
    waktu_detik: n.waktu ? String(n.waktu) : '',
  };
}

const KOLOM_FORM = ['tes', 'subtes', 'topik', 'subtopik', 'level', 'soal', 'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'opsi_e',
  'kunci', 'pembahasan', 'gambar_url', 'pembahasan_gambar_url', 'waktu_detik'];

async function namaTopikDanSubtopik(pool, topikId, subtopikIds) {
  const t = (await pool.query(
    `SELECT t.id, t.nama, s.kode AS subtes FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE t.id = $1`, [topikId])).rows[0];
  if (!t) throw new HttpError(422, 'VALIDATION_ERROR', 'Topik tidak ditemukan', ['topik tidak ditemukan']);
  const subs = (await pool.query(
    'SELECT id, nama FROM subtopics WHERE topic_id = $1 AND id = ANY($2::bigint[])', [topikId, subtopikIds])).rows;
  if (subs.length !== subtopikIds.length) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Subtopik tidak cocok dengan topik', ['subtopik harus berasal dari topik yang dipilih']);
  }
  return { subtes: t.subtes, topik: t.nama, subtopik: subs.map((x) => x.nama) };
}

/** POST /api/admin/soal — soal baru dari form. */
async function buatSoal(pool, body, admin) {
  const n = parseFormSoal(body);
  const nama = await namaTopikDanSubtopik(pool, n.topikId, n.subtopikIds);
  if (nama.subtes !== n.subtes) throw new HttpError(422, 'VALIDATION_ERROR', 'Topik bukan milik subtes itu', ['topik bukan milik subtes yang dipilih']);
  const hasil = validasi({ kolom: KOLOM_FORM, baris: [barisDariForm(n, nama)] });
  if (hasil.galat.length) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Soal tidak valid', hasil.galat.map((g) => g.pesan));
  }
  let r;
  try {
    r = await simpanSoal(pool, { soal: hasil.soal, tulis: true, simpanGambar: null, lembagaId: lembagaIdDari(admin) });
  } catch (e) {
    throw new HttpError(422, 'GAGAL_SIMPAN', `Dibatalkan, tidak ada yang disimpan: ${e.message}`);
  }
  if (r.masalah.length) throw new HttpError(422, 'VALIDATION_ERROR', 'Soal tidak valid', r.masalah.map((g) => g.pesan));
  if (!r.idBaru.length) throw new HttpError(409, 'SOAL_SUDAH_ADA', 'Soal yang sama (topik, teks, dan gambar) sudah ada di bank soal');
  return { id: r.idBaru[0], status: lembagaIdDari(admin) !== null ? 'menunggu' : 'disetujui' };
}

// ---------- Edit satu soal ----------

/**
 * Admin lembaga hanya boleh melihat/mengubah soal milik lembaganya yang belum disetujui (menunggu / ditolak).
 * Soal yang sudah disetujui menjadi soal umum dan hanya bisa diubah super admin. Tanpa `admin` (dipakai tes): tanpa batas.
 */
function izinSoal(admin, q) {
  if (!admin || admin.role === PERAN.SUPER_ADMIN) return;
  const milik = q.institution_id !== null && String(q.institution_id) === String(admin.institutionId);
  if (!milik) throw new HttpError(404, 'SOAL_TIDAK_DITEMUKAN', 'Soal tidak ditemukan');
  if (q.approval_status === 'disetujui') {
    throw new HttpError(403, 'SOAL_SUDAH_DISETUJUI', 'Soal yang sudah disetujui tidak bisa diubah admin lembaga');
  }
}

/** GET /api/admin/soal/:id — data lengkap untuk form edit. */
async function ambilSoal(pool, id, admin) {
  const q = (await pool.query(
    `SELECT q.id, q.topic_id, q.level_soal, q.soal_teks, q.soal_gambar_url, q.opsi_jawaban, q.kunci_jawaban,
            q.pembahasan, q.pembahasan_gambar_url, q.target_waktu_detik, q.is_active, q.hidden_reason, q.is_domain0,
            q.institution_id, q.approval_status, q.approval_catatan, t.nama AS topik, s.kode AS subtes
       FROM questions q JOIN topics t ON t.id = q.topic_id JOIN subjects s ON s.id = t.subject_id
      WHERE q.id = $1`, [id])).rows[0];
  if (!q) throw new HttpError(404, 'SOAL_TIDAK_DITEMUKAN', 'Soal tidak ditemukan');
  izinSoal(admin, q);
  const subs = (await pool.query('SELECT subtopic_id FROM question_subtopics WHERE question_id = $1', [id])).rows;
  const opsi = {};
  HURUF.forEach((h) => { opsi[h] = ''; });
  (Array.isArray(q.opsi_jawaban) ? q.opsi_jawaban : []).forEach((o) => { opsi[o.kode] = o.teks; });
  const kunci = Array.isArray(q.kunci_jawaban) ? q.kunci_jawaban[0] : q.kunci_jawaban;
  return {
    id: String(q.id), subtes: q.subtes, topik_id: String(q.topic_id), topik: q.topik, level: q.level_soal,
    teks: q.soal_teks, gambar_url: q.soal_gambar_url, opsi, kunci: String(kunci || ''),
    pembahasan: q.pembahasan, pembahasan_gambar_url: q.pembahasan_gambar_url, waktu_detik: q.target_waktu_detik,
    subtopik_ids: subs.map((r) => String(r.subtopic_id)), aktif: q.is_active, tersembunyi_karena: q.hidden_reason,
    domain0: q.is_domain0,
    status: q.approval_status, catatan_persetujuan: q.approval_catatan,
    lembaga_id: q.institution_id === null ? null : String(q.institution_id),
  };
}

/** PUT /api/admin/soal/:id — ubah isi soal. Topik tidak berubah (pindah topik = soal baru). */
async function ubahSoal(pool, id, body, admin) {
  const lama = await ambilSoal(pool, id, admin);
  const lembaga = Boolean(admin) && admin.role === PERAN.ADMIN_LEMBAGA;
  if (lama.domain0) {
    throw new HttpError(409, 'SOAL_STAGE', 'Soal diagnostik Domain 0 tidak diedit dari sini');
  }
  const n = parseFormSoal({ ...body, subtes: lama.subtes, topik_id: lama.topik_id });
  const nama = await namaTopikDanSubtopik(pool, lama.topik_id, n.subtopikIds);
  const hasil = validasi({ kolom: KOLOM_FORM, baris: [barisDariForm(n, nama)] });
  if (hasil.galat.length) {
    throw new HttpError(422, 'VALIDATION_ERROR', 'Soal tidak valid', hasil.galat.map((g) => g.pesan));
  }
  const s = hasil.soal[0];
  const waktu = s.waktu || waktuSoal(lama.subtes, s.level);

  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `UPDATE questions
          SET level_soal = $2, soal_teks = $3, soal_gambar_url = $4, opsi_jawaban = $5::jsonb, kunci_jawaban = $6::jsonb,
              pembahasan = $7, pembahasan_gambar_url = $8, target_waktu_detik = $9, updated_at = now()
        WHERE id = $1`,
      [id, s.level, s.teks, s.gambarUrl, JSON.stringify(s.opsi), JSON.stringify(s.kunci), s.pembahasan, s.pembahasanGambarUrl, waktu],
    );
    if (lembaga) { // soal lembaga yang diperbaiki masuk antrean lagi
      await c.query(`UPDATE questions SET approval_status = 'menunggu', approval_catatan = NULL, is_active = false WHERE id = $1`, [id]);
    }
    await c.query('DELETE FROM question_subtopics WHERE question_id = $1', [id]);
    for (const sid of n.subtopikIds) {
      await c.query('INSERT INTO question_subtopics (question_id, subtopic_id) VALUES ($1, $2)', [id, sid]);
    }
    await c.query('COMMIT'); // aturan ikatan subtopik di database diperiksa di sini
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* sudah ditutup */ }
    throw new HttpError(422, 'GAGAL_SIMPAN', `Dibatalkan, tidak ada yang diubah: ${e.message}`);
  } finally {
    c.release();
  }
  return { id: String(id) };
}

// ---------- Gambar ----------

function jenisGambar(b) {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 6 && b.toString('latin1', 0, 3) === 'GIF') return 'gif';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** POST /api/admin/gambar — unggah satu gambar ke Supabase Storage, kembalikan alamat publiknya. */
async function unggahGambar(isi, env = process.env) {
  if (!Buffer.isBuffer(isi) || !isi.length) throw new HttpError(400, 'BAD_REQUEST', 'Berkas gambar kosong');
  const jenis = jenisGambar(isi);
  if (!jenis) throw new HttpError(422, 'GAMBAR_TIDAK_DIDUKUNG', 'Gambar harus PNG, JPG, GIF, atau WEBP');
  if (isi.length > 5 * 1024 * 1024) throw new HttpError(422, 'GAMBAR_TERLALU_BESAR', 'Gambar maksimal 5 MB');
  const { penyimpanan, kurang } = dariEnv(env);
  if (!penyimpanan) throw new HttpError(503, 'PENYIMPANAN_BELUM_DIATUR', `Pengaturan penyimpanan gambar belum lengkap: ${kurang.join(', ')}`);
  const cek = await penyimpanan.periksa();
  if (!cek.ok) throw new HttpError(503, 'PENYIMPANAN_BERMASALAH', cek.pesan);
  return { url: await penyimpanan.unggah(isi, jenis) };
}

module.exports = {
  pilihan, imporDocx, parseFormSoal, buatSoal, ambilSoal, ubahSoal, unggahGambar, jenisGambar, barisDariForm, KOLOM_FORM,
};
