'use strict';

const C = require('../config/rr');
const { HttpError } = require('../errors');
const { isAnswerCorrect } = require('./grading');
const { calculateSessionRR, scoreAnswer } = require('./drillScoring');
const { loadAssignedQuestionIds } = require('./attemptQuestions');

const RANKED_MODE = 'drill_ranked';
const FREE_MODE = 'drill_free';

/**
 * Memproses batch jawaban satu sesi dalam SATU transaksi:
 * BEGIN -> kunci attempt -> nilai di server -> hitung RR -> tulis semua -> COMMIT.
 * Gagal di tahap mana pun = ROLLBACK, tidak ada data setengah jadi.
 */
async function submitDrill(pool, studentId, { attemptId, answers }) {
  const client = await pool.connect();
  let releaseErr;
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = '10s'`);

    // 1-3. Kunci attempt, validasi, nilai jawaban di server
    const { attempt, scored, totalDurasi } = await prepareSubmission(
      client, studentId, { attemptId, answers }, [RANKED_MODE, FREE_MODE],
    );

    // 4. Hitung RR
    let calc;
    if (attempt.mode === RANKED_MODE) {
      const subtopicIds = [...new Set(scored.filter((a) => a.levelSoal <= 3).flatMap((a) => a.subtopicIds))];
      const topicIds = [...new Set(scored.map((a) => a.topicId))];
      const { subtopicState, topicState, topicCounts } =
        await lockMasteryState(client, studentId, subtopicIds, topicIds);

      calc = calculateSessionRR({
        answers: scored,
        subtopicState,
        topicState,
        topicCounts,
        now: attempt.db_now,
      });
    } else {
      // drill_free: tetap dinilai & dicatat, tetapi tidak mengubah RR
      calc = {
        totalRrDelta: 0,
        logs: [],
        subtopicUpdates: [],
        topicUpdates: [],
        results: scored.map((a) => ({
          urutan: a.urutan,
          questionId: a.questionId,
          rrDelta: 0,
          isSpeedBonus: false,
          isFlaggedGuess: scoreAnswer(a).isFlaggedGuess,
          efek: 'tanpa_rr',
        })),
      };
    }

    // 5. Tulis semuanya
    const resultByUrutan = new Map(calc.results.map((r) => [r.urutan, r]));
    const answerIdByUrutan = await insertAnswerHistory(client, attemptId, studentId, scored, resultByUrutan);
    await insertMasteryLogs(client, studentId, calc.logs, answerIdByUrutan);
    await updateSubtopicMastery(client, studentId, calc.subtopicUpdates);
    const topicRows = await updateTopicMastery(client, studentId, calc.topicUpdates);

    const jumlahBenar = scored.filter((a) => a.isCorrect).length;
    const jumlahSalah = scored.length - jumlahBenar;
    const totalDurasiInt = Math.round(totalDurasi);

    await client.query(
      `UPDATE student_attempts
          SET status = 'selesai',
              finished_at = now(),
              total_durasi_detik = $2,
              jumlah_benar = $3,
              jumlah_salah = $4,
              total_rr_delta = $5
        WHERE id = $1`,
      [attemptId, totalDurasiInt, jumlahBenar, jumlahSalah, calc.totalRrDelta],
    );

    await client.query('COMMIT');

    return buildResponse({
      attemptId, mode: attempt.mode, scored, calc, topicRows,
      jumlahBenar, jumlahSalah, totalDurasiInt,
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[drill] ROLLBACK gagal:', rollbackErr);
      releaseErr = rollbackErr; // koneksi dibuang dari pool
    }
    if (err && err.code === '23505') {
      // unique violation (mis. attempt_id + question_id) -> request ganda
      throw new HttpError(409, 'DUPLIKAT', 'Jawaban untuk sesi ini sudah tercatat');
    }
    throw err;
  } finally {
    client.release(releaseErr);
  }
}

// ---------------------------------------------------------------------------
// Tahap bersama semua mode submit (drill, Domain 0, tryout kalibrasi)
// ---------------------------------------------------------------------------

/**
 * Kunci attempt, validasi payload terhadap server, dan nilai jawaban.
 * Harus dipanggil di dalam transaksi yang sudah BEGIN.
 */
async function prepareSubmission(client, studentId, { attemptId, answers }, allowedModes) {
  // 1. Kunci baris attempt: mencegah submit ganda / balapan dua request
  const attempt = await lockAttempt(client, attemptId, studentId);

  if (attempt.status !== 'berlangsung') {
    throw new HttpError(409, 'ATTEMPT_SUDAH_SELESAI', 'Sesi ini sudah disubmit atau ditinggalkan');
  }
  if (!allowedModes.includes(attempt.mode)) {
    throw new HttpError(422, 'MODE_TIDAK_DIDUKUNG', `Mode '${attempt.mode}' tidak diproses endpoint ini`);
  }
  // 1a. Jawaban yang sudah dikunci lewat /api/drill/jawab menang atas isi body; yang terkunci tetapi
  //     tidak dikirim ulang tetap dihitung (tidak bisa disembunyikan). Urutan = urutan dijawab.
  const locked = await loadLockedAnswers(client, attemptId);
  if (locked.length) {
    const lockedIds = new Set(locked.map((l) => l.questionId));
    // Urutan pemrosesan = urutan soal di sesi (deterministik, tidak bergantung waktu request tiba)
    const urutanSesi = new Map((await client.query(
      `SELECT question_id, urutan FROM student_attempt_questions WHERE attempt_id = $1`, [attemptId],
    )).rows.map((r) => [r.question_id, r.urutan]));
    answers = [...locked, ...answers.filter((a) => !lockedIds.has(a.questionId))]
      .sort((x, y) => (urutanSesi.get(x.questionId) ?? 1e9) - (urutanSesi.get(y.questionId) ?? 1e9))
      .map((a, i) => ({ ...a, urutan: i + 1 }));
  }
  if (answers.length > attempt.jumlah_soal) {
    throw new HttpError(422, 'JUMLAH_JAWABAN_MELEBIHI_SOAL',
      `Jawaban (${answers.length}) melebihi jumlah_soal sesi (${attempt.jumlah_soal})`);
  }

  // 1b. Hanya soal yang ditetapkan server untuk sesi ini yang boleh dijawab
  const assigned = await loadAssignedQuestionIds(client, attemptId);
  const asing = answers.filter((a) => !assigned.has(a.questionId)).map((a) => a.questionId);
  if (asing.length) {
    throw new HttpError(422, 'SOAL_BUKAN_BAGIAN_SESI', 'Ada soal yang bukan bagian dari sesi ini', asing);
  }

  // 2. Anti-manipulasi: total durasi tidak boleh melebihi waktu nyata sesi
  const totalDurasi = answers.reduce((s, a) => s + a.durasi, 0);
  if (totalDurasi > attempt.elapsed_sec + C.DURATION_TOLERANCE_SEC) {
    throw new HttpError(422, 'DURASI_TIDAK_VALID',
      'Total durasi jawaban melebihi lama sesi yang tercatat di server');
  }

  // 3. Data soal dari DB (sumber kebenaran: kunci, level, target waktu, poin)
  const scored = await buildScored(client, answers);

  return { attempt, scored, totalDurasi };
}

/** Gabungkan jawaban dengan data soal dari DB lalu nilai benar/salahnya. */
async function buildScored(client, answers) {
  const questions = await loadQuestions(client, answers.map((a) => a.questionId));
  return answers.map((a) => {
    const q = questions.byId.get(a.questionId);
    if (!q) throw new HttpError(422, 'SOAL_TIDAK_DITEMUKAN', `Soal ${a.questionId} tidak ditemukan`);
    return {
      ...a,
      topicId: q.topic_id,
      levelSoal: q.level_soal,
      targetWaktu: q.target_waktu_detik,
      poinReward: q.poin_reward,
      isCorrect: isAnswerCorrect(q.kunci_jawaban, a.jawaban),
      subtopicIds: questions.subtopicsByQuestion.get(a.questionId) || [],
    };
  });
}

/** Jawaban yang sudah dikunci server pada sesi ini, urut waktu dijawab. */
async function loadLockedAnswers(client, attemptId) {
  const { rows } = await client.query(
    `SELECT question_id, jawaban_terkunci, durasi_terkunci
       FROM student_attempt_questions
      WHERE attempt_id = $1 AND dijawab_at IS NOT NULL
      ORDER BY urutan`,
    [attemptId],
  );
  return rows.map((r, i) => ({
    urutan: i + 1,
    questionId: r.question_id,
    jawaban: r.jawaban_terkunci,
    durasi: Number(r.durasi_terkunci),
  }));
}

/** Tutup attempt: status selesai + ringkasan hasil. */
async function finishAttempt(client, { attemptId, scored, totalDurasi, totalRrDelta = 0 }) {
  const jumlahBenar = scored.filter((a) => a.isCorrect).length;
  const jumlahSalah = scored.length - jumlahBenar;
  const totalDurasiInt = Math.round(totalDurasi);
  await client.query(
    `UPDATE student_attempts
        SET status = 'selesai', finished_at = now(), total_durasi_detik = $2,
            jumlah_benar = $3, jumlah_salah = $4, total_rr_delta = $5
      WHERE id = $1`,
    [attemptId, totalDurasiInt, jumlahBenar, jumlahSalah, totalRrDelta],
  );
  return { jumlahBenar, jumlahSalah, totalDurasiInt };
}

// ---------------------------------------------------------------------------
// Query helper
// ---------------------------------------------------------------------------

async function lockAttempt(client, attemptId, studentId) {
  const { rows } = await client.query(
    `SELECT id, mode, status, jumlah_soal, curriculum_group_id,
            now() AS db_now,
            EXTRACT(EPOCH FROM (now() - started_at))::float8 AS elapsed_sec
       FROM student_attempts
      WHERE id = $1 AND student_id = $2
        FOR UPDATE`,
    [attemptId, studentId],
  );
  if (!rows.length) throw new HttpError(404, 'ATTEMPT_TIDAK_DITEMUKAN', 'Sesi tidak ditemukan');
  return rows[0];
}

async function loadQuestions(client, questionIds) {
  // Berurutan: satu client pg hanya boleh menjalankan satu query pada satu waktu
  const q = await client.query(
    `SELECT id, topic_id, level_soal, kunci_jawaban, target_waktu_detik, poin_reward
       FROM questions
      WHERE id = ANY($1::bigint[])`,
    [questionIds],
  );
  const qs = await client.query(
    `SELECT question_id, subtopic_id
       FROM question_subtopics
      WHERE question_id = ANY($1::bigint[])`,
    [questionIds],
  );

  const subtopicsByQuestion = new Map();
  for (const r of qs.rows) {
    if (!subtopicsByQuestion.has(r.question_id)) subtopicsByQuestion.set(r.question_id, []);
    subtopicsByQuestion.get(r.question_id).push(r.subtopic_id);
  }
  return { byId: new Map(q.rows.map((r) => [r.id, r])), subtopicsByQuestion };
}

/**
 * Pastikan baris mastery ada (siswa baru), lalu kunci dengan FOR UPDATE
 * dalam urutan ID tetap agar dua sesi paralel tidak saling deadlock.
 */
async function lockMasteryState(client, studentId, subtopicIds, topicIds) {
  const subtopicState = new Map();
  const topicState = new Map();
  const topicCounts = new Map();

  if (subtopicIds.length) {
    await client.query(
      `INSERT INTO student_mastery (student_id, subtopic_id)
       SELECT $1::uuid, s FROM unnest($2::bigint[]) AS s
       ON CONFLICT DO NOTHING`,
      [studentId, subtopicIds],
    );
    const { rows } = await client.query(
      `SELECT subtopic_id, current_level, rank_rating, strike_count
         FROM student_mastery
        WHERE student_id = $1 AND subtopic_id = ANY($2::bigint[])
        ORDER BY subtopic_id
          FOR UPDATE`,
      [studentId, subtopicIds],
    );
    for (const r of rows) {
      subtopicState.set(r.subtopic_id, {
        current_level: r.current_level,
        rank_rating: r.rank_rating,
        strike_count: r.strike_count,
      });
    }
  }

  if (topicIds.length) {
    await client.query(
      `INSERT INTO student_topic_mastery (student_id, topic_id)
       SELECT $1::uuid, t FROM unnest($2::bigint[]) AS t
       ON CONFLICT DO NOTHING`,
      [studentId, topicIds],
    );
    const { rows } = await client.query(
      `SELECT topic_id, is_elite, elite_rr, strike_count, level3_unlocked, cooldown_until
         FROM student_topic_mastery
        WHERE student_id = $1 AND topic_id = ANY($2::bigint[])
        ORDER BY topic_id
          FOR UPDATE`,
      [studentId, topicIds],
    );
    for (const r of rows) {
      topicState.set(r.topic_id, {
        is_elite: r.is_elite,
        elite_rr: r.elite_rr,
        strike_count: r.strike_count,
        level3_unlocked: r.level3_unlocked,
        cooldown_until: r.cooldown_until,
      });
    }

    // Sebaran level seluruh subtopik aktif tiap topik (untuk gerbang Level 3 & masuk Elite)
    const cnt = await client.query(
      `SELECT st.topic_id,
              count(*)::int AS total,
              (count(*) FILTER (WHERE COALESCE(sm.current_level, 1) >= 2))::int AS at2plus,
              (count(*) FILTER (WHERE COALESCE(sm.current_level, 1) = 3))::int AS at3
         FROM subtopics st
    LEFT JOIN student_mastery sm
           ON sm.student_id = $1::uuid AND sm.subtopic_id = st.id
        WHERE st.topic_id = ANY($2::bigint[]) AND st.is_active
        GROUP BY st.topic_id`,
      [studentId, topicIds],
    );
    for (const r of cnt.rows) {
      topicCounts.set(r.topic_id, { total: r.total, at2plus: r.at2plus, at3: r.at3 });
    }
  }

  return { subtopicState, topicState, topicCounts };
}

async function insertAnswerHistory(client, attemptId, studentId, scored, resultByUrutan) {
  const COLS = 12;
  const params = [];
  const tuples = scored.map((a, i) => {
    const r = resultByUrutan.get(a.urutan);
    const b = i * COLS;
    params.push(
      attemptId, studentId, a.questionId, a.urutan,
      a.jawaban === null ? null : JSON.stringify(a.jawaban),
      a.isCorrect, a.durasi, a.levelSoal, a.targetWaktu,
      r.rrDelta, r.isSpeedBonus, r.isFlaggedGuess,
    );
    return `($${b + 1}::uuid,$${b + 2}::uuid,$${b + 3}::bigint,$${b + 4}::smallint,$${b + 5}::jsonb,` +
           `$${b + 6}::boolean,$${b + 7}::numeric,$${b + 8}::smallint,$${b + 9}::int,` +
           `$${b + 10}::int,$${b + 11}::boolean,$${b + 12}::boolean)`;
  });

  const { rows } = await client.query(
    `INSERT INTO student_answer_history
       (attempt_id, student_id, question_id, urutan, jawaban_siswa, is_correct,
        durasi_pengerjaan_detik, level_soal_snapshot, target_waktu_snapshot,
        rr_delta, is_speed_bonus, is_flagged_guess)
     VALUES ${tuples.join(',')}
     RETURNING id, urutan`,
    params,
  );
  return new Map(rows.map((r) => [r.urutan, r.id]));
}

async function insertMasteryLogs(client, studentId, logs, answerIdByUrutan) {
  if (!logs.length) return;
  const COLS = 9;
  const params = [];
  const tuples = logs.map((l, i) => {
    const b = i * COLS;
    params.push(
      answerIdByUrutan.get(l.urutan), studentId, l.subtopicId, l.topicId,
      l.levelBefore, l.levelAfter, l.rrBefore, l.rrAfter, l.strikeAfter,
    );
    return `($${b + 1}::bigint,$${b + 2}::uuid,$${b + 3}::bigint,$${b + 4}::bigint,` +
           `$${b + 5}::smallint,$${b + 6}::smallint,$${b + 7}::smallint,$${b + 8}::smallint,$${b + 9}::smallint)`;
  });
  await client.query(
    `INSERT INTO student_answer_mastery_log
       (answer_id, student_id, subtopic_id, topic_id, level_before, level_after,
        rr_before, rr_after, strike_after)
     VALUES ${tuples.join(',')}`,
    params,
  );
}

async function updateSubtopicMastery(client, studentId, updates) {
  if (!updates.length) return;
  await client.query(
    `UPDATE student_mastery sm
        SET current_level    = u.lvl,
            rank_rating      = u.rr,
            strike_count     = u.strike,
            last_answered_at = now()
       FROM unnest($2::bigint[], $3::smallint[], $4::smallint[], $5::smallint[])
            AS u(subtopic_id, lvl, rr, strike)
      WHERE sm.student_id = $1::uuid AND sm.subtopic_id = u.subtopic_id`,
    [
      studentId,
      updates.map((u) => u.subtopicId),
      updates.map((u) => u.current_level),
      updates.map((u) => u.rank_rating),
      updates.map((u) => u.strike_count),
    ],
  );
}

/**
 * Menulis status Elite/RR topik dan cooldown_until (10 menit dari sekarang).
 * GREATEST menjaga cooldown yang sudah ada agar tidak diperpendek.
 */
async function updateTopicMastery(client, studentId, updates) {
  if (!updates.length) return [];
  const { rows } = await client.query(
    `UPDATE student_topic_mastery tm
        SET is_elite     = u.is_elite,
            elite_rr     = u.elite_rr,
            strike_count = u.strike,
            level3_unlocked = tm.level3_unlocked OR u.l3,
            cooldown_until = CASE WHEN u.cool
              THEN GREATEST(COALESCE(tm.cooldown_until, '-infinity'::timestamptz),
                            now() + make_interval(mins => $7::int))
              ELSE tm.cooldown_until END
       FROM unnest($2::bigint[], $3::boolean[], $4::smallint[], $5::smallint[], $6::boolean[], $8::boolean[])
            AS u(topic_id, is_elite, elite_rr, strike, cool, l3)
      WHERE tm.student_id = $1::uuid AND tm.topic_id = u.topic_id
      RETURNING tm.topic_id, tm.is_elite, tm.elite_rr, tm.level3_unlocked, tm.cooldown_until`,
    [
      studentId,
      updates.map((u) => u.topicId),
      updates.map((u) => u.is_elite),
      updates.map((u) => u.elite_rr),
      updates.map((u) => u.strike_count),
      updates.map((u) => u.cooldownTriggered),
      C.COOLDOWN_MINUTES,
      updates.map((u) => Boolean(u.level3_unlocked)),
    ],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

function buildResponse({ attemptId, mode, scored, calc, topicRows, jumlahBenar, jumlahSalah, totalDurasiInt }) {
  const firstLog = new Map();
  for (const l of calc.logs) {
    if (l.subtopicId && !firstLog.has(l.subtopicId)) firstLog.set(l.subtopicId, l);
  }

  return {
    attempt_id: attemptId,
    status: 'selesai',
    mode,
    ringkasan: {
      jumlah_dijawab: scored.length,
      jumlah_benar: jumlahBenar,
      jumlah_salah: jumlahSalah,
      total_durasi_detik: totalDurasiInt,
      total_rr_delta: calc.totalRrDelta,
    },
    hasil: calc.results.map((r) => {
      const a = scored.find((x) => x.urutan === r.urutan);
      return {
        urutan: r.urutan,
        question_id: r.questionId,
        is_correct: a.isCorrect,
        rr_delta: r.rrDelta,
        is_speed_bonus: r.isSpeedBonus,
        is_flagged_guess: r.isFlaggedGuess,
        kena_strike: r.kenaStrike || 0,
        efek: r.efek,
      };
    }),
    mastery: calc.subtopicUpdates.map((u) => {
      const first = firstLog.get(u.subtopicId);
      return {
        subtopic_id: u.subtopicId,
        level_before: first.levelBefore,
        level_after: u.current_level,
        rr_before: first.rrBefore,
        rr_after: u.rank_rating,
        strike_count: u.strike_count,
        naik_level: u.current_level > first.levelBefore,
        turun_level: u.current_level < first.levelBefore,
        kena_strike_2: calc.logs.some((l) => l.subtopicId === u.subtopicId && l.strikeAfter === 2),
      };
    }),
    topik: topicRows.map((t) => ({
      topic_id: t.topic_id,
      is_elite: t.is_elite,
      elite_rr: t.elite_rr,
      level3_unlocked: t.level3_unlocked,
      cooldown_until: t.cooldown_until,
    })),
  };
}

module.exports = {
  submitDrill,
  buildScored,
  loadLockedAnswers,
  lockAttempt,
  lockMasteryState,
  prepareSubmission,
  finishAttempt,
  insertAnswerHistory,
  insertMasteryLogs,
};
