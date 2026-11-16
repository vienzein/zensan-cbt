-- 008: ikatan soal-subtopik dilonggarkan.
--
-- Sebelumnya (fn_validate_question_subtopic_count):
--   Level 1-2 : tepat 1 subtopik
--   Level 3   : minimal 2 subtopik
--   Level 4   : tanpa pemeriksaan
-- Sekarang: semua level boleh 1 subtopik atau lebih (minimal 1). Subtopik tetap harus berada di topik yang
-- sama dengan soal (fn_qs_same_topic, tidak diubah).
--
-- Yang diganti hanya isi fungsinya. Pemicu (constraint trigger) yang memanggilnya di tabel questions dan
-- question_subtopics tetap dipakai apa adanya, jadi pemeriksaan tetap dilakukan saat COMMIT.
-- Soal yang sudah ada tidak terpengaruh: aturan baru lebih longgar dan hanya diperiksa saat soal diubah.
--
-- Cara memulihkan aturan lama: jalankan kembali definisi fungsi lama (tersimpan di riwayat git / hasil
-- pg_get_functiondef sebelum migrasi ini).

CREATE OR REPLACE FUNCTION public.fn_validate_question_subtopic_count()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_qid   BIGINT;
    v_level SMALLINT;
    v_count INTEGER;
BEGIN
    IF TG_TABLE_NAME = 'questions' THEN
        v_qid := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        v_qid := OLD.question_id;
    ELSE
        v_qid := NEW.question_id;
    END IF;

    SELECT level_soal INTO v_level FROM questions WHERE id = v_qid;
    IF NOT FOUND THEN
        RETURN NULL;  -- soal sudah dihapus (cascade)
    END IF;

    SELECT count(*) INTO v_count FROM question_subtopics WHERE question_id = v_qid;

    IF v_count < 1 THEN
        RAISE EXCEPTION 'Soal % (level %) harus mengikat minimal 1 subtopik, ditemukan %', v_qid, v_level, v_count;
    END IF;
    RETURN NULL;
END;
$function$;
