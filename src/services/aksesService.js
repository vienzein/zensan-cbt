'use strict';

/** Program, hak akses siswa, dan pesanan pembayaran transfer manual. */

const crypto = require('node:crypto');
const { HttpError } = require('../errors');
const { withTx, advisoryLock } = require('./tx');
const akses = require('../config/akses');
const { aksesAktif, hitungBerlakuSampai, kodeUnikDari, nominalTransfer, bebasAkses } = require('./aksesLogic');
const { dariEnvBukti, hashGambar } = require('./penyimpananGambar');
const { jenisGambar } = require('./adminSoalService');

const MAKS_BUKTI = 6 * 1024 * 1024;

const S = akses.STATUS_PESANAN;
const TERBUKA = [S.MENUNGGU_TRANSFER, S.MENUNGGU_VERIFIKASI];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const bad = (pesan, details) => new HttpError(422, 'VALIDATION_ERROR', pesan, details);
const cekId = (id) => {
  if (!UUID_RE.test(String(id))) throw bad('id pesanan tidak valid');
  return String(id);
};

function pesananJson(r) {
  return {
    id: r.id,
    program: { kode: r.program_kode, nama: r.program_nama },
    harga: r.harga_rupiah,
    kode_unik: r.kode_unik,
    nominal: nominalTransfer(r.harga_rupiah, r.kode_unik),
    status: r.status,
    nama_pengirim: r.nama_pengirim,
    ada_bukti: Boolean(r.bukti_path),
    catatan_siswa: r.catatan_siswa,
    catatan_admin: r.catatan_admin,
    dilapor_pada: r.dilapor_pada,
    diputuskan_pada: r.diputuskan_pada,
    dibuat: r.created_at,
  };
}

const KOLOM_PESANAN = `p.id, p.program_kode, g.nama AS program_nama, p.harga_rupiah, p.kode_unik, p.status,
       p.nama_pengirim, p.bukti_path, p.catatan_siswa, p.catatan_admin, p.dilapor_pada, p.diputuskan_pada, p.created_at`;

/** GET /api/me/akses — daftar program, status akses siswa, dan apakah wajib bayar. */
async function programSiswa(pool, studentId, role) {
  const { rows } = await pool.query(
    `SELECT g.kode, g.nama, g.deskripsi, g.harga_rupiah, g.durasi_hari,
            a.berlaku_sampai, (a.id IS NOT NULL) AS punya_baris
       FROM programs g
  LEFT JOIN student_access a ON a.program_kode = g.kode AND a.student_id = $1::uuid
      WHERE g.is_active
   ORDER BY g.urutan, g.nama`,
    [studentId],
  );
  const bebas = bebasAkses(role);
  return rows.map((r) => {
    const aktif = bebas || (r.punya_baris && aksesAktif(r.berlaku_sampai));
    return {
      kode: r.kode,
      nama: r.nama,
      deskripsi: r.deskripsi,
      harga: r.harga_rupiah,
      durasi_hari: r.durasi_hari,
      aktif,
      berlaku_sampai: bebas ? null : r.berlaku_sampai,
      pernah_punya: r.punya_baris,
      perlu_bayar: akses.wajibBayar(r.kode) && !aktif,
    };
  });
}

/** True bila siswa boleh memakai program. Dipakai gerbang akses. */
async function punyaAkses(pool, studentId, kode, role) {
  if (!akses.wajibBayar(kode)) return true;
  if (bebasAkses(role)) return true;
  const { rows } = await pool.query(
    'SELECT berlaku_sampai FROM student_access WHERE student_id = $1::uuid AND program_kode = $2',
    [studentId, kode],
  );
  return rows.length > 0 && aksesAktif(rows[0].berlaku_sampai);
}

async function pesananTerbuka(client, studentId, kode) {
  const { rows } = await client.query(
    `SELECT ${KOLOM_PESANAN}
       FROM payments p JOIN programs g ON g.kode = p.program_kode
      WHERE p.student_id = $1::uuid AND p.program_kode = $2 AND p.status = ANY($3)`,
    [studentId, kode, TERBUKA],
  );
  return rows[0] || null;
}

/** POST /api/pembayaran { program } — membuat pesanan, atau mengembalikan pesanan yang masih terbuka. */
async function buatPesanan(pool, studentId, body) {
  const kode = String((body && body.program) ?? '').trim();
  if (!kode) throw bad('Pilih program yang ingin dibeli');
  return withTx(pool, async (client) => {
    await advisoryLock(client, `pesanan:${studentId}`);
    const prog = (await client.query('SELECT kode, nama, harga_rupiah, is_active FROM programs WHERE kode = $1', [kode])).rows[0];
    if (!prog || !prog.is_active) throw new HttpError(404, 'PROGRAM_TIDAK_ADA', 'Program tidak ditemukan');
    if (prog.harga_rupiah <= 0) {
      throw new HttpError(409, 'HARGA_BELUM_DITETAPKAN', 'Harga program ini belum ditetapkan. Hubungi admin.');
    }
    const ada = await pesananTerbuka(client, studentId, kode);
    if (ada) return { ...pesananJson(ada), rekening: akses.rekening() };

    // Nominal (harga + kode unik) tidak boleh kembar dengan pesanan terbuka lain, supaya mutasi rekening tidak ambigu.
    await advisoryLock(client, 'pesanan:nominal');
    let kodeUnik = null;
    for (let i = 0; i < 20 && kodeUnik === null; i += 1) {
      const coba = kodeUnikDari(crypto.randomInt(0, 1000000) / 1000000);
      const bentrok = await client.query(
        'SELECT 1 FROM payments WHERE status = ANY($1) AND harga_rupiah + kode_unik = $2',
        [TERBUKA, nominalTransfer(prog.harga_rupiah, coba)],
      );
      if (!bentrok.rows.length) kodeUnik = coba;
    }
    if (kodeUnik === null) throw new HttpError(503, 'COBA_LAGI', 'Gagal membuat pesanan, coba lagi sebentar');

    const { rows } = await client.query(
      `INSERT INTO payments (student_id, program_kode, harga_rupiah, kode_unik)
       VALUES ($1::uuid, $2, $3, $4) RETURNING id`,
      [studentId, kode, prog.harga_rupiah, kodeUnik],
    );
    const baru = (await client.query(
      `SELECT ${KOLOM_PESANAN} FROM payments p JOIN programs g ON g.kode = p.program_kode WHERE p.id = $1`,
      [rows[0].id],
    )).rows[0];
    return { ...pesananJson(baru), rekening: akses.rekening() };
  });
}

/** GET /api/pembayaran — riwayat pesanan siswa, terbaru dulu. */
async function riwayat(pool, studentId) {
  const { rows } = await pool.query(
    `SELECT ${KOLOM_PESANAN} FROM payments p JOIN programs g ON g.kode = p.program_kode
      WHERE p.student_id = $1::uuid ORDER BY p.created_at DESC LIMIT 50`,
    [studentId],
  );
  return { rekening: akses.rekening(), pesanan: rows.map(pesananJson) };
}

async function ambilMilikSiswa(client, studentId, id) {
  const { rows } = await client.query(
    `SELECT ${KOLOM_PESANAN} FROM payments p JOIN programs g ON g.kode = p.program_kode
      WHERE p.id = $1::uuid AND p.student_id = $2::uuid FOR UPDATE OF p`,
    [id, studentId],
  );
  if (!rows.length) throw new HttpError(404, 'PESANAN_TIDAK_ADA', 'Pesanan tidak ditemukan');
  return rows[0];
}

/** POST /api/pembayaran/:id/konfirmasi { nama_pengirim, catatan } — siswa melapor sudah transfer. */
async function konfirmasiPesanan(pool, studentId, id, body) {
  const nama = String((body && body.nama_pengirim) ?? '').trim().replace(/\s+/g, ' ');
  const catatan = String((body && body.catatan) ?? '').trim();
  if (nama.length < 2 || nama.length > 120) throw bad('Nama pengirim harus 2-120 karakter');
  if (catatan.length > 500) throw bad('Catatan maksimal 500 karakter');
  return withTx(pool, async (client) => {
    const p = await ambilMilikSiswa(client, studentId, cekId(id));
    if (p.status !== S.MENUNGGU_TRANSFER) {
      throw new HttpError(409, 'STATUS_TIDAK_SESUAI', 'Pesanan ini tidak bisa dikonfirmasi lagi');
    }
    if (!p.bukti_path) throw bad('Unggah foto bukti transfer dulu');
    await client.query(
      `UPDATE payments SET status = $2, nama_pengirim = $3, catatan_siswa = $4, dilapor_pada = now() WHERE id = $1`,
      [p.id, S.MENUNGGU_VERIFIKASI, nama, catatan || null],
    );
    return { ...pesananJson({ ...p, status: S.MENUNGGU_VERIFIKASI, nama_pengirim: nama, catatan_siswa: catatan || null, dilapor_pada: new Date() }), rekening: akses.rekening() };
  });
}

/** POST /api/pembayaran/:id/batal — hanya sebelum siswa melapor transfer. */
async function batalkanPesanan(pool, studentId, id) {
  return withTx(pool, async (client) => {
    const p = await ambilMilikSiswa(client, studentId, cekId(id));
    if (p.status !== S.MENUNGGU_TRANSFER) {
      throw new HttpError(409, 'STATUS_TIDAK_SESUAI', 'Pesanan yang sudah dilaporkan tidak bisa dibatalkan');
    }
    await client.query('UPDATE payments SET status = $2 WHERE id = $1', [p.id, S.DIBATALKAN]);
    return { ok: true };
  });
}

/** Pesan galat bila penyimpanan bukti belum siap; null bila siap. */
async function siapkanPenyimpananBukti(env) {
  const { penyimpanan, kurang } = dariEnvBukti(env);
  if (!penyimpanan) throw new HttpError(503, 'PENYIMPANAN_BELUM_DIATUR', `Pengaturan penyimpanan bukti belum lengkap: ${kurang.join(', ')}`);
  const cek = await penyimpanan.periksa();
  if (!cek.ok) throw new HttpError(503, 'PENYIMPANAN_BERMASALAH', cek.pesan);
  return penyimpanan;
}

/** POST /api/pembayaran/:id/bukti — unggah (atau ganti) foto bukti transfer. Badan permintaan = isi gambar. */
async function unggahBukti(pool, studentId, id, isi, env = process.env) {
  if (!Buffer.isBuffer(isi) || !isi.length) throw new HttpError(400, 'BAD_REQUEST', 'Berkas bukti kosong');
  const jenis = jenisGambar(isi);
  if (!jenis || jenis === 'gif') throw new HttpError(422, 'GAMBAR_TIDAK_DIDUKUNG', 'Bukti harus berupa foto PNG, JPG, atau WEBP');
  if (isi.length > MAKS_BUKTI) throw new HttpError(422, 'GAMBAR_TERLALU_BESAR', 'Foto bukti maksimal 6 MB');
  const idPesanan = cekId(id);
  // Cek kepemilikan dan status sebelum mengunggah, supaya berkas tidak menumpuk untuk pesanan yang tidak sah.
  const { rows } = await pool.query(
    'SELECT status FROM payments WHERE id = $1::uuid AND student_id = $2::uuid',
    [idPesanan, studentId],
  );
  if (!rows.length) throw new HttpError(404, 'PESANAN_TIDAK_ADA', 'Pesanan tidak ditemukan');
  if (!TERBUKA.includes(rows[0].status)) {
    throw new HttpError(409, 'STATUS_TIDAK_SESUAI', 'Bukti hanya bisa diunggah untuk pesanan yang masih berjalan');
  }
  const penyimpanan = await siapkanPenyimpananBukti(env);
  const nama = `${idPesanan}-${hashGambar(isi)}.${jenis}`;
  await penyimpanan.unggahPribadi(isi, nama, jenis);
  await pool.query(
    'UPDATE payments SET bukti_path = $2 WHERE id = $1::uuid AND student_id = $3::uuid AND status = ANY($4)',
    [idPesanan, nama, studentId, TERBUKA],
  );
  return { ok: true, ada_bukti: true };
}

// ---------- Admin (super admin) ----------

/** GET /api/admin/pembayaran/:id/bukti — tautan sementara (5 menit) untuk melihat bukti transfer. */
async function urlBukti(pool, id, env = process.env) {
  const { rows } = await pool.query('SELECT bukti_path FROM payments WHERE id = $1::uuid', [cekId(id)]);
  if (!rows.length) throw new HttpError(404, 'PESANAN_TIDAK_ADA', 'Pesanan tidak ditemukan');
  if (!rows[0].bukti_path) throw new HttpError(404, 'BUKTI_TIDAK_ADA', 'Siswa belum mengunggah bukti');
  const penyimpanan = await siapkanPenyimpananBukti(env);
  return { url: await penyimpanan.tautanSementara(rows[0].bukti_path, 300) };
}


/** GET /api/admin/pembayaran?status=menunggu|semua */
async function daftarPembayaran(pool, status) {
  const semua = status === 'semua';
  const { rows } = await pool.query(
    `SELECT ${KOLOM_PESANAN}, s.email, s.nama AS nama_siswa
       FROM payments p
       JOIN programs g ON g.kode = p.program_kode
       JOIN students s ON s.id = p.student_id
      WHERE ($1::boolean OR p.status = $2)
   ORDER BY (p.status = $2) DESC, p.dilapor_pada DESC NULLS LAST, p.created_at DESC
      LIMIT 200`,
    [semua, S.MENUNGGU_VERIFIKASI],
  );
  return rows.map((r) => ({ ...pesananJson(r), siswa: { email: r.email, nama: r.nama_siswa } }));
}

/** POST /api/admin/pembayaran/:id/keputusan { setuju: boolean, catatan } */
async function putuskanPembayaran(pool, adminId, id, body) {
  const setuju = body && body.setuju;
  if (typeof setuju !== 'boolean') throw bad('Keputusan harus setuju atau tolak');
  const catatan = String((body && body.catatan) ?? '').trim();
  if (!setuju && catatan.length < 3) throw bad('Tuliskan alasan penolakan agar siswa tahu');
  if (catatan.length > 500) throw bad('Catatan maksimal 500 karakter');

  return withTx(pool, async (client) => {
    const { rows } = await client.query(
      `SELECT p.id, p.student_id, p.program_kode, p.status, g.durasi_hari
         FROM payments p JOIN programs g ON g.kode = p.program_kode
        WHERE p.id = $1::uuid FOR UPDATE OF p`,
      [cekId(id)],
    );
    const p = rows[0];
    if (!p) throw new HttpError(404, 'PESANAN_TIDAK_ADA', 'Pesanan tidak ditemukan');
    // Boleh memutuskan pesanan yang sudah dilapor; pesanan yang belum dilapor juga boleh bila admin sudah melihat mutasinya.
    if (!TERBUKA.includes(p.status)) {
      throw new HttpError(409, 'STATUS_TIDAK_SESUAI', 'Pesanan ini sudah diputuskan atau dibatalkan');
    }
    await client.query(
      `UPDATE payments SET status = $2, catatan_admin = $3, diputuskan_oleh = $4::uuid, diputuskan_pada = now() WHERE id = $1`,
      [p.id, setuju ? S.LUNAS : S.DITOLAK, catatan || null, adminId],
    );
    let berlakuSampai = null;
    if (setuju) {
      const lama = (await client.query(
        'SELECT berlaku_sampai FROM student_access WHERE student_id = $1::uuid AND program_kode = $2 FOR UPDATE',
        [p.student_id, p.program_kode],
      )).rows[0];
      berlakuSampai = hitungBerlakuSampai({ berlakuSampaiSaatIni: lama ? lama.berlaku_sampai : null, durasiHari: p.durasi_hari });
      await client.query(
        `INSERT INTO student_access (student_id, program_kode, berlaku_sampai, sumber, pembayaran_id)
         VALUES ($1::uuid, $2, $3, 'pembayaran', $4::uuid)
         ON CONFLICT (student_id, program_kode)
         DO UPDATE SET berlaku_sampai = EXCLUDED.berlaku_sampai, sumber = 'pembayaran', pembayaran_id = EXCLUDED.pembayaran_id`,
        [p.student_id, p.program_kode, berlakuSampai, p.id],
      );
    }
    return { id: p.id, status: setuju ? S.LUNAS : S.DITOLAK, berlaku_sampai: berlakuSampai };
  });
}

module.exports = {
  programSiswa, punyaAkses, buatPesanan, riwayat, konfirmasiPesanan, batalkanPesanan, unggahBukti,
  daftarPembayaran, putuskanPembayaran, urlBukti,
};
