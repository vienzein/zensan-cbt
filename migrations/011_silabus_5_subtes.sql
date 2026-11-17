-- 011: peralihan ke silabus baru: 5 subtes (PU, KL, NUM, LBI, LBE) menggantikan 7 (PU, PPU, PBM, PK, LBI, LBE, PM).
-- CATATAN: SUDAH DIJALANKAN manual di Supabase pemilik pada 17 Nov 2026. Berkas ini adalah catatan SQL yang
-- benar-benar berjalan; angka id (12..18, 28, 29, 81..85) khusus database itu. Jangan dijalankan ulang di database lain
-- tanpa mencocokkan id-nya (cek dengan SELECT di subjects/topics).
--
-- Urutan yang dipakai: (1) impor:silabus --tulis membuat KL dan NUM beserta topik/subtopik barunya,
-- (2) SQL di bawah memindahkan topik stage Domain 0 dari PM ke NUM dan mengarsipkan yang lama.
-- Topik/subtopik lama tidak dihapus: namanya diberi awalan "[lama] " dan dinonaktifkan (soal/riwayat tetap utuh).
-- PU dan LBI tidak diarsipkan karena nama topiknya sama dengan silabus baru.
-- Topik id 30 ("Aljabar dan Fungsi" lama di PM, 22 soal) tidak bisa dipindah ke NUM (nama bentrok), jadi diarsipkan di PM.

BEGIN;

UPDATE topics SET subject_id = 29 WHERE subject_id = 18 AND nama LIKE 'D0-%';

UPDATE subtopics SET nama = '[lama] ' || nama, is_active = false
 WHERE nama NOT LIKE '[lama]%'
   AND topic_id IN (SELECT id FROM topics WHERE subject_id IN (13, 14, 15, 18) OR id IN (81, 82, 83, 84, 85));

UPDATE topics SET nama = '[lama] ' || nama, is_active = false
 WHERE nama NOT LIKE '[lama]%'
   AND (subject_id IN (13, 14, 15, 18) OR id IN (81, 82, 83, 84, 85));

UPDATE subjects SET is_active = false WHERE id IN (13, 14, 15, 18);  -- PPU, PBM, PK, PM
UPDATE subjects SET urutan = 1 WHERE id = 12;  -- PU
UPDATE subjects SET urutan = 2 WHERE id = 28;  -- KL
UPDATE subjects SET urutan = 3 WHERE id = 29;  -- NUM
UPDATE subjects SET urutan = 4 WHERE id = 16;  -- LBI
UPDATE subjects SET urutan = 5 WHERE id = 17;  -- LBE

UPDATE topics SET requires_domain0 = true WHERE subject_id = 29 AND is_active;

COMMIT;
