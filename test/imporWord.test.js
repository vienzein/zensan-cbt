'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { parseCsv, validasi } = require('../src/services/imporSoal');
const { parseSoalWord, bacaDocx, bacaDocxLengkap, docxKeBaris, keCsv, KOLOM_CSV } = require('../src/services/imporWord');

// ---- pembantu: membuat .docx kecil di memori --------------------------------------------------

const TABEL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = TABEL_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function buatZip(berkas, simpanSaja = false) {
  const lokal = [];
  const pusat = [];
  let offset = 0;
  for (const [nama, isi] of Object.entries(berkas)) {
    const nm = Buffer.from(nama);
    const data = Buffer.from(isi);
    const metode = simpanSaja ? 0 : 8;
    const mampat = simpanSaja ? data : zlib.deflateRawSync(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(metode, 8);
    lh.writeUInt32LE(crc32(data), 14); lh.writeUInt32LE(mampat.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nm.length, 26);
    lokal.push(lh, nm, mampat);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(metode, 10);
    ch.writeUInt32LE(crc32(data), 16); ch.writeUInt32LE(mampat.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(offset, 42);
    pusat.push(ch, nm);
    offset += 30 + nm.length + mampat.length;
  }
  const dir = Buffer.concat(pusat);
  const akhir = Buffer.alloc(22);
  akhir.writeUInt32LE(0x06054b50, 0);
  akhir.writeUInt16LE(Object.keys(berkas).length, 8); akhir.writeUInt16LE(Object.keys(berkas).length, 10);
  akhir.writeUInt32LE(dir.length, 12); akhir.writeUInt32LE(offset, 16);
  return Buffer.concat([...lokal, dir, akhir]);
}

const NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
const dokumen = (isi) => `<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>${isi}</w:body></w:document>`;
const para = (isi, ppr = '') => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${isi}</w:p>`;
const run = (t, rpr = '') => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
const teksSaja = (t) => para(run(t));
const mr = (t) => `<m:r><m:t>${t}</m:t></m:r>`;

const P = (...teks) => teks.map((t) => ({ teks: t, gambar: false, daftar: null }));

// ---- parseSoalWord ----------------------------------------------------------------------------

test('satu soal lengkap dibaca ke semua kolom dan lolos validasi', () => {
  const r = parseSoalWord(P(
    'Tes: SNBT', 'Subtes: PM', 'Topik: Aljabar dan Fungsi', 'Subtopik: Persamaan kuadrat', 'Level: 2',
    'Soal: Akar dari x² − 5x + 6 = 0 adalah ...',
    'A. 1 dan 6', 'B. 2 dan 3', 'C. −2 dan −3', 'D. 1 dan 5', 'E. 3 dan 4',
    'Kunci: b', 'Pembahasan: Faktorkan menjadi (x−2)(x−3) = 0.', '---',
  ));
  assert.deepEqual(r.galat, []);
  assert.equal(r.baris.length, 1);
  const b = r.baris[0];
  assert.equal(b.soal, 'Akar dari x² − 5x + 6 = 0 adalah ...');
  assert.equal(b.opsi_b, '2 dan 3');
  assert.equal(b.kunci, 'B');
  assert.equal(b.level, '2');
  assert.deepEqual(KOLOM_CSV.filter((k) => !(k in b)), []);
  const v = validasi({ kolom: r.kolom, baris: r.baris });
  assert.deepEqual(v.galat, []);
  assert.equal(v.soal[0].opsi.length, 5);
  assert.equal(v.soal[0].kunci, 'B');
  assert.equal(v.soal[0].waktu, 70); // PM level 2: dari config waktu
});

test('tes, subtes, topik, subtopik, level diwarisi dari soal sebelumnya bila dikosongkan', () => {
  const r = parseSoalWord(P(
    'Tes: SNBT', 'Subtes: PU', 'Topik: Penalaran Logis', 'Subtopik: Silogisme', 'Level: 1',
    'Soal: Soal satu', 'A. a', 'B. b', 'Kunci: A', '---',
    'Soal: Soal dua', 'A. a', 'B. b', 'Kunci: B', '---',
    'Level: 2', 'Soal: Soal tiga', 'A. a', 'B. b', 'Kunci: A',
  ));
  assert.deepEqual(r.galat, []);
  assert.deepEqual(r.baris.map((b) => [b.subtes, b.topik, b.level]), [
    ['PU', 'Penalaran Logis', '1'], ['PU', 'Penalaran Logis', '1'], ['PU', 'Penalaran Logis', '2'],
  ]);
});

test('soal dan pembahasan boleh beberapa paragraf; opsi bersambung dengan spasi', () => {
  const r = parseSoalWord(P(
    'Tes: SNBT', 'Subtes: PU', 'Topik: T', 'Subtopik: S', 'Level: 1',
    'Soal: Baris pertama soal.', 'Baris kedua soal.',
    'A. Pilihan satu', 'yang panjang', 'B. Pilihan dua', 'Kunci: A',
    'Pembahasan: Langkah 1.', 'Langkah 2.',
  ));
  const b = r.baris[0];
  assert.equal(b.soal, 'Baris pertama soal.\nBaris kedua soal.');
  assert.equal(b.opsi_a, 'Pilihan satu yang panjang');
  assert.equal(b.pembahasan, 'Langkah 1.\nLangkah 2.');
});

test('"A." di dalam pembahasan tidak dianggap opsi', () => {
  const r = parseSoalWord(P(
    'Tes: SNBT', 'Subtes: PU', 'Topik: T', 'Subtopik: S', 'Level: 1',
    'Soal: s', 'A. a', 'B. b', 'Kunci: A', 'Pembahasan: Perhatikan:', 'A. langkah pertama', 'B. langkah kedua',
  ));
  assert.equal(r.baris[0].opsi_a, 'a');
  assert.equal(r.baris[0].pembahasan, 'Perhatikan:\nA. langkah pertama\nB. langkah kedua');
});

test('label dua kali dalam satu soal (garis pemisah terlewat) dilaporkan dengan nomor soal', () => {
  const r = parseSoalWord(P(
    'Tes: SNBT', 'Subtes: PU', 'Topik: T', 'Subtopik: S', 'Level: 1',
    'Soal: satu', 'A. a', 'B. b', 'Kunci: A',
    'Soal: dua', 'A. a', 'B. b', 'Kunci: B',
  ));
  assert.ok(r.galat.length > 0);
  assert.equal(r.galat[0].baris, 1);
  assert.match(r.galat[0].pesan, /dua kali/);
});

test('huruf opsi melompat dilaporkan; kunci di luar opsi ditolak validasi', () => {
  const r = parseSoalWord(P(
    'Tes: SNBT', 'Subtes: PU', 'Topik: T', 'Subtopik: S', 'Level: 1',
    'Soal: s', 'A. a', 'C. c', 'Kunci: A',
  ));
  assert.match(r.galat[0].pesan, /tidak berurutan/);
  const r2 = parseSoalWord(P(
    'Tes: SNBT', 'Subtes: PU', 'Topik: T', 'Subtopik: S', 'Level: 1',
    'Soal: s', 'A. a', 'B. b', 'Kunci: E',
  ));
  assert.match(validasi({ kolom: r2.kolom, baris: r2.baris }).galat[0].pesan, /kunci/);
});

test('blok tanpa label (petunjuk, catatan) diabaikan dengan peringatan; soal berikutnya tetap nomor 1', () => {
  const r = parseSoalWord(P(
    'Ini petunjuk pengisian untuk tim.', 'Hapus bagian ini sebelum impor.', '---',
    'Tes: SNBT', 'Subtes: PU', 'Topik: T', 'Subtopik: S', 'Level: 1', 'Soal: s', 'A. a', 'B. b', 'Kunci: A', '---', '---',
  ));
  assert.equal(r.baris.length, 1);
  assert.equal(r.baris[0]._nomor, 1);
  assert.equal(r.peringatan.length, 1);
  assert.match(r.peringatan[0], /Ini petunjuk/);
});

test('nilai dirapikan: "Level 3", "L3", kunci "(c)", waktu "60 detik"', () => {
  const r = parseSoalWord(P(
    'Tes: SNBT', 'Subtes: PU', 'Topik: T', 'Subtopik: S | U', 'Level: Level 3', 'Waktu: 60 detik', 'Poin: 15 poin',
    'Soal: s', 'A. a', 'B. b', 'C. c', 'Kunci: (c)',
  ));
  const b = r.baris[0];
  assert.equal(b.level, '3');
  assert.equal(b.waktu_detik, '60');
  assert.equal(b.poin, '15');
  assert.equal(b.kunci, 'C');
  assert.deepEqual(validasi({ kolom: r.kolom, baris: r.baris }).galat, []);
});

test('penanda AI yang belum diselesaikan ([PERLU GAMBAR], [TIDAK TERBACA]) ditolak', () => {
  const r = parseSoalWord(P(
    'Tes: SNBT', 'Subtes: PM', 'Topik: T', 'Subtopik: S', 'Level: 1',
    'Soal: Perhatikan grafik. [PERLU GAMBAR: parabola membuka ke atas]', 'A. a', 'B. b', 'Kunci: A',
    'Pembahasan: ok [TIDAK TERBACA]',
  ));
  assert.match(r.galat[0].pesan, /penanda/);
  assert.equal(r.galat[0].baris, 1);
});

test('daftar berhuruf otomatis Word menjadi opsi A-E, tanpa menggeser nomor antar soal', () => {
  const huruf = { jenis: 'huruf', kunci: '1:0' };
  const p = (teks, daftar = null) => ({ teks, gambar: false, daftar });
  const r = parseSoalWord([
    p('Tes: SNBT'), p('Subtes: PU'), p('Topik: T'), p('Subtopik: S'), p('Level: 1'),
    p('Soal: s1'), p('satu', huruf), p('dua', huruf), p('Kunci: B'), p('---'),
    p('Soal: s2'), p('tiga', huruf), p('empat', huruf), p('Kunci: A'),
  ]);
  assert.deepEqual(r.galat, []);
  assert.deepEqual(r.baris.map((b) => [b.opsi_a, b.opsi_b]), [['satu', 'dua'], ['tiga', 'empat']]);
});

test('daftar bernomor di dalam soal dipertahankan sebagai teks "1. ..."', () => {
  const angka = { jenis: 'angka', kunci: '2:0' };
  const p = (teks, daftar = null) => ({ teks, gambar: false, daftar });
  const r = parseSoalWord([
    p('Tes: SNBT'), p('Subtes: PU'), p('Topik: T'), p('Subtopik: S'), p('Level: 1'),
    p('Soal: Perhatikan pernyataan berikut:'), p('Semua A adalah B', angka), p('Sebagian B adalah C', angka),
    p('A. a'), p('B. b'), p('Kunci: A'),
  ]);
  assert.equal(r.baris[0].soal, 'Perhatikan pernyataan berikut:\n1. Semua A adalah B\n2. Sebagian B adalah C');
});

test('gambar tertanam: setelah Soal -> gambar soal, setelah Pembahasan -> gambar pembahasan', () => {
  const g = (...nama) => nama;
  const p = (teks, gambar = []) => ({ teks, gambar, daftar: null });
  const r = parseSoalWord([
    p('Tes: SNBT'), p('Subtes: PM'), p('Topik: T'), p('Subtopik: S'), p('Level: 1'),
    p('Soal: lihat grafik'), p('', g('word/media/image1.png')),
    p('A. a'), p('B. b'), p('Kunci: A'),
    p('Pembahasan: lihat'), p('', g('word/media/image2.jpg')),
  ]);
  assert.deepEqual(r.galat, []);
  assert.equal(r.baris[0]._gambarSoal, 'word/media/image1.png');
  assert.equal(r.baris[0]._gambarPembahasan, 'word/media/image2.jpg');
  const v = validasi({ kolom: r.kolom, baris: r.baris });
  assert.equal(v.soal[0].gambarBerkas, 'word/media/image1.png');
  assert.equal(v.soal[0].pembahasanGambarBerkas, 'word/media/image2.jpg');
});

test('gambar di bawah label "Gambar:" dipakai walau diletakkan setelah opsi; alamat ketikan didahulukan', () => {
  const p = (teks, gambar = []) => ({ teks, gambar, daftar: null });
  const r = parseSoalWord([
    p('Tes: SNBT'), p('Subtes: PM'), p('Topik: T'), p('Subtopik: S'), p('Level: 1'),
    p('Soal: s'), p('A. a'), p('B. b'), p('Gambar:'), p('', ['word/media/image1.png']), p('Kunci: A'),
    p('---'),
    p('Soal: s2'), p('A. a'), p('B. b'), p('Gambar: https://x/y.png'), p('', ['word/media/image2.png']), p('Kunci: A'),
  ]);
  assert.equal(r.baris[0]._gambarSoal, 'word/media/image1.png');
  assert.equal(r.baris[0].opsi_b, 'b');
  const v = validasi({ kolom: r.kolom, baris: r.baris });
  assert.equal(v.soal[0].gambarBerkas, 'word/media/image1.png');
  assert.equal(v.soal[1].gambarUrl, 'https://x/y.png');
  assert.equal(v.soal[1].gambarBerkas, null);
  assert.ok(r.peringatan.some((x) => /yang dipakai alamatnya/.test(x)));
});

test('gambar di bawah opsi atau label lain diabaikan dengan peringatan; lebih dari satu gambar: pakai yang pertama', () => {
  const p = (teks, gambar = []) => ({ teks, gambar, daftar: null });
  const r = parseSoalWord([
    p('Tes: SNBT'), p('Subtes: PM'), p('Topik: T'), p('Subtopik: S'), p('Level: 1'),
    p('Soal: s'), p('', ['word/media/a.png', 'word/media/b.png']),
    p('A. a'), p('', ['word/media/c.png']), p('B. b'), p('Kunci: A'), p('', ['word/media/d.png']),
  ]);
  assert.equal(r.baris[0]._gambarSoal, 'word/media/a.png');
  assert.equal(r.peringatan.filter((x) => /hanya yang pertama/.test(x)).length, 1);
  assert.ok(r.peringatan.some((x) => /opsi A/.test(x)));
  assert.ok(r.peringatan.some((x) => /label "kunci"/.test(x)));
});

// ---- bacaDocx: .docx sungguhan (zip + XML) ----------------------------------------------------

test('bacaDocx membaca teks, pangkat/indeks, dan persamaan Word (pecahan, akar, pangkat)', () => {
  const xml = dokumen([
    teksSaja('Soal: Nilai x'),
    para(`${run('x')}${run('2', '<w:vertAlign w:val="superscript"/>')}${run(' dan H')}${run('2', '<w:vertAlign w:val="subscript"/>')}${run('O')}`),
    para(`<m:oMath><m:f><m:num>${mr('x+1')}</m:num><m:den>${mr('2')}</m:den></m:f>${mr('=')}<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>${mr('x')}</m:e></m:rad></m:oMath>`),
    para(`<m:oMath><m:sSup><m:e>${mr('a')}</m:e><m:sup>${mr('n+1')}</m:sup></m:sSup></m:oMath>`),
    para(`<m:oMath><m:d><m:dPr/><m:e>${mr('x')}</m:e><m:e>${mr('y')}</m:e></m:d></m:oMath>`),
    para(`${run('Kutipan ')}<w:del><w:r><w:delText>dihapus</w:delText></w:r></w:del>${run('akhir')}`),
  ].join(''));
  for (const simpanSaja of [false, true]) {
    const ps = bacaDocx(buatZip({ 'word/document.xml': xml }, simpanSaja));
    assert.deepEqual(ps.map((p) => p.teks), [
      'Soal: Nilai x',
      'x² dan H₂O',
      '(x+1)/2=√x',
      'aⁿ⁺¹',
      '(x|y)',
      'Kutipan akhir',
    ]);
  }
});

test('bacaDocx: jenis daftar dibaca dari numbering.xml (huruf / angka / butir)', () => {
  const numbering = `<?xml version="1.0"?><w:numbering ${NS}>
    <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="upperLetter"/></w:lvl></w:abstractNum>
    <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
    <w:abstractNum w:abstractNumId="2"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
    <w:num w:numId="5"><w:abstractNumId w:val="0"/></w:num>
    <w:num w:numId="6"><w:abstractNumId w:val="1"/></w:num>
    <w:num w:numId="7"><w:abstractNumId w:val="2"/></w:num></w:numbering>`;
  const np = (id) => `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${id}"/></w:numPr>`;
  const xml = dokumen([
    para(run('huruf'), np(5)), para(run('angka'), np(6)), para(run('butir'), np(7)), para(run('biasa')),
  ].join(''));
  const ps = bacaDocx(buatZip({ 'word/document.xml': xml, 'word/numbering.xml': numbering }));
  assert.deepEqual(ps.map((p) => p.daftar && p.daftar.jenis), ['huruf', 'angka', 'butir', null]);
});

const GAMBAR_XML = (id) => `<w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="${id}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
const RELASI = (peta) => `<?xml version="1.0"?><Relationships>${Object.entries(peta).map(([id, t]) => `<Relationship Id="${id}" Type="x/image" Target="${t}"/>`).join('')}<Relationship Id="rIdLuar" Type="x/image" Target="https://contoh.com/a.png" TargetMode="External"/></Relationships>`;

test('bacaDocxLengkap: gambar dipetakan lewat relasi ke isi file di word/media; Choice/Fallback tidak dobel', () => {
  const xml = dokumen([
    para(GAMBAR_XML('rId5')),
    para(`<w:r><mc:AlternateContent><mc:Choice>${GAMBAR_XML('rId6')}</mc:Choice><mc:Fallback><w:pict><v:imagedata r:id="rId7"/></w:pict></mc:Fallback></mc:AlternateContent></w:r>`),
    para(GAMBAR_XML('rIdLuar')),
    para(`<w:r><w:object><v:imagedata r:id="rId8"/></w:object></w:r>`),
    teksSaja('tanpa gambar'),
  ].join(''));
  const { paragraf, media } = bacaDocxLengkap(buatZip({
    'word/document.xml': xml,
    'word/_rels/document.xml.rels': RELASI({ rId5: 'media/image1.png', rId6: 'media/image2.jpg', rId7: 'media/image3.png', rId8: 'media/image4.emf' }),
    'word/media/image1.png': 'AAA', 'word/media/image2.jpg': 'BBBB', 'word/media/image4.emf': 'E',
  }));
  assert.deepEqual(paragraf.map((p) => p.gambar), [
    ['word/media/image1.png'], ['word/media/image2.jpg'], ['?rIdLuar'], ['word/media/image4.emf'], [],
  ]);
  assert.equal(media.get('word/media/image2.jpg').toString(), 'BBBB');
  assert.equal(media.size, 3);
});

test('docxKeBaris memeriksa gambar: emf, format tak dikenal, terlalu besar, hilang, ukuran peringatan', () => {
  const kepala = ['Tes: SNBT', 'Subtes: PM', 'Topik: T', 'Subtopik: S', 'Level: 1'].map(teksSaja).join('');
  const soalDenganGambar = (id, no) => `${teksSaja(`Soal: s${no}`)}${para(GAMBAR_XML(id))}${teksSaja('A. a')}${teksSaja('B. b')}${teksSaja('Kunci: A')}${teksSaja('---')}`;
  const xml = dokumen(kepala + [
    soalDenganGambar('r1', 1), soalDenganGambar('r2', 2), soalDenganGambar('r3', 3),
    soalDenganGambar('r4', 4), soalDenganGambar('rIdLuar', 5), soalDenganGambar('r6', 6),
  ].join(''));
  const besar = Buffer.alloc(2 * 1024 * 1024 + 1);
  const sedang = Buffer.alloc(600 * 1024);
  const w = docxKeBaris(buatZip({
    'word/document.xml': xml,
    'word/_rels/document.xml.rels': RELASI({ r1: 'media/a.emf', r2: 'media/b.bmp', r3: 'media/c.png', r4: 'media/d.png', r6: 'media/e.png' }),
    'word/media/a.emf': 'x', 'word/media/b.bmp': 'x', 'word/media/c.png': besar, 'word/media/d.png': 'kecil', 'word/media/e.png': sedang,
  }));
  const pesan = (no) => w.galat.filter((g) => g.baris === no).map((g) => g.pesan).join(' | ');
  assert.match(pesan(1), /EMF/);
  assert.match(pesan(2), /\.bmp/);
  assert.match(pesan(3), /terlalu besar/);
  assert.equal(pesan(4), '');
  assert.match(pesan(5), /tidak ditemukan/);
  assert.equal(pesan(6), '');
  assert.ok(w.peringatan.some((x) => /Soal ke-6.*dikompres/.test(x)));
  assert.equal(w.media.size, 5);
});

test('bacaDocx: berkas yang bukan docx ditolak dengan pesan jelas', () => {
  assert.throws(() => bacaDocx(Buffer.from('ini bukan zip sama sekali, hanya teks biasa')), /bukan dokumen Word/);
  assert.throws(() => bacaDocx(buatZip({ 'lain.txt': 'x' })), /word\/document\.xml/);
});

test('docxKeBaris ujung ke ujung: daftar huruf otomatis + persamaan lolos validasi', () => {
  const numbering = `<?xml version="1.0"?><w:numbering ${NS}>
    <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="upperLetter"/></w:lvl></w:abstractNum>
    <w:num w:numId="3"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
  const np = `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>`;
  const xml = dokumen([
    teksSaja('Tes: SNBT'), teksSaja('Subtes: PM'), teksSaja('Topik: Aljabar dan Fungsi'),
    teksSaja('Subtopik: Persamaan kuadrat'), teksSaja('Level: 1'),
    para(`${run('Soal: Akar-akar ')}<m:oMath>${mr('x')}</m:oMath>${run('2', '<w:vertAlign w:val="superscript"/>')}${run(' − 9 = 0 adalah ...')}`),
    para(run('3 saja'), np), para(run('3 dan −3'), np), para(run('9 dan −9'), np),
    teksSaja('Kunci: B'), teksSaja('Pembahasan: x² = 9.'),
  ].join(''));
  const w = docxKeBaris(buatZip({ 'word/document.xml': xml, 'word/numbering.xml': numbering }));
  assert.deepEqual(w.galat, []);
  assert.equal(w.baris[0].soal, 'Akar-akar x² − 9 = 0 adalah ...');
  const v = validasi({ kolom: w.kolom, baris: w.baris });
  assert.deepEqual(v.galat, []);
  assert.deepEqual(v.soal[0].opsi.map((o) => o.kode), ['A', 'B', 'C']);
  assert.equal(v.soal[0].kunci, 'B');
});

// ---- CSV keluaran ------------------------------------------------------------------------------

test('keCsv bisa dibaca kembali oleh parseCsv (titik koma, kutip, baris baru, BOM)', () => {
  const r = parseSoalWord(P(
    'Tes: SNBT', 'Subtes: PU', 'Topik: T', 'Subtopik: S', 'Level: 1',
    'Soal: Ada; titik koma dan "kutip"', 'dan baris baru', 'A. a', 'B. b', 'Kunci: A', 'Pembahasan: ok',
  ));
  const csv = keCsv(r.kolom, r.baris);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const kembali = parseCsv(csv);
  assert.equal(kembali.baris.length, 1);
  assert.equal(kembali.baris[0].soal, 'Ada; titik koma dan "kutip"\ndan baris baru');
  assert.deepEqual(validasi(kembali).galat, []);
});
