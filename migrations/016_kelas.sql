-- Sesi kelas online (Google Meet). Tiap sesi terikat ke satu program; siswa melihatnya bila akses program itu aktif.
BEGIN;

CREATE TABLE class_sessions (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    program_kode  VARCHAR(30)  NOT NULL REFERENCES programs(kode),
    judul         VARCHAR(160) NOT NULL,
    deskripsi     TEXT         NOT NULL DEFAULT '',
    pengajar      VARCHAR(120),
    mulai_pada    TIMESTAMPTZ  NOT NULL,
    selesai_pada  TIMESTAMPTZ  NOT NULL,
    link_meet     TEXT         NOT NULL,
    dibatalkan    BOOLEAN      NOT NULL DEFAULT FALSE,
    dibuat_oleh   UUID REFERENCES students(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CHECK (selesai_pada > mulai_pada)
);
CREATE INDEX idx_class_sessions_program_mulai ON class_sessions(program_kode, mulai_pada);
CREATE INDEX idx_class_sessions_mulai ON class_sessions(mulai_pada);

COMMIT;
