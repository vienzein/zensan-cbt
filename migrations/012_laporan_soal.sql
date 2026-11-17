-- 012: laporan soal dari siswa (gambar tidak muncul, tidak ada jawaban benar, dst.).
-- Satu siswa boleh melaporkan satu soal dengan beberapa alasan berbeda, tetapi tidak dengan alasan yang sama dua kali
-- (laporan ulang hanya memperbarui catatan). Laporan ikut terhapus bila soalnya dihapus permanen.
CREATE TABLE IF NOT EXISTS question_reports (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id   UUID        NOT NULL REFERENCES students(id)  ON DELETE CASCADE,
  question_id  BIGINT      NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  alasan       TEXT        NOT NULL CHECK (alasan IN (
                 'gambar_tidak_muncul', 'soal_tidak_lengkap', 'tidak_ada_jawaban_benar',
                 'lebih_dari_satu_jawaban_benar', 'kunci_salah', 'pembahasan_salah',
                 'salah_ketik', 'rumus_rusak', 'lainnya')),
  catatan      TEXT        CHECK (catatan IS NULL OR char_length(catatan) <= 500),
  status       TEXT        NOT NULL DEFAULT 'baru' CHECK (status IN ('baru', 'ditinjau', 'selesai', 'ditolak')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, question_id, alasan)
);
CREATE INDEX IF NOT EXISTS question_reports_soal_idx   ON question_reports (question_id, status);
CREATE INDEX IF NOT EXISTS question_reports_status_idx ON question_reports (status, created_at DESC);
