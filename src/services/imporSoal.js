'use strict';

/**
 * Impor bank soal dari CSV (diekspor dari Excel / Google Sheets). Bagian murni: membaca CSV dan memeriksa
 * baris. Penulisan ke database ada di scripts/impor-soal.js.
 */

const { waktuSoal } = require('../config/waktu');

const KOLOM_WAJIB = ['tes', 'subtes', 'topik', 'subtopik', 'level', 'soal', 'opsi_a', 'opsi_b', 'kunci'];
const HURUF_OPSI = ['A', 'B', 'C', 'D', 'E'];
const POIN_BAWAAN = 10;

/** Baca CSV (RFC 4180: tanda kutip, koma/titik koma/tab di dalam kutip, baris baru di dalam kutip). */
function parseCsv(teks) {
  let s = String(teks).replace(/^﻿/, ''); // buang BOM
  // Pemisah ditebak dari baris pertama: Excel berbahasa Indonesia memakai titik koma.
  const baris1 = s.split(/\r?\n/, 1)[0];
  const hitung = (c) => (baris1.match(new RegExp(`\\${c}`, 'g')) || []).length;
  const pemisah = [',', ';', '\t'].map((c) => [c, hitung(c)]).sort((a, b) => b[1] - a[1])[0][0];

  const rows = [];
  let row = [];
  let sel = '';
  let kutip = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (kutip) {
      if (c === '"' && s[i + 1] === '"') { sel += '"'; i += 1; }
      else if (c === '"') kutip = false;
      else sel += c;
    } else if (c === '"') kutip = true;
    else if (c === pemisah) { row.push(sel); sel = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(sel); sel = '';
      rows.push(row); row = [];
    } else sel += c;
  }
  if (sel !== '' || row.length) { row.push(sel); rows.push(row); }

  const tidakKosong = rows.filter((r) => r.some((x) => x.trim() !== ''));
  if (!tidakKosong.length) return { kolom: [], baris: [] };
  const kolom = tidakKosong[0].map((h) => h.trim().toLowerCase());
  const baris = tidakKosong.slice(1).map((r, i) => {
    const o = { _nomor: i + 2 }; // nomor baris di spreadsheet (header = baris 1)
    kolom.forEach((k, j) => { o[k] = (r[j] ?? '').trim(); });
    return o;
  });
  return { kolom, baris };
}

const ya = (v) => ['ya', 'y', 'yes', 'true', '1'].includes(String(v).trim().toLowerCase());
const tidak = (v) => ['', 'tidak', 'n', 'no', 'false', '0'].includes(String(v).trim().toLowerCase());

/**
 * Periksa dan normalkan semua baris. Mengembalikan { soal: [...], galat: [{baris, pesan}] }.
 * Aturan ikatan subtopik: semua level boleh 1 subtopik atau lebih (dalam topik yang sama); minimal 1.
 */
function validasi({ kolom, baris }) {
  const galat = [];
  const hilang = KOLOM_WAJIB.filter((k) => !kolom.includes(k));
  if (hilang.length) {
    return { soal: [], galat: [{ baris: 1, pesan: `Kolom wajib tidak ada: ${hilang.join(', ')}` }] };
  }

  const soal = [];
  for (const r of baris) {
    const salah = (pesan) => galat.push({ baris: r._nomor, pesan });
    const n0 = galat.length;

    const level = Number(r.level);
    const levelSah = Number.isInteger(level) && level >= 1 && level <= 4;
    if (!levelSah) salah(`level harus 1-4 (isi: "${r.level}")`);
    for (const k of ['tes', 'subtes', 'topik', 'soal']) if (!r[k]) salah(`kolom ${k} kosong`);

    const subtopik = [...new Set(r.subtopik.split('|').map((x) => x.trim()).filter(Boolean))];
    if (!subtopik.length) salah('subtopik kosong (pisahkan beberapa subtopik dengan tanda |)');

    const opsi = [];
    HURUF_OPSI.forEach((h) => {
      const teks = r[`opsi_${h.toLowerCase()}`];
      if (teks) opsi.push({ kode: h, teks });
    });
    if (opsi.length < 2) salah('minimal opsi A dan B harus diisi');
    HURUF_OPSI.slice(0, opsi.length).forEach((h, i) => {
      if (opsi[i] && opsi[i].kode !== h) salah(`opsi harus berurutan tanpa celah (opsi ${h} kosong)`);
    });
    const kunci = r.kunci.toUpperCase();
    if (!opsi.some((o) => o.kode === kunci)) salah(`kunci "${r.kunci}" tidak cocok dengan opsi yang ada`);

    let waktu = null;
    if (r.waktu_detik) {
      waktu = Number(r.waktu_detik);
      if (!Number.isInteger(waktu) || waktu < 5 || waktu > 3600) salah('waktu_detik harus bilangan bulat 5-3600');
    } else if (levelSah) {
      waktu = waktuSoal(r.subtes, level);
    }

    let poin = POIN_BAWAAN;
    if (r.poin) {
      poin = Number(r.poin);
      if (!Number.isInteger(poin) || poin < 1 || poin > 1000) salah('poin harus bilangan bulat 1-1000');
    }
    if (!(ya(r.domain0) || tidak(r.domain0 || ''))) salah('domain0 harus ya atau tidak');
    const bdTopik = r.butuh_domain0_topik;
    if (bdTopik && !(ya(bdTopik) || tidak(bdTopik))) salah('butuh_domain0_topik harus ya atau tidak');

    if (galat.length === n0) {
      soal.push({
        baris: r._nomor,
        tes: r.tes.toUpperCase(),
        subtes: r.subtes.toUpperCase(),
        topik: r.topik,
        subtopik,
        level,
        teks: r.soal,
        opsi,
        kunci,
        waktu,
        poin,
        domain0: ya(r.domain0),
        // hanya dipakai bila topiknya baru dibuat; kosong = ikut aturan bawaan (matematika: ya)
        topikButuhDomain0: bdTopik ? ya(bdTopik) : null,
        gambarUrl: r.gambar_url || null,
        pembahasan: r.pembahasan || null,
        pembahasanGambarUrl: r.pembahasan_gambar_url || null,
        // hanya dari impor Word: nama berkas gambar tertanam (diunggah saat --tulis); alamat yang diketik didahulukan
        gambarBerkas: r.gambar_url ? null : (r._gambarSoal || null),
        pembahasanGambarBerkas: r.pembahasan_gambar_url ? null : (r._gambarPembahasan || null),
      });
    }
  }
  return { soal, galat };
}

// Subtes matematika (PK, PM) bawaannya butuh Domain 0, sesuai PRD.
const SUBTES_MATEMATIKA = new Set(['PK', 'PM']);
const topikButuhDomain0 = (s) => (s.topikButuhDomain0 !== null ? s.topikButuhDomain0 : SUBTES_MATEMATIKA.has(s.subtes));

module.exports = { parseCsv, validasi, topikButuhDomain0, KOLOM_WAJIB, POIN_BAWAAN };
