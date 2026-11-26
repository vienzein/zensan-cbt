'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buatPenyimpanan } = require('../src/services/penyimpananGambar');
const svc = require('../src/services/aksesService');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const GIF = Buffer.from('GIF89a-isi-gif');
const SID = '11111111-1111-1111-1111-111111111111';
const PID = '22222222-2222-2222-2222-222222222222';
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_abc' };

const jawab = (status, json) => ({ ok: status >= 200 && status < 300, status, json: async () => json, text: async () => JSON.stringify(json ?? '') });

test('penyimpanan privat: bucket Public ditolak, Private diterima', async () => {
  const pub = buatPenyimpanan({ url: 'https://x.supabase.co', kunci: 'k', bucket: 'bukti', pribadi: true, fetchFn: async () => jawab(200, { public: true }) });
  assert.equal((await pub.periksa()).ok, false);
  const priv = buatPenyimpanan({ url: 'https://x.supabase.co', kunci: 'k', bucket: 'bukti', pribadi: true, fetchFn: async () => jawab(200, { public: false }) });
  assert.equal((await priv.periksa()).ok, true);
});

test('penyimpanan privat: unggahPribadi memakai nama yang diberikan, tanpa alamat publik', async () => {
  let dipanggil;
  const p = buatPenyimpanan({
    url: 'https://x.supabase.co/', kunci: 'sb_secret_k', bucket: 'bukti', pribadi: true,
    fetchFn: async (u, o) => { dipanggil = { u, o }; return jawab(200, {}); },
  });
  const nama = await p.unggahPribadi(PNG, 'abc.png', 'png');
  assert.equal(nama, 'abc.png');
  assert.equal(dipanggil.u, 'https://x.supabase.co/storage/v1/object/bukti/abc.png');
  assert.equal(dipanggil.o.headers['Content-Type'], 'image/png');
});

test('penyimpanan privat: tautanSementara menyusun alamat lengkap dari signedURL', async () => {
  const p = buatPenyimpanan({
    url: 'https://x.supabase.co', kunci: 'k', bucket: 'bukti', pribadi: true,
    fetchFn: async () => jawab(200, { signedURL: '/object/sign/bukti/abc.png?token=T' }),
  });
  assert.equal(await p.tautanSementara('abc.png', 300), 'https://x.supabase.co/storage/v1/object/sign/bukti/abc.png?token=T');
});

function poolPesanan(row) {
  const panggilan = [];
  return {
    panggilan,
    async query(sql, params) {
      panggilan.push({ sql, params });
      if (/^SELECT status FROM payments/.test(sql)) return { rows: row ? [row] : [] };
      return { rows: [] };
    },
  };
}
const storageOk = () => async (u) => (/\/bucket\//.test(u) ? jawab(200, { public: false }) : jawab(200, {}));
const kode = async (fn) => { try { await fn(); return null; } catch (e) { return e.code; } };

test('unggahBukti: bukan gambar, GIF, kosong, dan terlalu besar ditolak', async () => {
  const pool = poolPesanan({ status: 'menunggu_transfer' });
  assert.equal(await kode(() => svc.unggahBukti(pool, SID, PID, Buffer.from('bukan gambar'), ENV)), 'GAMBAR_TIDAK_DIDUKUNG');
  assert.equal(await kode(() => svc.unggahBukti(pool, SID, PID, GIF, ENV)), 'GAMBAR_TIDAK_DIDUKUNG');
  assert.equal(await kode(() => svc.unggahBukti(pool, SID, PID, Buffer.alloc(0), ENV)), 'BAD_REQUEST');
  const besar = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
  assert.equal(await kode(() => svc.unggahBukti(pool, SID, PID, besar, ENV)), 'GAMBAR_TERLALU_BESAR');
  assert.equal(pool.panggilan.length, 0); // ditolak sebelum menyentuh database
});

test('unggahBukti: pesanan milik orang lain atau sudah selesai ditolak', async () => {
  assert.equal(await kode(() => svc.unggahBukti(poolPesanan(null), SID, PID, PNG, ENV)), 'PESANAN_TIDAK_ADA');
  assert.equal(await kode(() => svc.unggahBukti(poolPesanan({ status: 'lunas' }), SID, PID, PNG, ENV)), 'STATUS_TIDAK_SESUAI');
});

test('unggahBukti: id pesanan bukan UUID ditolak', async () => {
  assert.equal(await kode(() => svc.unggahBukti(poolPesanan({ status: 'menunggu_transfer' }), SID, 'bukan-uuid', PNG, ENV)), 'VALIDATION_ERROR');
});

test('unggahBukti: penyimpanan belum diatur memberi 503 yang jelas', async () => {
  assert.equal(await kode(() => svc.unggahBukti(poolPesanan({ status: 'menunggu_transfer' }), SID, PID, PNG, {})), 'PENYIMPANAN_BELUM_DIATUR');
});

test('urlBukti: pesanan tanpa bukti memberi 404 BUKTI_TIDAK_ADA', async () => {
  const pool = { query: async () => ({ rows: [{ bukti_path: null }] }) };
  assert.equal(await kode(() => svc.urlBukti(pool, PID, ENV)), 'BUKTI_TIDAK_ADA');
  const kosong = { query: async () => ({ rows: [] }) };
  assert.equal(await kode(() => svc.urlBukti(kosong, PID, ENV)), 'PESANAN_TIDAK_ADA');
});

function poolTx(pesanan) {
  const client = {
    async query(sql) {
      if (/FOR UPDATE OF p/.test(sql)) return { rows: pesanan ? [pesanan] : [] };
      return { rows: [] };
    },
    release() {},
  };
  return { connect: async () => client };
}
const dasar = { id: PID, program_kode: 'cbt', program_nama: 'Drill', harga_rupiah: 99000, kode_unik: 217, status: 'menunggu_transfer', nama_pengirim: null, catatan_siswa: null, catatan_admin: null, dilapor_pada: null, diputuskan_pada: null, created_at: new Date() };

test('konfirmasi: tanpa bukti ditolak, dengan bukti berhasil', async () => {
  const body = { nama_pengirim: 'Rina Marlina', catatan: '' };
  assert.equal(await kode(() => svc.konfirmasiPesanan(poolTx({ ...dasar, bukti_path: null }), SID, PID, body)), 'VALIDATION_ERROR');
  const r = await svc.konfirmasiPesanan(poolTx({ ...dasar, bukti_path: 'x.png' }), SID, PID, body);
  assert.equal(r.status, 'menunggu_verifikasi');
  assert.equal(r.ada_bukti, true);
});
