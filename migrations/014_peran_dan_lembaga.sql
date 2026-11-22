-- 014: peran akun (siswa / admin lembaga / super admin), lembaga mitra, dan antrean persetujuan soal.
--   institutions        : lembaga/sekolah mitra; siswa bergabung lewat kode undangan.
--   students.role       : 'siswa' (bawaan) | 'admin_lembaga' (hanya lembaganya) | 'super_admin' (semua).
--   students.institution_id : lembaga siswa/admin (boleh kosong untuk siswa umum).
--   questions.institution_id / approval_status : soal yang diinput admin lembaga berstatus 'menunggu' dan TIDAK aktif
--                                               sampai super admin menyetujuinya (lalu jadi soal umum).
CREATE TABLE IF NOT EXISTS institutions (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nama           TEXT        NOT NULL UNIQUE,
    kode_undangan  TEXT        NOT NULL UNIQUE,
    is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE students ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'siswa'
  CHECK (role IN ('siswa', 'admin_lembaga', 'super_admin'));
ALTER TABLE students ADD COLUMN IF NOT EXISTS institution_id BIGINT REFERENCES institutions(id) ON DELETE SET NULL;
-- akun yang sudah ditandai is_admin (migrasi 013) menjadi super admin
UPDATE students SET role = 'super_admin' WHERE is_admin AND role = 'siswa';
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_admin_lembaga_punya_lembaga;
ALTER TABLE students ADD CONSTRAINT students_admin_lembaga_punya_lembaga
  CHECK (role <> 'admin_lembaga' OR institution_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS students_institution_idx ON students (institution_id) WHERE institution_id IS NOT NULL;

ALTER TABLE questions ADD COLUMN IF NOT EXISTS institution_id BIGINT REFERENCES institutions(id) ON DELETE SET NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'disetujui'
  CHECK (approval_status IN ('menunggu', 'disetujui', 'ditolak'));
ALTER TABLE questions ADD COLUMN IF NOT EXISTS approval_catatan TEXT;
CREATE INDEX IF NOT EXISTS questions_approval_idx ON questions (approval_status) WHERE approval_status <> 'disetujui';
CREATE INDEX IF NOT EXISTS questions_institution_idx ON questions (institution_id) WHERE institution_id IS NOT NULL;
