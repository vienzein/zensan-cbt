'use strict';

/**
 * Impor bank soal dari dokumen Word (.docx). Bagian murni (tanpa database, tanpa paket tambahan):
 *   1. bacaDocx   : membuka .docx (arsip zip) dan mengambil teks tiap paragraf, termasuk
 *                   pangkat/indeks (x²), persamaan Word (pecahan, akar, dst.) dan daftar bernomor/berhuruf;
 *   2. parseSoalWord : membaca pola label ("Soal:", "A.", "Kunci:", ...) menjadi baris yang sama
 *                   bentuknya dengan hasil parseCsv, sehingga diperiksa oleh validasi() yang sama.
 *
 * Format dokumen: lihat seed/PETUNJUK-IMPOR-WORD.md dan seed/templat-soal.docx.
 */

const zlib = require('node:zlib');

// ---------------------------------------------------------------------------------------------
// 1a. Arsip zip (cukup untuk .docx: metode simpan/deflate, tanpa zip64)
// ---------------------------------------------------------------------------------------------

function bacaZip(buf, perlu) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Berkas ini bukan dokumen Word (.docx) yang valid. Simpan ulang lewat Word: Berkas > Simpan Sebagai > Dokumen Word (*.docx).');

  const jumlah = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const hasil = {};
  for (let i = 0; i < jumlah; i += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Daftar isi arsip .docx rusak.');
    const metode = buf.readUInt16LE(p + 10);
    const ukuran = buf.readUInt32LE(p + 20);
    const nLen = buf.readUInt16LE(p + 28);
    const eLen = buf.readUInt16LE(p + 30);
    const cLen = buf.readUInt16LE(p + 32);
    const lokal = buf.readUInt32LE(p + 42);
    const nama = buf.toString('utf8', p + 46, p + 46 + nLen);
    p += 46 + nLen + eLen + cLen;
    if (!perlu.includes(nama)) continue;

    const lnLen = buf.readUInt16LE(lokal + 26);
    const leLen = buf.readUInt16LE(lokal + 28);
    const mulai = lokal + 30 + lnLen + leLen;
    const data = buf.subarray(mulai, mulai + ukuran);
    if (metode === 0) hasil[nama] = data;
    else if (metode === 8) hasil[nama] = zlib.inflateRawSync(data);
    else throw new Error(`Metode kompresi zip ${metode} tidak didukung.`);
  }
  return hasil;
}

// ---------------------------------------------------------------------------------------------
// 1b. XML kecil (pohon sederhana)
// ---------------------------------------------------------------------------------------------

function dekode(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, k) => {
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'amp') return '&';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const kode = k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return String.fromCodePoint(kode);
  });
}

function parseXml(xml) {
  const akar = { tag: '#akar', attrs: {}, anak: [] };
  const tumpuk = [akar];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const [, cdata, tutup, tag, atribut, mandiri, teks] = m;
    const atas = tumpuk[tumpuk.length - 1];
    if (cdata !== undefined) atas.anak.push({ tag: '#teks', teks: cdata });
    else if (teks !== undefined) atas.anak.push({ tag: '#teks', teks: dekode(teks) });
    else if (tag) {
      if (tutup) {
        if (tumpuk.length > 1) tumpuk.pop();
      } else {
        const attrs = {};
        const rea = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        let a;
        while ((a = rea.exec(atribut)) !== null) attrs[a[1]] = dekode(a[2] ?? a[3]);
        const node = { tag, attrs, anak: [] };
        atas.anak.push(node);
        if (!mandiri) tumpuk.push(node);
      }
    }
  }
  return akar;
}

const anak = (n, tag) => (n ? n.anak.find((c) => c.tag === tag) : undefined);
const semua = (n, tag) => (n ? n.anak.filter((c) => c.tag === tag) : []);
const ambilTeks = (n) => n.anak.filter((c) => c.tag === '#teks').map((c) => c.teks).join('');
const punyaTag = (n, tag) => n.tag === tag || (n.anak || []).some((c) => punyaTag(c, tag));

// ---------------------------------------------------------------------------------------------
// 1c. Pangkat / indeks -> karakter Unicode bila bisa, kalau tidak ^(...) atau _(...)
// ---------------------------------------------------------------------------------------------

const NAIK = {
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
  '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ',
};
const TURUN = {
  0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
  '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
};

function ubah(s, peta, penanda) {
  if (!s) return '';
  const huruf = [...s];
  if (huruf.every((c) => peta[c] !== undefined)) return huruf.map((c) => peta[c]).join('');
  return huruf.length === 1 ? `${penanda}${s}` : `${penanda}(${s})`;
}
const naik = (s) => ubah(s, NAIK, '^');
const turun = (s) => ubah(s, TURUN, '_');

// ---------------------------------------------------------------------------------------------
// 1d. Persamaan Word (OMML) -> teks
// ---------------------------------------------------------------------------------------------

const sederhana = (s) => /^[-−]?[\p{L}\p{N}.]+$/u.test(s);
function terbungkus(s) {
  if (!(s.startsWith('(') && s.endsWith(')'))) return false;
  let dalam = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '(') dalam += 1;
    else if (s[i] === ')') { dalam -= 1; if (dalam === 0 && i < s.length - 1) return false; }
  }
  return dalam === 0;
}
const kurung = (s) => (sederhana(s) || terbungkus(s) ? s : `(${s})`);

function math(n) {
  const isi = (m) => (m ? m.anak.map(math).join('') : '');
  const bagian = (tag) => isi(anak(n, tag));
  switch (n.tag) {
    case '#teks': return '';
    case 'm:t': return ambilTeks(n);
    case 'm:r': return n.anak.filter((c) => c.tag === 'm:t').map(ambilTeks).join('');
    case 'm:f': return `${kurung(bagian('m:num'))}/${kurung(bagian('m:den'))}`;
    case 'm:sSup': return bagian('m:e') + naik(bagian('m:sup'));
    case 'm:sSub': return bagian('m:e') + turun(bagian('m:sub'));
    case 'm:sSubSup': return bagian('m:e') + turun(bagian('m:sub')) + naik(bagian('m:sup'));
    case 'm:rad': {
      const derajat = bagian('m:deg');
      const e = kurung(bagian('m:e'));
      if (!derajat || derajat === '2') return `√${e}`;
      if (derajat === '3') return `∛${e}`;
      if (derajat === '4') return `∜${e}`;
      return `${naik(derajat)}√${e}`;
    }
    case 'm:d': {
      const dpr = anak(n, 'm:dPr');
      const ambil = (tag, bawaan) => {
        const el = anak(dpr, tag);
        return el && el.attrs['m:val'] !== undefined ? el.attrs['m:val'] : bawaan;
      };
      const buka = ambil('m:begChr', '(');
      const tutup = ambil('m:endChr', ')');
      const pisah = ambil('m:sepChr', '|');
      return buka + semua(n, 'm:e').map(math).join(pisah) + tutup;
    }
    case 'm:nary': {
      const npr = anak(n, 'm:naryPr');
      const lambang = anak(npr, 'm:chr') ? anak(npr, 'm:chr').attrs['m:val'] : '∫';
      const bawah = bagian('m:sub');
      const atas = bagian('m:sup');
      return `${lambang}${bawah ? `_${kurung(bawah)}` : ''}${atas ? `^${kurung(atas)}` : ''} ${bagian('m:e')}`.trim();
    }
    case 'm:func': return `${bagian('m:fName')} ${bagian('m:e')}`.trim();
    case 'm:limLow': return `${bagian('m:e')}_${kurung(bagian('m:lim'))}`;
    case 'm:limUpp': return `${bagian('m:e')}^${kurung(bagian('m:lim'))}`;
    case 'm:eqArr': return semua(n, 'm:e').map(math).join('; ');
    case 'm:mr': return `[${semua(n, 'm:e').map(math).join(', ')}]`;
    case 'm:m': return semua(n, 'm:mr').map(math).join(' ');
    default:
      return n.anak.filter((c) => !c.tag.endsWith('Pr')).map(math).join('');
  }
}

// ---------------------------------------------------------------------------------------------
// 1e. Paragraf Word -> teks
// ---------------------------------------------------------------------------------------------

const KONTAINER_TEKS = new Set([
  'w:ins', 'w:moveTo', 'w:hyperlink', 'w:smartTag', 'w:sdt', 'w:sdtContent', 'w:fldSimple', 'w:customXml',
]);

function teksRun(r, ctx) {
  const rpr = anak(r, 'w:rPr');
  const va = anak(rpr, 'w:vertAlign');
  let s = '';
  for (const c of r.anak) {
    switch (c.tag) {
      case 'w:t': s += ambilTeks(c); break;
      case 'w:tab': s += ' '; break;
      case 'w:br': case 'w:cr': s += '\n'; break;
      case 'w:noBreakHyphen': s += '-'; break;
      case 'w:drawing': case 'w:pict': case 'w:object': ctx.gambar = true; break;
      case 'mc:AlternateContent': if (punyaTag(c, 'w:drawing') || punyaTag(c, 'w:pict')) ctx.gambar = true; break;
      default: break;
    }
  }
  const mode = va && va.attrs['w:val'];
  if (mode === 'superscript') return naik(s);
  if (mode === 'subscript') return turun(s);
  return s;
}

function teksNode(n, ctx) {
  if (n.tag === 'w:r') return teksRun(n, ctx);
  if (n.tag === 'm:oMath') return math(n);
  if (n.tag === 'm:oMathPara') return n.anak.map((c) => teksNode(c, ctx)).join('');
  if (KONTAINER_TEKS.has(n.tag)) return n.anak.map((c) => teksNode(c, ctx)).join('');
  return '';
}

function kumpulkanParagraf(n, hasil) {
  if (n.tag === 'w:p') { hasil.push(n); return; }
  (n.anak || []).forEach((c) => kumpulkanParagraf(c, hasil));
}

/** Peta (numId, ilvl) -> format nomor ("upperLetter", "decimal", "bullet", ...). */
function petaPenomoran(xml) {
  const abstrak = new Map();
  const nomor = new Map();
  const cari = (n) => {
    if (n.tag === 'w:abstractNum') {
      const lvl = new Map();
      semua(n, 'w:lvl').forEach((l) => {
        const f = anak(l, 'w:numFmt');
        lvl.set(l.attrs['w:ilvl'], f ? f.attrs['w:val'] : null);
      });
      abstrak.set(n.attrs['w:abstractNumId'], lvl);
    } else if (n.tag === 'w:num') {
      const a = anak(n, 'w:abstractNumId');
      if (a) nomor.set(n.attrs['w:numId'], a.attrs['w:val']);
    }
    (n.anak || []).forEach(cari);
  };
  cari(xml);
  return (numId, ilvl) => {
    const lvl = abstrak.get(nomor.get(numId));
    return lvl ? lvl.get(ilvl) ?? null : null;
  };
}

/**
 * Membuka .docx dan mengembalikan daftar paragraf berurutan:
 *   { teks, gambar: ada gambar?, daftar: null | { jenis: 'huruf'|'angka'|'butir', kunci } }
 */
function bacaDocx(buf) {
  const berkas = bacaZip(buf, ['word/document.xml', 'word/numbering.xml']);
  if (!berkas['word/document.xml']) throw new Error('Isi dokumen Word tidak ditemukan (word/document.xml).');
  const dokumen = parseXml(berkas['word/document.xml'].toString('utf8'));
  const formatNomor = berkas['word/numbering.xml']
    ? petaPenomoran(parseXml(berkas['word/numbering.xml'].toString('utf8')))
    : () => null;

  const paragraf = [];
  kumpulkanParagraf(dokumen, paragraf);
  return paragraf.map((p) => {
    const ctx = { gambar: false };
    const teks = p.anak.map((c) => teksNode(c, ctx)).join('');

    let daftar = null;
    const np = anak(anak(p, 'w:pPr'), 'w:numPr');
    const numId = np && anak(np, 'w:numId') ? anak(np, 'w:numId').attrs['w:val'] : null;
    if (numId && numId !== '0') {
      const ilvl = (anak(np, 'w:ilvl') && anak(np, 'w:ilvl').attrs['w:val']) || '0';
      const fmt = formatNomor(numId, ilvl);
      if (fmt !== 'none') {
        let jenis = 'angka';
        if (fmt === 'upperLetter' || fmt === 'lowerLetter') jenis = 'huruf';
        else if (fmt === 'bullet') jenis = 'butir';
        daftar = { jenis, kunci: `${numId}:${ilvl}` };
      }
    }
    return { teks, gambar: ctx.gambar, daftar };
  });
}

// ---------------------------------------------------------------------------------------------
// 2. Pola label -> baris soal
// ---------------------------------------------------------------------------------------------

const KOLOM_CSV = [
  'tes', 'subtes', 'topik', 'subtopik', 'level', 'soal',
  'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'opsi_e',
  'kunci', 'waktu_detik', 'poin', 'domain0', 'butuh_domain0_topik',
  'gambar_url', 'pembahasan', 'pembahasan_gambar_url',
];

const LABEL = {
  tes: 'tes',
  subtes: 'subtes',
  topik: 'topik',
  subtopik: 'subtopik',
  level: 'level',
  soal: 'soal',
  kunci: 'kunci',
  jawaban: 'kunci',
  pembahasan: 'pembahasan',
  waktu: 'waktu_detik',
  poin: 'poin',
  domain0: 'domain0',
  butuh_domain0_topik: 'butuh_domain0_topik',
  gambar: 'gambar_url',
  pembahasan_gambar: 'pembahasan_gambar_url',
};

// Diisi dari soal sebelumnya bila dikosongkan, supaya satu topik tidak perlu mengulang 5 baris yang sama.
const WARISAN = ['tes', 'subtes', 'topik', 'subtopik', 'level'];
const HURUF = ['A', 'B', 'C', 'D', 'E'];

const POLA_PEMISAH = /^[-–—=_*~]{3,}$/;
const POLA_LABEL = /^([A-Za-z0-9_ ]{2,30}?)\s*[:：]\s*([\s\S]*)$/;
const POLA_OPSI = /^\(?([A-Ea-e])[.)]\s*([\s\S]*)$/;

const ringkas = (s, n = 50) => {
  const rata = String(s).replace(/\s+/g, ' ').trim();
  return rata.length > n ? `${rata.slice(0, n)}…` : rata;
};

function rapikan(kolom, nilai) {
  const v = nilai.trim();
  if (kolom === 'kunci') {
    const m = v.match(/^\(?([A-Ea-e])\)?[.)]?$/);
    return m ? m[1].toUpperCase() : v;
  }
  if (kolom === 'level') {
    const m = v.match(/^(?:level|l)?\s*([1-4])\s*[.,;]?$/i);
    return m ? m[1] : v;
  }
  if (kolom === 'waktu_detik') return v.replace(/\s*(detik|dtk|s)\.?$/i, '').replace(/[.,;]+$/, '');
  if (kolom === 'poin') return v.replace(/\s*(poin|pts?)\.?$/i, '').replace(/[.,;]+$/, '');
  return v;
}

function parseSoalWord(paragraf) {
  const baris = [];
  const galat = [];
  const peringatan = [];
  const terakhir = {};
  let nomor = 0;

  const bersih = () => ({
    nilai: {}, aktif: null, opsiN: 0, hitung: {}, catatan: [], adaLabel: false, galat: [], gambar: false,
  });
  let blok = bersih();

  const tambah = (kolom, teks) => {
    const lama = blok.nilai[kolom];
    if (lama === undefined || lama === '') blok.nilai[kolom] = teks;
    else blok.nilai[kolom] = lama + (kolom.startsWith('opsi_') ? ' ' : '\n') + teks;
  };

  const mulaiKolom = (kolom, teks) => {
    if (blok.nilai[kolom] !== undefined) {
      blok.galat.push(`label "${kolom}" muncul dua kali dalam satu soal (mungkin garis pemisah --- terlewat)`);
    }
    blok.nilai[kolom] = teks;
    blok.aktif = kolom;
    blok.adaLabel = true;
  };

  const mulaiOpsi = (huruf, teks) => {
    mulaiKolom(`opsi_${huruf.toLowerCase()}`, teks);
    blok.opsiN += 1;
  };

  const tutupBlok = () => {
    if (!blok.adaLabel) {
      if (blok.catatan.length) peringatan.push(`Teks tanpa label diabaikan: "${ringkas(blok.catatan.join(' '))}"`);
      blok = bersih();
      return;
    }
    nomor += 1;
    const n = blok.nilai;
    WARISAN.forEach((k) => { if (n[k] === undefined && terakhir[k] !== undefined) n[k] = terakhir[k]; });

    const baru = { _nomor: nomor, _cuplikan: ringkas(n.soal || '') };
    KOLOM_CSV.forEach((k) => { baru[k] = rapikan(k, n[k] ?? ''); });
    baris.push(baru);
    WARISAN.forEach((k) => { if (n[k]) terakhir[k] = n[k]; });

    blok.galat.forEach((pesan) => galat.push({ baris: nomor, pesan }));
    if (blok.gambar) {
      peringatan.push(`Soal ke-${nomor}: ada gambar di dokumen, tetapi gambar tidak ikut terbaca. Unggah gambarnya terpisah dan isi baris "Gambar:" dengan alamatnya.`);
    }
    blok = bersih();
  };

  for (const p of paragraf) {
    const teks = p.teks.replace(/\u00a0/g, ' ').trim();
    if (p.gambar) blok.gambar = true;
    if (!teks) continue;

    if (POLA_PEMISAH.test(teks)) { tutupBlok(); continue; }

    const dalamSoalAtauOpsi = blok.aktif === 'soal' || (blok.aktif && blok.aktif.startsWith('opsi_'));

    if (p.daftar) {
      const d = p.daftar;
      if (d.jenis === 'huruf' && dalamSoalAtauOpsi && blok.opsiN < 5) { mulaiOpsi(HURUF[blok.opsiN], teks); continue; }
      let isi = teks;
      if (d.jenis === 'angka') {
        blok.hitung[d.kunci] = (blok.hitung[d.kunci] || 0) + 1;
        isi = `${blok.hitung[d.kunci]}. ${teks}`;
      } else if (d.jenis === 'butir') isi = `• ${teks}`;
      if (blok.aktif) tambah(blok.aktif, isi); else blok.catatan.push(isi);
      continue;
    }

    const lb = teks.match(POLA_LABEL);
    if (lb) {
      const kolom = LABEL[lb[1].trim().toLowerCase().replace(/\s+/g, '_')];
      if (kolom) { mulaiKolom(kolom, lb[2]); continue; }
    }

    if (dalamSoalAtauOpsi && blok.opsiN < 5) {
      const op = teks.match(POLA_OPSI);
      if (op) {
        const idx = HURUF.indexOf(op[1].toUpperCase());
        if (idx === blok.opsiN) { mulaiOpsi(HURUF[idx], op[2]); continue; }
        if (idx > blok.opsiN && blok.opsiN > 0) {
          blok.galat.push(`opsi tidak berurutan: ditemukan ${HURUF[idx]} padahal yang diharapkan ${HURUF[blok.opsiN]}`);
        }
      }
    }

    if (blok.aktif) tambah(blok.aktif, teks); else blok.catatan.push(teks);
  }
  tutupBlok();

  return { kolom: KOLOM_CSV, baris, galat, peringatan };
}

/** Pembungkus: buffer .docx -> { kolom, baris, galat, peringatan } siap diberikan ke validasi(). */
function docxKeBaris(buf) {
  return parseSoalWord(bacaDocx(buf));
}

// ---------------------------------------------------------------------------------------------
// 3. Tulis CSV (titik koma, BOM) supaya hasil bacaan bisa dibuka dan ditinjau di Excel / Google Sheets
// ---------------------------------------------------------------------------------------------

function keCsv(kolom, baris) {
  const sel = (v) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const isi = [kolom.join(';'), ...baris.map((r) => kolom.map((k) => sel(r[k])).join(';'))];
  return `\ufeff${isi.join('\r\n')}\r\n`;
}

module.exports = { bacaDocx, parseSoalWord, docxKeBaris, keCsv, KOLOM_CSV, bacaZip, parseXml };
