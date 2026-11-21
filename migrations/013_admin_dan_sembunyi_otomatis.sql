-- 013: peran admin + alasan soal disembunyikan.
--   students.is_admin       : true = boleh membuka halaman admin (/api/admin/*). Diisi manual lewat SQL.
--   questions.hidden_reason : NULL = tidak disembunyikan; 'laporan_otomatis' = disembunyikan karena banyak siswa melapor;
--                             'admin' = disembunyikan oleh admin. Soal tersembunyi = is_active false (tidak muncul di drill/tryout).
ALTER TABLE students  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS hidden_reason TEXT
  CHECK (hidden_reason IS NULL OR hidden_reason IN ('laporan_otomatis', 'admin'));
