'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hitungStreak, hitungLencana, rekomendasi, rata } = require('../src/services/profil');
const { profilSiswa } = require('../src/services/profilService');

test('streak: berturut-turut, boleh hidup bila hari ini belum berlatih, putus bila kemarin kosong', () => {
  assert.deepEqual(hitungStreak([], '2026-11-22'), { saat_ini: 0, terpanjang: 0, aktif_hari_ini: false });
  assert.deepEqual(hitungStreak(['2026-11-20', '2026-11-21', '2026-11-22'], '2026-11-22'), { saat_ini: 3, terpanjang: 3, aktif_hari_ini: true });
  assert.deepEqual(hitungStreak(['2026-11-20', '2026-11-21'], '2026-11-22'), { saat_ini: 2, terpanjang: 2, aktif_hari_ini: false });
  assert.deepEqual(hitungStreak(['2026-11-19', '2026-11-20'], '2026-11-22'), { saat_ini: 0, terpanjang: 2, aktif_hari_ini: false });
  // duplikat, tidak urut, melintasi pergantian bulan dan tahun
  assert.deepEqual(hitungStreak(['2027-01-01', '2026-12-31', '2026-12-30', '2026-12-30', '2026-12-10'], '2027-01-01'), { saat_ini: 3, terpanjang: 3, aktif_hari_ini: true });
  // run lama lebih panjang dari streak sekarang
  assert.equal(hitungStreak(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-22'], '2026-11-22').terpanjang, 3);
});

test('lencana: aturan ambang', () => {
  const dasar = { jawaban: 0, akurasi: 0, sesi_selesai: 0, streak_terpanjang: 0, subtopik_level2: 0, subtopik_level3: 0 };
  assert.equal(hitungLencana(dasar).filter((l) => l.diraih).length, 0);
  const diraih = (m) => hitungLencana(m).filter((l) => l.diraih).map((l) => l.kode);
  assert.deepEqual(diraih({ ...dasar, sesi_selesai: 1 }), ['langkah_pertama']);
  assert.deepEqual(diraih({ ...dasar, streak_terpanjang: 7 }), ['streak_3', 'streak_7']);
  assert.ok(!diraih({ ...dasar, jawaban: 49, akurasi: 100 }).includes('akurasi_80'));
  assert.ok(diraih({ ...dasar, jawaban: 50, akurasi: 80 }).includes('akurasi_80'));
  assert.ok(diraih({ ...dasar, subtopik_level3: 1 }).includes('level_tiga'));
});

test('rekomendasi: yang lemah dulu, lalu belum dicoba; tanpa soal dilewati; maksimal n', () => {
  const b = (subtopik, o) => ({ subtes: 'PU', topik: 'T', subtopik, level: 1, rr: 0, dilatih: true, punya_soal: true, ...o });
  const r = rekomendasi([
    b('kuat', { level: 3, rr: 100 }),
    b('sedang', { rr: 50 }),
    b('lemah', { rr: 10 }),
    b('kosong', { rr: 0, punya_soal: false }),
    b('baru1', { dilatih: false }),
    b('baru2', { dilatih: false }),
  ], 3);
  assert.deepEqual(r.map((x) => x.subtopik), ['lemah', 'sedang', 'baru1']);
  assert.equal(r[0].alasan, 'Perlu diperkuat');
  assert.equal(r[2].alasan, 'Belum pernah dicoba');
  assert.equal(rekomendasi([], 3).length, 0);
  assert.equal(rata([10, 20]), 15);
  assert.equal(rata([]), 0);
});

test('profilSiswa: menyusun ringkasan, subtes, streak, dan grafik; 404 bila siswa tak ada', async () => {
  const jawab = (sql) => {
    if (/FROM students s/.test(sql)) {
      return { rows: [{ id: 'u', nama: 'Ani', email: 'a@b.id', created_at: 'x', tes_id: 1, tes_kode: 'SNBT', tes_nama: 'SNBT', lembaga: 'SMA 1', hari_ini: '2026-11-22' }] };
    }
    if (/count\(\*\)::int AS jawaban, \(count/.test(sql) && /FROM student_answer_history WHERE student_id/.test(sql)) return { rows: [{ jawaban: 100, benar: 80 }] };
    if (/SELECT DISTINCT/.test(sql)) return { rows: [{ hari: '2026-11-21' }, { hari: '2026-11-22' }] };
    if (/GROUP BY 1 ORDER BY 1/.test(sql)) return { rows: [{ hari: '2026-11-22', jawaban: 10, benar: 7, rr_delta: 12.34 }] };
    if (/FROM student_attempts a/.test(sql)) return { rows: [{ id: 'a1', mode: 'drill', status: 'selesai', started_at: 't', jumlah_soal: 10, jumlah_benar: 7, jumlah_salah: 3, total_rr_delta: '5', subtes: 'PU' }] };
    if (/FROM subjects sj/.test(sql)) {
      return { rows: [
        { subtes: 'PU', subtes_nama: 'Penalaran Umum', topik_id: 1, topik: 'Logika', subtopik_id: 1, subtopik: 'A', level: 2, rr: '40', dilatih: true, punya_soal: true },
        { subtes: 'PU', subtes_nama: 'Penalaran Umum', topik_id: 1, topik: 'Logika', subtopik_id: 2, subtopik: 'B', level: null, rr: null, dilatih: false, punya_soal: true },
      ] };
    }
    if (/status = 'selesai'/.test(sql)) return { rows: [{ n: 4 }] };
    return { rows: [] };
  };
  const p = await profilSiswa({ query: async (sql) => jawab(sql) }, 'u');
  assert.equal(p.ringkasan.akurasi, 80);
  assert.equal(p.ringkasan.hari_aktif, 2);
  assert.equal(p.ringkasan.subtopik_dilatih, 1);
  assert.equal(p.ringkasan.subtopik_total, 2);
  assert.equal(p.streak.saat_ini, 2);
  assert.equal(p.subtes[0].topik[0].subtopik.length, 2);
  assert.equal(p.subtes[0].rr_rata, 40);
  assert.equal(p.subtes[0].level_tertinggi, 2);
  assert.equal(p.grafik[0].akurasi, 70);
  assert.equal(p.grafik[0].rr_delta, 12.3);
  assert.equal(p.sesi[0].rr_delta, 5);
  assert.equal(p.rekomendasi[0].subtopik, 'A');
  assert.ok(p.lencana.find((l) => l.kode === 'langkah_pertama').diraih);
  const e = await profilSiswa({ query: async () => ({ rows: [] }) }, 'u').catch((x) => x);
  assert.equal(e.status, 404);
});
