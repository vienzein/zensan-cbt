'use strict';

/**
 * Mengunggah gambar soal ke Supabase Storage (bucket publik) lewat REST, tanpa paket tambahan.
 * Nama berkas diambil dari isi gambar (SHA-256), jadi gambar yang sama tidak terunggah dua kali dan
 * menjalankan ulang impor aman.
 *
 * Kunci rahasia Supabase hanya dipakai skrip impor di komputer/server pengelola. JANGAN dimasukkan ke web/.env.
 * Kunci format baru (sb_secret_...) dikirim di header apikey saja; kunci legacy (JWT, diawali eyJ) juga di Authorization.
 */

const crypto = require('node:crypto');
const { TIPE_GAMBAR } = require('./imporWord');

/** Identitas isi gambar (24 heks pertama SHA-256); sama dengan nama berkas di bucket, jadi gambar kembar = nama sama. */
function hashGambar(isi) {
  return crypto.createHash('sha256').update(isi).digest('hex').slice(0, 24);
}

function buatPenyimpanan({ url, kunci, bucket = 'soal', fetchFn = globalThis.fetch }) {
  const dasar = String(url).replace(/\/+$/, '');
  const header = (tambahan = {}) => ({
    apikey: kunci,
    ...(kunci.startsWith('eyJ') ? { Authorization: `Bearer ${kunci}` } : {}),
    ...tambahan,
  });
  const ringkas = (s) => String(s).replace(/\s+/g, ' ').slice(0, 200);

  async function panggil(alamat, opsi) {
    try {
      return await fetchFn(alamat, opsi);
    } catch (e) {
      throw new Error(`Tidak bisa menghubungi Supabase Storage (${e.cause?.code || e.message}). Periksa SUPABASE_URL dan koneksi internet.`);
    }
  }

  return {
    bucket,

    /** Memeriksa kunci dan bucket tanpa mengubah apa pun. { ok, pesan } */
    async periksa() {
      const r = await panggil(`${dasar}/storage/v1/bucket/${encodeURIComponent(bucket)}`, { headers: header() });
      if (r.status === 404) {
        return { ok: false, pesan: `Bucket "${bucket}" tidak ditemukan di Supabase. Buat dulu di Storage > New bucket (centang Public bucket), atau isi SUPABASE_BUCKET_SOAL dengan nama bucket yang benar.` };
      }
      if (r.status === 401 || r.status === 403) {
        return { ok: false, pesan: 'Kunci Supabase ditolak untuk Storage. Pastikan SUPABASE_SECRET_KEY berisi Secret key (sb_secret_...) dari Project Settings > API Keys, tanpa spasi atau tanda kutip yang salah.' };
      }
      if (!r.ok) return { ok: false, pesan: `Storage menjawab HTTP ${r.status}: ${ringkas(await r.text())}` };
      let info = {};
      try { info = await r.json(); } catch { /* abaikan */ }
      if (info.public === false) {
        return { ok: false, pesan: `Bucket "${bucket}" tidak bersifat Public, sehingga gambar tidak akan tampil untuk siswa. Ubah ke Public di Storage > ${bucket} > Edit bucket.` };
      }
      return { ok: true, pesan: '' };
    },

    /** Mengunggah satu gambar, mengembalikan alamat publiknya. */
    async unggah(isi, ekstensi) {
      const tipe = TIPE_GAMBAR[String(ekstensi).toLowerCase()];
      if (!tipe) throw new Error(`Format gambar .${ekstensi} tidak didukung`);
      const nama = `${hashGambar(isi)}.${String(ekstensi).toLowerCase()}`;
      const r = await panggil(`${dasar}/storage/v1/object/${encodeURIComponent(bucket)}/${nama}`, {
        method: 'POST',
        headers: header({ 'Content-Type': tipe, 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }),
        body: isi,
      });
      if (!r.ok) throw new Error(`Gagal mengunggah gambar (HTTP ${r.status}): ${ringkas(await r.text())}`);
      return `${dasar}/storage/v1/object/public/${encodeURIComponent(bucket)}/${nama}`;
    },
  };
}

/** Membaca pengaturan dari .env. Mengembalikan { penyimpanan | null, kurang: [nama pengaturan yang belum diisi] }. */
function dariEnv(env = process.env, fetchFn = globalThis.fetch) {
  const url = env.SUPABASE_URL || '';
  const kunci = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
  const kurang = [];
  if (!url) kurang.push('SUPABASE_URL');
  if (!kunci) kurang.push('SUPABASE_SECRET_KEY');
  if (kurang.length) return { penyimpanan: null, kurang };
  return {
    penyimpanan: buatPenyimpanan({ url, kunci: kunci.trim(), bucket: env.SUPABASE_BUCKET_SOAL || 'soal', fetchFn }),
    kurang,
  };
}

module.exports = { buatPenyimpanan, dariEnv, hashGambar };
