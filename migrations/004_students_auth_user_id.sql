-- Menghubungkan siswa dengan pengguna Supabase Auth.
-- students.id tetap id milik kita (semua tabel progres menunjuk ke sini);
-- auth_user_id hanya pemetaan ke id pengguna di Supabase, jadi penyedia login bisa diganti nanti.
BEGIN;

ALTER TABLE students ADD COLUMN auth_user_id UUID UNIQUE;

COMMIT;
