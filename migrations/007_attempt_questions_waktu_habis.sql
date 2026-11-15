-- Tanda "waktu habis tanpa jawaban" per soal. Di Level 1-2, soal seperti ini tidak mengurangi RR.
BEGIN;

ALTER TABLE student_attempt_questions
    ADD COLUMN IF NOT EXISTS waktu_habis BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
