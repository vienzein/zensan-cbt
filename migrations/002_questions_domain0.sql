-- Penanda soal yang dipakai untuk tes izin Domain 0 (matematika).
-- Tim konten perlu menandai soal-soalnya: UPDATE questions SET is_domain0 = TRUE WHERE id IN (...)
BEGIN;

ALTER TABLE questions ADD COLUMN is_domain0 BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_questions_domain0 ON questions(topic_id) WHERE is_domain0 AND is_active;

COMMIT;
