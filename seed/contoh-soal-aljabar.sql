-- Soal CONTOH untuk mencoba aplikasi (topik "Aljabar dan Fungsi" di SNBT / Penalaran Matematika).
-- Bukan bank soal asli: semua teks diawali "[Contoh]". Aman dijalankan ulang (tidak membuat data ganda).
-- Aturan database (sejak migrasi 008): semua level minimal 1 subtopik.
-- Jalankan di Supabase SQL Editor setelah data awal tes SNBT ada.

DO $$
DECLARE
  tid BIGINT; s_pk BIGINT; s_fk BIGINT; qid BIGINT; r RECORD;
BEGIN
  SELECT t.id INTO tid
    FROM topics t JOIN subjects s ON s.id = t.subject_id JOIN curriculum_groups c ON c.id = s.curriculum_group_id
   WHERE c.kode = 'SNBT' AND t.nama = 'Aljabar dan Fungsi';
  IF tid IS NULL THEN RAISE EXCEPTION 'Topik "Aljabar dan Fungsi" di SNBT belum ada. Jalankan data awal tes dulu.'; END IF;
  SELECT id INTO s_pk FROM subtopics WHERE topic_id = tid AND nama = 'Persamaan kuadrat';
  SELECT id INTO s_fk FROM subtopics WHERE topic_id = tid AND nama = 'Fungsi komposisi';

  IF EXISTS (SELECT 1 FROM questions WHERE topic_id = tid AND soal_teks LIKE '[Contoh]%') THEN
    RAISE NOTICE 'Soal contoh sudah ada, tidak ditambah lagi.';
    RETURN;
  END IF;

  FOR r IN SELECT * FROM (VALUES
    -- level, subtopik (PK/FK/DUA), domain0, soal, A, B, C, D, kunci
    (1,'PK',true ,'Akar-akar persamaan x² − 5x + 6 = 0 adalah ...','2 dan 3','−2 dan −3','1 dan 6','−1 dan −6','A'),
    (1,'PK',true ,'Akar-akar persamaan x² − 9 = 0 adalah ...','3 saja','−3 saja','3 dan −3','9 dan −9','C'),
    (1,'PK',true ,'Jumlah akar-akar persamaan x² − 7x + 10 = 0 adalah ...','5','7','10','−7','B'),
    (1,'PK',false,'Hasil kali akar-akar persamaan x² + 2x − 8 = 0 adalah ...','8','−8','2','−2','B'),
    (1,'PK',false,'Diskriminan persamaan x² − 4x + 4 = 0 adalah ...','0','4','8','−4','A'),
    (1,'PK',false,'Akar-akar persamaan x² + x − 12 = 0 adalah ...','3 dan −4','−3 dan 4','2 dan −6','6 dan −2','A'),
    (1,'FK',true ,'Jika f(x) = x + 3 dan g(x) = 2x, maka (f ∘ g)(x) = ...','2x + 3','2x + 6','x + 6','3x','A'),
    (1,'FK',true ,'Jika f(x) = 3x dan g(x) = x − 2, maka (g ∘ f)(x) = ...','3x − 6','3x − 2','3x + 2','x − 6','B'),
    (1,'FK',true ,'Jika f(x) = x² dan g(x) = x + 1, maka (f ∘ g)(2) = ...','5','7','9','10','C'),
    (1,'FK',false,'Jika f(x) = 2x + 1 dan g(x) = x², maka (g ∘ f)(1) = ...','4','9','6','3','B'),
    (1,'FK',false,'Jika f(x) = x + 5 dan g(x) = x − 5, maka (f ∘ g)(x) = ...','0','10','x','2x','C'),
    (1,'FK',false,'Jika f(x) = 4x dan g(x) = x + 2, maka (f ∘ g)(1) = ...','6','8','12','14','C'),
    (2,'PK',false,'Jika x₁ dan x₂ akar-akar x² − 6x + 8 = 0, maka x₁² + x₂² = ...','12','20','28','36','B'),
    (2,'PK',false,'Persamaan kuadrat yang akar-akarnya 1 dan 4 adalah ...','x² + 5x + 4 = 0','x² − 5x + 4 = 0','x² − 4x + 5 = 0','x² + 4x − 5 = 0','B'),
    (2,'PK',false,'Agar x² − 4x + k = 0 mempunyai akar kembar, nilai k adalah ...','2','4','8','16','B'),
    (2,'FK',false,'Jika f(x) = 2x + 3 dan g(x) = x − 1, maka (f ∘ g)(4) = ...','7','9','11','13','B'),
    (2,'FK',false,'Jika f(x) = 2x + 1 dan (f ∘ g)(x) = 4x + 1, maka g(x) = ...','x','2x','4x','x + 1','B'),
    (2,'FK',false,'Jika f(x) = x² dan g(x) = 3x − 1, maka (g ∘ f)(2) = ...','5','11','17','35','B'),
    (3,'DUA',false,'Diketahui f(x) = x² − 5x + 6 dan g(x) = x + 1. Nilai x yang memenuhi (f ∘ g)(x) = 0 adalah ...','1 dan 2','−1 dan −2','2 dan 3','1 dan 3','A'),
    (3,'DUA',false,'Diketahui f(x) = x − 2 dan g(x) = x². Nilai x yang memenuhi (g ∘ f)(x) = 9 adalah ...','5 dan −1','5 dan 1','−5 dan 1','3 dan −3','A')
  ) AS v(level, sub, d0, teks, a, b, c, d, kunci)
  LOOP
    INSERT INTO questions (topic_id, level_soal, soal_teks, opsi_jawaban, kunci_jawaban,
                           target_waktu_detik, poin_reward, poin_penalty, is_domain0)
    VALUES (tid, r.level, '[Contoh] ' || r.teks,
            jsonb_build_array(jsonb_build_object('kode','A','teks',r.a), jsonb_build_object('kode','B','teks',r.b),
                              jsonb_build_object('kode','C','teks',r.c), jsonb_build_object('kode','D','teks',r.d)),
            to_jsonb(r.kunci), 90, 10, 2, r.d0)
    RETURNING id INTO qid;
    IF r.sub = 'PK' OR r.sub = 'DUA' THEN INSERT INTO question_subtopics (question_id, subtopic_id) VALUES (qid, s_pk); END IF;
    IF r.sub = 'FK' OR r.sub = 'DUA' THEN INSERT INTO question_subtopics (question_id, subtopic_id) VALUES (qid, s_fk); END IF;
  END LOOP;
END $$;
