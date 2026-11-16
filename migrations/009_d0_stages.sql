-- 009: stage tes diagnostik Domain 0 (data saja: daftar stage dan kumpulan soalnya).
--
-- Satu stage = satu paket latihan kecil (biasanya 3 soal) untuk satu indikator. Soal tiap stage diambil acak
-- dari kumpulan soal stage itu (d0_stage_questions), jadi satu stage sebaiknya punya lebih banyak soal daripada
-- jumlah yang ditampilkan.
--
-- Soal stage tetap disimpan di tabel questions (supaya kunci, pembahasan, gambar, dan penilaian sama dengan soal
-- lain), tetapi diikatkan ke topik dan subtopik "tersembunyi" (is_active = false) milik stage itu. Dengan begitu
-- soal stage TIDAK muncul di drill, tryout, kalibrasi, maupun beranda, dan hanya dilayani lewat stage.
--
-- Migrasi ini belum memuat tabel progres siswa dan percobaan stage (menyusul bersama endpoint-nya).

BEGIN;

CREATE TABLE d0_stages (
    id                    BIGSERIAL PRIMARY KEY,
    curriculum_group_id   BIGINT   NOT NULL REFERENCES curriculum_groups(id),
    kode                  TEXT     NOT NULL,                 -- 'D0-01-01.S1' atau 'D0-01.G' (gabungan)
    kode_topik            TEXT     NOT NULL,                 -- 'D0-01'
    nama_topik            TEXT     NOT NULL,                 -- 'Bilangan Bulat dan Operasi Hitung'
    indikator             TEXT     NOT NULL,
    level_soal            SMALLINT NOT NULL CHECK (level_soal BETWEEN 1 AND 4),
    isi                   TEXT     NOT NULL,
    jumlah_soal           SMALLINT NOT NULL DEFAULT 3 CHECK (jumlah_soal BETWEEN 1 AND 20),
    target_detik_per_soal INTEGER  NOT NULL CHECK (target_detik_per_soal > 0),
    batas_detik           INTEGER  NOT NULL CHECK (batas_detik > 0),
    urutan                INTEGER  NOT NULL,
    is_gabungan           BOOLEAN  NOT NULL DEFAULT FALSE,
    is_active             BOOLEAN  NOT NULL DEFAULT TRUE,
    -- topik/subtopik tersembunyi tempat soal stage ini disimpan (dibuat oleh npm run impor:stage)
    topic_id              BIGINT   REFERENCES topics(id),
    subtopic_id           BIGINT   REFERENCES subtopics(id),
    UNIQUE (curriculum_group_id, kode)
);
CREATE INDEX idx_d0_stages_urutan ON d0_stages(curriculum_group_id, urutan);

CREATE TABLE d0_stage_questions (
    stage_id    BIGINT NOT NULL REFERENCES d0_stages(id) ON DELETE CASCADE,
    question_id BIGINT NOT NULL REFERENCES questions(id)  ON DELETE RESTRICT,
    PRIMARY KEY (stage_id, question_id)
);
CREATE INDEX idx_d0_stage_questions_question ON d0_stage_questions(question_id);

COMMIT;
