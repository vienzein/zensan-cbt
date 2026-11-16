'use strict';

/**
 * Membaca tabel stage tes diagnostik Domain 0 (berkas markdown seperti seed/stage-diagnostik-d0.md).
 * Bagian murni: tanpa database. Penulisan ke database ada di scripts/impor-stage.js.
 *
 * Bentuk berkas: judul topik "## D0-01 Bilangan Bulat dan Operasi Hitung", lalu tabel dengan kolom
 *   Kode stage | Indikator | Level | Isi stage | Soal | Target/soal | Batas stage
 * Target ditulis "20 dtk"; batas ditulis "1:20" (menit:detik). Aturan berkas: batas = 4 x target.
 */

const POLA_KODE = /^(D0-\d{2})(?:-\d{2}\.S\d+|\.G)$/;
const POLA_TOPIK = /^##\s+(D0-\d{2})\s+(.+?)\s*$/;

const sel = (baris) => baris.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((x) => x.trim());
const adalahPemisah = (baris) => /^\s*\|?\s*:?-{2,}/.test(baris);

function detik(teks) {
  const m = String(teks).trim().match(/^(\d+)\s*(?:dtk|detik|s)?$/i);
  return m ? Number(m[1]) : null;
}

function menitDetik(teks) {
  const m = String(teks).trim().match(/^(\d+):([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function parseStageD0(teks) {
  const galat = [];
  const peringatan = [];
  const stages = [];
  const topik = [];
  const kodeDipakai = new Set();

  let topikSaatIni = null;
  let kolom = null; // peta nama kolom -> indeks, dibaca dari baris judul tabel
  let urutan = 0;

  String(teks).split(/\r?\n/).forEach((baris, i) => {
    const no = i + 1;
    const t = baris.match(POLA_TOPIK);
    if (t) {
      topikSaatIni = { kode: t[1], nama: t[2] };
      if (topik.some((x) => x.kode === t[1])) galat.push({ baris: no, pesan: `topik ${t[1]} muncul dua kali` });
      else topik.push(topikSaatIni);
      kolom = null;
      return;
    }
    if (!baris.trim().startsWith('|')) return;
    if (adalahPemisah(baris)) return;

    const s = sel(baris);
    if (/^kode stage$/i.test(s[0])) {
      kolom = {};
      s.forEach((h, j) => { kolom[h.toLowerCase()] = j; });
      const perlu = ['kode stage', 'indikator', 'level', 'isi stage', 'soal', 'target/soal', 'batas stage'];
      const hilang = perlu.filter((k) => !(k in kolom));
      if (hilang.length) galat.push({ baris: no, pesan: `kolom tabel tidak ada: ${hilang.join(', ')}` });
      return;
    }
    if (!kolom) return;

    const ambil = (k) => s[kolom[k]] ?? '';
    const kode = ambil('kode stage');
    const salah = (pesan) => galat.push({ baris: no, pesan: `${kode || 'baris'}: ${pesan}` });

    const mk = kode.match(POLA_KODE);
    if (!mk) { salah('kode stage tidak dikenali (contoh: D0-01-01.S1 atau D0-01.G)'); return; }
    if (!topikSaatIni) { salah('baris stage muncul sebelum judul topik'); return; }
    if (mk[1] !== topikSaatIni.kode) salah(`kode berawalan ${mk[1]} tetapi berada di bawah topik ${topikSaatIni.kode}`);
    if (kodeDipakai.has(kode)) { salah('kode stage muncul dua kali'); return; }
    kodeDipakai.add(kode);

    const lv = ambil('level').match(/^L([1-4])$/i);
    if (!lv) salah(`level harus L1 sampai L4 (isi: "${ambil('level')}")`);
    const jumlah = Number(ambil('soal'));
    if (!Number.isInteger(jumlah) || jumlah < 1 || jumlah > 20) salah(`jumlah soal tidak valid ("${ambil('soal')}")`);
    const target = detik(ambil('target/soal'));
    if (target === null) salah(`target/soal tidak terbaca ("${ambil('target/soal')}"; contoh: 20 dtk)`);
    const batas = menitDetik(ambil('batas stage'));
    if (batas === null) salah(`batas stage tidak terbaca ("${ambil('batas stage')}"; contoh: 1:20)`);
    if (!ambil('indikator')) salah('indikator kosong');
    if (!ambil('isi stage')) salah('isi stage kosong');

    if (target !== null && batas !== null && batas !== 4 * target) {
      peringatan.push(`${kode}: batas ${ambil('batas stage')} tidak sama dengan 4 x target (${4 * target} detik)`);
    }

    urutan += 1;
    stages.push({
      kode,
      kodeTopik: mk[1],
      namaTopik: topikSaatIni.nama,
      indikator: ambil('indikator'),
      level: lv ? Number(lv[1]) : null,
      isi: ambil('isi stage'),
      jumlahSoal: jumlah,
      targetDetik: target,
      batasDetik: batas,
      urutan,
      gabungan: kode.endsWith('.G'),
      baris: no,
    });
  });

  if (!stages.length && !galat.length) galat.push({ baris: 0, pesan: 'tidak ada baris stage terbaca' });
  for (const t of topik) {
    if (!stages.some((x) => x.kodeTopik === t.kode)) galat.push({ baris: 0, pesan: `topik ${t.kode} tidak punya stage` });
  }
  return { stages, topik, galat, peringatan };
}

/** Nama topik/subtopik tersembunyi yang dipakai menyimpan soal stage (supaya tidak bentrok dengan silabus). */
const namaTopikTersembunyi = (s) => `${s.kodeTopik} ${s.namaTopik}`;
const namaSubtopikTersembunyi = (s) => s.indikator;

module.exports = { parseStageD0, namaTopikTersembunyi, namaSubtopikTersembunyi, detik, menitDetik };
