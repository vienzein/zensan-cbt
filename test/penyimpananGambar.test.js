'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buatPenyimpanan, dariEnv } = require('../src/services/penyimpananGambar');

function fetchPalsu(jawab) {
  const panggilan = [];
  const fn = async (alamat, opsi = {}) => {
    panggilan.push({ alamat, ...opsi });
    const j = typeof jawab === 'function' ? jawab(alamat, opsi) : jawab;
    return {
      ok: j.status >= 200 && j.status < 300,
      status: j.status,
      text: async () => j.teks ?? '',
      json: async () => JSON.parse(j.teks ?? '{}'),
    };
  };
  return { fn, panggilan };
}

test('unggah: alamat dari isi (SHA-256), header kunci baru hanya apikey, upsert, tipe isi', async () => {
  const { fn, panggilan } = fetchPalsu({ status: 200, teks: '{}' });
  const p = buatPenyimpanan({ url: 'https://abc.supabase.co/', kunci: 'sb_secret_xyz', bucket: 'soal', fetchFn: fn });
  const isi = Buffer.from('isi-gambar');
  const url = await p.unggah(isi, 'PNG');
  const nama = `${crypto.createHash('sha256').update(isi).digest('hex').slice(0, 24)}.png`;
  assert.equal(url, `https://abc.supabase.co/storage/v1/object/public/soal/${nama}`);
  assert.equal(panggilan[0].alamat, `https://abc.supabase.co/storage/v1/object/soal/${nama}`);
  assert.equal(panggilan[0].method, 'POST');
  assert.equal(panggilan[0].headers.apikey, 'sb_secret_xyz');
  assert.equal(panggilan[0].headers.Authorization, undefined);
  assert.equal(panggilan[0].headers['Content-Type'], 'image/png');
  assert.equal(panggilan[0].headers['x-upsert'], 'true');
  assert.equal(panggilan[0].body, isi);
  // isi yang sama -> nama yang sama (tidak ganda saat dijalankan ulang)
  assert.equal(await p.unggah(Buffer.from('isi-gambar'), 'png'), url);
});

test('kunci legacy (JWT) juga dikirim di Authorization', async () => {
  const { fn, panggilan } = fetchPalsu({ status: 200 });
  const p = buatPenyimpanan({ url: 'https://abc.supabase.co', kunci: 'eyJabc.def.ghi', fetchFn: fn });
  await p.unggah(Buffer.from('x'), 'jpg');
  assert.equal(panggilan[0].headers.Authorization, 'Bearer eyJabc.def.ghi');
  assert.equal(panggilan[0].headers['Content-Type'], 'image/jpeg');
});

test('unggah: HTTP gagal dan jaringan mati menghasilkan pesan yang bisa dipahami', async () => {
  const gagal = buatPenyimpanan({ url: 'https://a.co', kunci: 'k', fetchFn: fetchPalsu({ status: 400, teks: '{"message":"Bucket not found"}' }).fn });
  await assert.rejects(() => gagal.unggah(Buffer.from('x'), 'png'), /HTTP 400.*Bucket not found/);
  const mati = buatPenyimpanan({ url: 'https://a.co', kunci: 'k', fetchFn: async () => { throw new Error('fetch failed'); } });
  await assert.rejects(() => mati.unggah(Buffer.from('x'), 'png'), /Tidak bisa menghubungi Supabase Storage/);
  await assert.rejects(() => gagal.unggah(Buffer.from('x'), 'bmp'), /tidak didukung/);
});

test('periksa: bucket ada & publik = ok; tidak ada, ditolak, tidak publik dijelaskan', async () => {
  const buat = (j) => buatPenyimpanan({ url: 'https://a.co', kunci: 'k', bucket: 'soal', fetchFn: fetchPalsu(j).fn });
  assert.deepEqual(await buat({ status: 200, teks: '{"public":true}' }).periksa(), { ok: true, pesan: '' });
  assert.match((await buat({ status: 404 }).periksa()).pesan, /tidak ditemukan/);
  assert.match((await buat({ status: 403 }).periksa()).pesan, /ditolak/);
  const privat = await buat({ status: 200, teks: '{"public":false}' }).periksa();
  assert.equal(privat.ok, false);
  assert.match(privat.pesan, /Public/);
  assert.match((await buat({ status: 500, teks: 'oops' }).periksa()).pesan, /HTTP 500/);
});

test('dariEnv: melaporkan pengaturan yang kurang; nama bucket bawaan "soal"; kunci lama diterima', () => {
  assert.deepEqual(dariEnv({}).kurang, ['SUPABASE_URL', 'SUPABASE_SECRET_KEY']);
  assert.deepEqual(dariEnv({ SUPABASE_URL: 'https://a.co' }).kurang, ['SUPABASE_SECRET_KEY']);
  const a = dariEnv({ SUPABASE_URL: 'https://a.co', SUPABASE_SECRET_KEY: ' sb_secret_1 ' });
  assert.equal(a.penyimpanan.bucket, 'soal');
  const b = dariEnv({ SUPABASE_URL: 'https://a.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJ.x.y', SUPABASE_BUCKET_SOAL: 'gambar-soal' });
  assert.equal(b.penyimpanan.bucket, 'gambar-soal');
  assert.deepEqual(b.kurang, []);
});

test('hashGambar: isi sama = identitas sama, isi beda = beda, 24 karakter heks', () => {
  const { hashGambar } = require('../src/services/penyimpananGambar');
  const a = hashGambar(Buffer.from('abc'));
  assert.match(a, /^[0-9a-f]{24}$/);
  assert.equal(a, hashGambar(Buffer.from('abc')));
  assert.notEqual(a, hashGambar(Buffer.from('abd')));
});
