-- 011: peralihan ke silabus baru: 5 subtes (PU, KL, NUM, LBI, LBE) menggantikan 7 (PU, PPU, PBM, PK, LBI, LBE, PM).
--   PPU + PBM  -> KL  (Kemampuan Linguistik)   : subtes baru, dibuat oleh `npm run impor:silabus`
--   PK  + PM   -> NUM (Kemampuan Numerasi)     : baris subtes PM diganti nama jadi NUM supaya topik tersembunyi
--                                                stage Domain 0 (D0-xx) ikut dan tetap tersambung
-- Langkah (urutannya penting):
--   1. Jalankan berkas ini SEKALI di SQL Editor Supabase (satu transaksi; bila galat, tidak ada yang berubah).
--   2. npm run impor:silabus -- seed/silabus-snbt.json            (simulasi)
--      npm run impor:silabus -- seed/silabus-snbt.json --tulis    (menyimpan: KL, topik, dan subtopik baru)
--   3. Perbarui kode: git pull (gerbang Domain 0 kini memakai subtes NUM).
-- Topik dan subtopik lama TIDAK dihapus: namanya diberi awalan "[lama] " dan dinonaktifkan, sehingga riwayat
-- (mis. progres akun uji) tetap utuh dan nama silabus baru tidak bentrok dengan nama lama.
-- Topik tersembunyi stage Domain 0 (nama diawali "D0-") tidak disentuh.

BEGIN;

-- 1) Arsipkan subtopik lama (sebelum topiknya diganti nama, karena penyaringnya memakai nama topik)
UPDATE subtopics st
   SET nama = '[lama] ' || st.nama, is_active = false
  FROM topics t
  JOIN subjects s ON s.id = t.subject_id
  JOIN curriculum_groups cg ON cg.id = s.curriculum_group_id
 WHERE t.id = st.topic_id
   AND upper(cg.kode) = 'SNBT'
   AND t.nama NOT LIKE 'D0-%'
   AND t.nama NOT LIKE '[lama]%'
   AND st.nama NOT LIKE '[lama]%';

-- 2) Arsipkan topik lama
UPDATE topics t
   SET nama = '[lama] ' || t.nama, is_active = false
  FROM subjects s
  JOIN curriculum_groups cg ON cg.id = s.curriculum_group_id
 WHERE s.id = t.subject_id
   AND upper(cg.kode) = 'SNBT'
   AND t.nama NOT LIKE 'D0-%'
   AND t.nama NOT LIKE '[lama]%';

-- 3) Subtes: PM menjadi NUM; PK, PPU, PBM dinonaktifkan; urutan menyesuaikan silabus baru
UPDATE subjects s
   SET kode = 'NUM', nama = 'Kemampuan Numerasi', urutan = 3
  FROM curriculum_groups cg
 WHERE cg.id = s.curriculum_group_id AND upper(cg.kode) = 'SNBT' AND upper(s.kode) = 'PM';

UPDATE subjects s
   SET is_active = false
  FROM curriculum_groups cg
 WHERE cg.id = s.curriculum_group_id AND upper(cg.kode) = 'SNBT' AND upper(s.kode) IN ('PK', 'PPU', 'PBM');

UPDATE subjects s SET urutan = 1
  FROM curriculum_groups cg WHERE cg.id = s.curriculum_group_id AND upper(cg.kode) = 'SNBT' AND upper(s.kode) = 'PU';
UPDATE subjects s SET urutan = 4
  FROM curriculum_groups cg WHERE cg.id = s.curriculum_group_id AND upper(cg.kode) = 'SNBT' AND upper(s.kode) = 'LBI';
UPDATE subjects s SET urutan = 5
  FROM curriculum_groups cg WHERE cg.id = s.curriculum_group_id AND upper(cg.kode) = 'SNBT' AND upper(s.kode) = 'LBE';

COMMIT;

-- Pemeriksaan sesudahnya (hasil yang diharapkan: subtes aktif PU, LBI, LBE, NUM; topik "D0-" tetap di NUM):
-- SELECT s.kode, s.nama, s.urutan, s.is_active,
--        (SELECT count(*) FROM topics t WHERE t.subject_id = s.id AND t.is_active) AS topik_aktif,
--        (SELECT count(*) FROM topics t WHERE t.subject_id = s.id AND t.nama LIKE 'D0-%') AS topik_stage
--   FROM subjects s JOIN curriculum_groups cg ON cg.id = s.curriculum_group_id
--  WHERE upper(cg.kode) = 'SNBT' ORDER BY s.urutan;
