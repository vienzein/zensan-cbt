'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFormSoal, barisDariForm, KOLOM_FORM, imporDocx, jenisGambar, unggahGambar, buatSoal } = require('../src/services/adminSoalService');
const { validasi } = require('../src/services/imporSoal');

const sah = () => ({
  subtes: 'PU', topik_id: '12', subtopik_ids: ['100', '101'], level: 2, teks: 'Berapa 2 + 2?',
  opsi: { A: '3', B: '4', C: '5', D: '', E: '' }, kunci: 'b', pembahasan: 'Dua tambah dua.',
});
const galat = (fn) => { try { fn(); } catch (e) { return e; } return null; };

test('parseFormSoal: bentuk sah diterima dan dirapikan', () => {
  const n = parseFormSoal(sah());
  assert.equal(n.kunci, 'B');
  assert.deepEqual(n.subtopikIds, ['100', '101']);
  assert.equal(n.gambarUrl, null);
});

test('parseFormSoal: menolak level, subtopik, teks, waktu, dan alamat gambar yang salah', () => {
  const e = galat(() => parseFormSoal({ ...sah(), level: 5, subtopik_ids: [], teks: ' ', waktu_detik: 2, gambar_url: 'ftp://x' }));
  assert.equal(e.status, 422);
  assert.equal(e.details.length, 5);
  assert.equal(galat(() => parseFormSoal(null)).status, 400);
  assert.equal(galat(() => parseFormSoal({ ...sah(), topik_id: 'abc' })).status, 422);
});

test('form menjadi baris yang lolos validasi impor; kunci tak cocok, opsi bercelah, dan penanda sementara ditolak', () => {
  const nama = { subtes: 'PU', topik: 'Penalaran Deduktif', subtopik: ['Silogisme'] };
  const cek = (ubah) => validasi({ kolom: KOLOM_FORM, baris: [barisDariForm(parseFormSoal({ ...sah(), ...ubah }), nama)] });
  const ok = cek({});
  assert.equal(ok.galat.length, 0);
  assert.equal(ok.soal[0].kunci, 'B');
  assert.ok(ok.soal[0].waktu > 0); // waktu bawaan mengikuti subtes + level
  assert.ok(cek({ kunci: 'E' }).galat.length);
  assert.ok(cek({ opsi: { A: '3', B: '4', C: '', D: '6', E: '' } }).galat.length);
  assert.ok(cek({ teks: 'Soal [GAMBAR DIPERLUKAN: grafik]' }).galat.length);
});

test('imporDocx: berkas rusak dilaporkan sebagai galat, bukan melempar', async () => {
  const r = await imporDocx({}, Buffer.from('bukan docx'), { tulis: false, lewatiBertanda: false });
  assert.equal(r.ok, false);
  assert.ok(r.galat[0].pesan.length > 0);
});

test('jenisGambar mengenali PNG/JPG/GIF/WEBP dari isinya dan menolak yang lain', () => {
  assert.equal(jenisGambar(Buffer.from('89504e470d0a1a0a0000000d', 'hex')), 'png');
  assert.equal(jenisGambar(Buffer.from('ffd8ffe000104a46', 'hex')), 'jpg');
  assert.equal(jenisGambar(Buffer.from('GIF89a......')), 'gif');
  assert.equal(jenisGambar(Buffer.from('RIFF....WEBPVP8 ')), 'webp');
  assert.equal(jenisGambar(Buffer.from('<svg></svg>........')), null);
});

test('unggahGambar: tipe salah ditolak dan pengaturan penyimpanan yang kurang dilaporkan', async () => {
  await assert.rejects(unggahGambar(Buffer.from('teks biasa panjang sekali'), {}), (e) => e.status === 422);
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  await assert.rejects(unggahGambar(png, {}), (e) => e.status === 503 && /SUPABASE_URL/.test(e.message));
});

test('buatSoal: subtopik yang bukan milik topik ditolak sebelum menulis apa pun', async () => {
  let ditulis = false;
  const pool = {
    query: async (sql) => {
      if (/FROM topics t JOIN subjects/.test(sql)) return { rows: [{ id: 12, nama: 'Penalaran Deduktif', subtes: 'PU' }] };
      if (/FROM subtopics/.test(sql)) return { rows: [{ id: 100, nama: 'Silogisme' }] }; // hanya 1 dari 2 yang cocok
      return { rows: [] };
    },
    connect: async () => { ditulis = true; throw new Error('tidak boleh'); },
  };
  const e = await buatSoal(pool, sah()).catch((x) => x);
  assert.equal(e.status, 422);
  assert.equal(ditulis, false);
});
