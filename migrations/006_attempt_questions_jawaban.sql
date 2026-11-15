-- Jawaban per soal dikunci di server saat dijawab (untuk umpan balik RR langsung / popup).
-- Submit akhir tetap penentu resmi, tetapi memakai jawaban yang sudah terkunci ini.
BEGIN;

ALTER TABLE student_attempt_questions
    ADD COLUMN IF NOT EXISTS dijawab_at       TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS jawaban_terkunci JSONB,
    ADD COLUMN IF NOT EXISTS durasi_terkunci  NUMERIC(8,2);

COMMIT;
