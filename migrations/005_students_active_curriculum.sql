-- Tes (kelompok kurikulum) yang sedang dipilih siswa: SNBT, CPNS, dst.
BEGIN;

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS active_curriculum_group_id BIGINT
    REFERENCES curriculum_groups(id) ON DELETE SET NULL;

COMMIT;
