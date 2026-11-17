'use strict';

/**
 * Membaca silabus (seed/silabus-snbt.json, atau tabel Markdown versi lama) menjadi daftar subtopik. Bagian murni; penulisan ke database
 * ada di scripts/impor-silabus.js.
 *
 * Bentuk berkas: judul "## KODE – Nama subtes", lalu tabel dengan kolom
 *   Kode | Topik | Sub Topik | Cakupan | Tingkat
 * Sel Topik yang kosong berarti sama dengan baris di atasnya.
 */

function parseSilabus(teks) {
  const baris = [];
  const galat = [];
  const daftarSubtes = [];
  let subtes = null;
  let topik = null;

  String(teks).split(/\r?\n/).forEach((garis, i) => {
    const nomor = i + 1;
    const judul = garis.match(/^##\s+([A-Za-z0-9]+)\s+[–—-]\s+(.+?)\s*$/);
    if (judul) {
      subtes = judul[1].toUpperCase();
      topik = null;
      if (!daftarSubtes.some((d) => d.kode === subtes)) daftarSubtes.push({ kode: subtes, nama: judul[2].trim() });
      return;
    }
    if (!garis.trim().startsWith('|')) return;

    const sel = garis.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((x) => x.trim());
    if (/^-+$/.test(sel[0].replace(/:/g, '')) || sel[0].toLowerCase() === 'kode') return; // pemisah / judul kolom
    if (!subtes) { galat.push({ baris: nomor, pesan: 'baris tabel muncul sebelum judul subtes (## KODE – Nama)' }); return; }
    if (sel.length < 3) { galat.push({ baris: nomor, pesan: 'baris tabel kurang kolom (butuh minimal Kode, Topik, Sub Topik)' }); return; }

    const [kode, topikSel, sub, cakupan = '', tingkat = ''] = sel;
    if (topikSel) topik = topikSel;
    if (!topik) { galat.push({ baris: nomor, pesan: `${kode}: topik kosong dan belum ada topik di baris sebelumnya` }); return; }
    if (!sub) { galat.push({ baris: nomor, pesan: `${kode}: sub topik kosong` }); return; }
    baris.push({ kode, subtes, topik, subtopik: sub, cakupan, tingkat });
  });

  // Nama harus unik per topik, dan topik unik per subtes, agar tidak membuat dobel di database.
  const lihat = new Set();
  baris.forEach((b) => {
    const k = `${b.subtes}|${b.topik}|${b.subtopik}`;
    if (lihat.has(k)) galat.push({ baris: 0, pesan: `sub topik ganda: ${b.subtes} / ${b.topik} / ${b.subtopik}` });
    lihat.add(k);
  });
  return { baris, galat, subtes: daftarSubtes };
}

/**
 * Membaca silabus berbentuk JSON: { subtes: [ { kode, nama, topik: [ { kode, nama, subTopik: [ { kode, nama, cakupan } ] } ] } ] }.
 * Hasilnya sama dengan parseSilabus (baris, galat, subtes) supaya skrip impor tidak perlu tahu bentuk berkasnya.
 */
function parseSilabusJson(teks) {
  const baris = [];
  const galat = [];
  const daftarSubtes = [];
  let data;
  try { data = JSON.parse(String(teks).replace(/^\uFEFF/, '')); } catch (e) {
    return { baris, galat: [{ baris: 0, pesan: `JSON tidak bisa dibaca: ${e.message}` }], subtes: daftarSubtes };
  }
  if (!data || !Array.isArray(data.subtes)) {
    return { baris, galat: [{ baris: 0, pesan: 'JSON harus berisi larik "subtes".' }], subtes: daftarSubtes };
  }
  const t = (v) => (v === undefined || v === null ? '' : String(v).trim());
  const kodeLihat = new Set();
  data.subtes.forEach((st, i) => {
    const kodeSubtes = t(st && st.kode).toUpperCase();
    if (!kodeSubtes) { galat.push({ baris: 0, pesan: `subtes ke-${i + 1}: kode kosong` }); return; }
    if (!t(st.nama)) galat.push({ baris: 0, pesan: `${kodeSubtes}: nama subtes kosong` });
    daftarSubtes.push({ kode: kodeSubtes, nama: t(st.nama) });
    (Array.isArray(st.topik) ? st.topik : []).forEach((tp) => {
      const namaTopik = t(tp && tp.nama);
      if (!namaTopik) { galat.push({ baris: 0, pesan: `${kodeSubtes}: ada topik tanpa nama` }); return; }
      (Array.isArray(tp.subTopik) ? tp.subTopik : []).forEach((sb) => {
        const kode = t(sb && sb.kode);
        const nama = t(sb && sb.nama);
        if (!kode) { galat.push({ baris: 0, pesan: `${kodeSubtes} / ${namaTopik}: ada subtopik tanpa kode` }); return; }
        if (!nama) { galat.push({ baris: 0, pesan: `${kode}: nama subtopik kosong` }); return; }
        if (kodeLihat.has(kode)) galat.push({ baris: 0, pesan: `kode ganda: ${kode}` });
        kodeLihat.add(kode);
        baris.push({ kode, subtes: kodeSubtes, topik: namaTopik, subtopik: nama, cakupan: t(sb.cakupan), tingkat: '' });
      });
    });
  });
  const lihat = new Set();
  baris.forEach((b) => {
    const k = `${b.subtes}|${b.topik}|${b.subtopik}`;
    if (lihat.has(k)) galat.push({ baris: 0, pesan: `sub topik ganda: ${b.subtes} / ${b.topik} / ${b.subtopik}` });
    lihat.add(k);
  });
  return { baris, galat, subtes: daftarSubtes };
}

/** Ringkasan per subtes -> topik -> jumlah subtopik, dan topik yang hanya punya 1 subtopik. */
function ringkasSilabus(baris) {
  const peta = new Map();
  baris.forEach((b) => {
    if (!peta.has(b.subtes)) peta.set(b.subtes, new Map());
    const t = peta.get(b.subtes);
    t.set(b.topik, (t.get(b.topik) || 0) + 1);
  });
  const tunggal = [];
  peta.forEach((t, subtes) => t.forEach((n, topik) => { if (n === 1) tunggal.push({ subtes, topik }); }));
  return { peta, tunggal };
}

module.exports = { parseSilabus, parseSilabusJson, ringkasSilabus };
