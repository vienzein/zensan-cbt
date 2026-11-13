-- Soal yang ditetapkan server untuk satu sesi. Diisi saat sesi dimulai,
-- dipakai POST /api/drill/submit untuk menolak question_id di luar sesi.
BEGIN;

CREATE TABLE student_attempt_questions (
    attempt_id   UUID     NOT NULL REFERENCES student_attempts(id) ON DELETE CASCADE,
    question_id  BIGINT   NOT NULL REFERENCES questions(id)        ON DELETE RESTRICT,
    urutan       SMALLINT NOT NULL CHECK (urutan > 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (attempt_id, question_id),
    UNIQUE (attempt_id, urutan)
);
CREATE INDEX idx_attempt_questions_question ON student_attempt_questions(question_id);

COMMIT;
