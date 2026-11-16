-- Progres siswa pada tes diagnostik Domain 0 berbasis stage.
CREATE TABLE IF NOT EXISTS d0_stage_progress (
  student_id      UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  stage_id        BIGINT      NOT NULL REFERENCES d0_stages(id) ON DELETE CASCADE,
  lulus_at        TIMESTAMPTZ,
  gagal_beruntun  INT         NOT NULL DEFAULT 0 CHECK (gagal_beruntun >= 0),
  cooldown_until  TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, stage_id)
);

CREATE TABLE IF NOT EXISTS d0_stage_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  stage_id      BIGINT      NOT NULL REFERENCES d0_stages(id) ON DELETE CASCADE,
  mulai_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  selesai_at    TIMESTAMPTZ,
  status        TEXT        NOT NULL DEFAULT 'berjalan' CHECK (status IN ('berjalan','selesai')),
  lulus         BOOLEAN,
  jumlah_benar  INT,
  durasi_detik  NUMERIC(8,2)
);
CREATE INDEX IF NOT EXISTS d0_stage_attempts_siswa_idx ON d0_stage_attempts (student_id, stage_id, status);

CREATE TABLE IF NOT EXISTS d0_stage_attempt_questions (
  attempt_id   UUID   NOT NULL REFERENCES d0_stage_attempts(id) ON DELETE CASCADE,
  question_id  BIGINT NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  urutan       INT    NOT NULL,
  jawaban      JSONB,
  benar        BOOLEAN,
  PRIMARY KEY (attempt_id, question_id)
);
