'use strict';

const S = require('../config/stage');
const { HttpError } = require('../errors');
const { withTx, advisoryLock } = require('./tx');
const { isAnswerCorrect } = require('./grading');
const { loadQuestionPayload } = require('./attemptQuestions');
const { batasStage, evaluateStage, nextFailState, pickNextStage, gateOpen } = require('./stageRules');

const STAGE_COLS = `id, curriculum_group_id, kode, kode_topik, nama_topik, indikator, level_soal, isi, jumlah_soal,
                    target_detik_per_soal, batas_detik, urutan`;

async function loadStages(client, curriculumGroupId) {
  const { rows } = await client.query(
    `SELECT ${STAGE_COLS} FROM d0_stages
      WHERE curriculum_group_id = $1 AND is_active ORDER BY urutan, id`,
    [curriculumGroupId],
  );
  return rows.map(withBatas);
}

/** Batas stage dihitung dari target per soal (bukan batas_detik lama di tabel). */
function withBatas(s) {
  return { ...s, batas_detik: batasStage(s.jumlah_soal, s.target_detik_per_soal) };
}

async function loadProgress(client, studentId, stageIds) {
  const { rows } = await client.query(
    `SELECT stage_id, lulus_at, gagal_beruntun, cooldown_until
       FROM d0_stage_progress WHERE student_id = $1::uuid AND stage_id = ANY($2::bigint[])`,
    [studentId, stageIds],
  );
  return new Map(rows.map((r) => [String(r.stage_id), r]));
}

const passedSet = (progress) =>
  new Set([...progress].filter(([, r]) => r.lulus_at).map(([id]) => id));

/** Gerbang PK/PM versi stage: semua stage D0-01..D0-05 lulus. */
async function hasPassedStageGate(client, studentId, curriculumGroupId) {
  const stages = await loadStages(client, curriculumGroupId);
  if (!stages.length) return false;
  const progress = await loadProgress(client, studentId, stages.map((s) => s.id));
  return gateOpen(stages, passedSet(progress));
}

async function assertCurriculum(client, curriculumGroupId) {
  const { rows } = await client.query(`SELECT id FROM curriculum_groups WHERE id = $1 AND is_active`, [curriculumGroupId]);
  if (!rows.length) throw new HttpError(404, 'KURIKULUM_TIDAK_DITEMUKAN', 'Kurikulum tidak ditemukan');
}

const publicStage = (s) => ({
  id: s.id, kode: s.kode, kode_topik: s.kode_topik, nama_topik: s.nama_topik, indikator: s.indikator,
  level_soal: s.level_soal, jumlah_soal: s.jumlah_soal, batas_detik: s.batas_detik,
  target_detik_per_soal: s.target_detik_per_soal,
});

/** GET /api/domain0/stages */
async function listStages(pool, studentId, { curriculumGroupId }) {
  const client = await pool.connect();
  try {
    await assertCurriculum(client, curriculumGroupId);
    const stages = await loadStages(client, curriculumGroupId);
    const progress = await loadProgress(client, studentId, stages.map((s) => s.id));
    const passed = passedSet(progress);
    const next = pickNextStage(stages, passed);
    const cd = next && progress.get(String(next.id)) ? progress.get(String(next.id)).cooldown_until : null;
    const aktifJeda = cd && new Date(cd) > new Date() ? cd : null;
    return {
      mode: S.mode(),
      gerbang_terbuka: gateOpen(stages, passed),
      total_stage: stages.length,
      jumlah_lulus: passed.size,
      stage_berikutnya_id: next ? next.id : null,
      cooldown_until: aktifJeda,
      stages: stages.map((s) => ({
        ...publicStage(s),
        status: passed.has(String(s.id)) ? 'lulus' : next && next.id === s.id ? 'berikutnya' : 'terkunci',
      })),
    };
  } finally {
    client.release();
  }
}

async function applyResult(client, studentId, stage, lulus) {
  const prev = (await loadProgress(client, studentId, [stage.id])).get(String(stage.id));
  if (lulus) {
    await client.query(
      `INSERT INTO d0_stage_progress (student_id, stage_id, lulus_at, gagal_beruntun, cooldown_until)
       VALUES ($1::uuid, $2, now(), 0, NULL)
       ON CONFLICT (student_id, stage_id)
       DO UPDATE SET lulus_at = COALESCE(d0_stage_progress.lulus_at, now()),
                     gagal_beruntun = 0, cooldown_until = NULL, updated_at = now()`,
      [studentId, stage.id],
    );
    return { gagalBeruntun: 0, cooldownUntil: null };
  }
  const st = nextFailState(prev ? prev.gagal_beruntun : 0);
  await client.query(
    `INSERT INTO d0_stage_progress (student_id, stage_id, gagal_beruntun, cooldown_until)
     VALUES ($1::uuid, $2, $3, $4)
     ON CONFLICT (student_id, stage_id)
     DO UPDATE SET gagal_beruntun = $3, cooldown_until = $4, updated_at = now()`,
    [studentId, stage.id, st.gagalBeruntun, st.cooldownUntil],
  );
  return st;
}

/** POST /api/domain0/stage/start */
function startStage(pool, studentId, { curriculumGroupId }) {
  return withTx(pool, async (client) => {
    await assertCurriculum(client, curriculumGroupId);
    await advisoryLock(client, `d0stage:${studentId}`);

    const stages = await loadStages(client, curriculumGroupId);
    const progress = await loadProgress(client, studentId, stages.map((s) => s.id));
    const stage = pickNextStage(stages, passedSet(progress));
    if (!stage) throw new HttpError(409, 'STAGE_SELESAI', 'Semua stage sudah lulus');

    // Sesi berjalan: lanjutkan bila belum kedaluwarsa, bila lewat dihitung gagal.
    const run = await client.query(
      `SELECT id, stage_id, extract(epoch FROM (now() - mulai_at)) AS lewat
         FROM d0_stage_attempts
        WHERE student_id = $1::uuid AND status = 'berjalan' ORDER BY mulai_at DESC`,
      [studentId],
    );
    for (const r of run.rows) {
      const sama = String(r.stage_id) === String(stage.id);
      const batasHabis = Number(r.lewat) > stage.batas_detik + S.TOLERANSI_DETIK + 30;
      if (sama && !batasHabis) {
        const qids = (await client.query(
          `SELECT question_id FROM d0_stage_attempt_questions WHERE attempt_id = $1 ORDER BY urutan`, [r.id],
        )).rows.map((x) => x.question_id);
        return {
          attempt_id: r.id, stage: publicStage(stage), batas_detik: stage.batas_detik,
          sisa_detik: Math.max(0, Math.round(stage.batas_detik - Number(r.lewat))),
          soal: await loadQuestionPayload(client, qids), dilanjutkan: true,
        };
      }
      await client.query(
        `UPDATE d0_stage_attempts SET status = 'selesai', selesai_at = now(), lulus = FALSE, jumlah_benar = 0
          WHERE id = $1`, [r.id],
      );
      const stg = stages.find((s) => String(s.id) === String(r.stage_id));
      if (stg) await applyResult(client, studentId, stg, false);
    }

    const prog = (await loadProgress(client, studentId, [stage.id])).get(String(stage.id));
    if (prog && prog.cooldown_until && new Date(prog.cooldown_until) > new Date()) {
      throw new HttpError(429, 'STAGE_JEDA', 'Tunggu sampai jeda selesai', { cooldown_until: prog.cooldown_until });
    }

    const pick = await client.query(
      `SELECT q.id FROM d0_stage_questions dq JOIN questions q ON q.id = dq.question_id
        WHERE dq.stage_id = $1 AND q.is_active ORDER BY random() LIMIT $2`,
      [stage.id, stage.jumlah_soal],
    );
    if (pick.rows.length < stage.jumlah_soal) {
      throw new HttpError(409, 'STAGE_SOAL_KURANG', 'Soal untuk stage ini belum cukup');
    }
    const qids = pick.rows.map((r) => r.id);
    const att = await client.query(
      `INSERT INTO d0_stage_attempts (student_id, stage_id) VALUES ($1::uuid, $2) RETURNING id`,
      [studentId, stage.id],
    );
    await client.query(
      `INSERT INTO d0_stage_attempt_questions (attempt_id, question_id, urutan)
       SELECT $1::uuid, q.id, q.ord FROM unnest($2::bigint[]) WITH ORDINALITY AS q(id, ord)`,
      [att.rows[0].id, qids],
    );
    return {
      attempt_id: att.rows[0].id, stage: publicStage(stage), batas_detik: stage.batas_detik,
      sisa_detik: stage.batas_detik, soal: await loadQuestionPayload(client, qids), dilanjutkan: false,
    };
  });
}

/** POST /api/domain0/stage/submit */
function submitStage(pool, studentId, { attemptId, answers }) {
  return withTx(pool, async (client) => {
    await advisoryLock(client, `d0stage:${studentId}`);
    const a = await client.query(
      `SELECT id, stage_id, status, extract(epoch FROM (now() - mulai_at)) AS lewat
         FROM d0_stage_attempts WHERE id = $1 AND student_id = $2::uuid FOR UPDATE`,
      [attemptId, studentId],
    );
    if (!a.rows.length) throw new HttpError(404, 'ATTEMPT_TIDAK_DITEMUKAN', 'Sesi stage tidak ditemukan');
    if (a.rows[0].status !== 'berjalan') throw new HttpError(409, 'SUDAH_DIKIRIM', 'Sesi ini sudah dikirim');

    const stage = withBatas((await client.query(
      `SELECT ${STAGE_COLS} FROM d0_stages WHERE id = $1`, [a.rows[0].stage_id],
    )).rows[0]);
    const qs = (await client.query(
      `SELECT aq.question_id, q.kunci_jawaban, q.target_waktu_detik
         FROM d0_stage_attempt_questions aq JOIN questions q ON q.id = aq.question_id
        WHERE aq.attempt_id = $1 ORDER BY aq.urutan`, [attemptId],
    )).rows;
    const byQ = new Map(answers.map((x) => [x.questionId, x.jawaban]));
    for (const id of byQ.keys()) {
      if (!qs.some((q) => String(q.question_id) === id)) {
        throw new HttpError(422, 'SOAL_TIDAK_VALID', 'Ada soal yang bukan bagian dari sesi ini');
      }
    }

    let benar = 0;
    let lewatSoal = 0;
    const durasiPer = new Map(answers.map((x) => [x.questionId, x.durasi]));
    const hasil = [];
    for (const q of qs) {
      const jwb = byQ.has(String(q.question_id)) ? byQ.get(String(q.question_id)) : null;
      const ok = isAnswerCorrect(q.kunci_jawaban, jwb);
      if (ok) benar += 1;
      const target = Number(q.target_waktu_detik) || stage.target_detik_per_soal;
      if ((durasiPer.get(String(q.question_id)) || 0) > target + S.TOLERANSI_DETIK) lewatSoal += 1;
      hasil.push({ question_id: q.question_id, benar: ok });
      await client.query(
        `UPDATE d0_stage_attempt_questions SET jawaban = $3::jsonb, benar = $4
          WHERE attempt_id = $1 AND question_id = $2`,
        [attemptId, q.question_id, JSON.stringify(jwb), ok],
      );
    }

    const durasi = Math.round(Number(a.rows[0].lewat) * 100) / 100;
    const ev = evaluateStage({
      jumlahBenar: benar, jumlahSoal: qs.length, durasiDetik: durasi, batasDetik: stage.batas_detik, lewatSoal,
    });
    await client.query(
      `UPDATE d0_stage_attempts SET status = 'selesai', selesai_at = now(), lulus = $2,
              jumlah_benar = $3, durasi_detik = $4 WHERE id = $1`,
      [attemptId, ev.lulus, benar, durasi],
    );
    const st = await applyResult(client, studentId, stage, ev.lulus);

    const stages = await loadStages(client, stage.curriculum_group_id);
    const passed = passedSet(await loadProgress(client, studentId, stages.map((s) => s.id)));
    const next = pickNextStage(stages, passed);
    return {
      lulus: ev.lulus,
      jumlah_benar: benar,
      jumlah_soal: qs.length,
      durasi_detik: durasi,
      batas_detik: stage.batas_detik,
      tepat_waktu: ev.tepatWaktu,
      soal_lewat_waktu: lewatSoal,
      hasil,
      gagal_beruntun: st.gagalBeruntun,
      cooldown_until: st.cooldownUntil,
      gerbang_terbuka: gateOpen(stages, passed),
      stage_berikutnya_id: next ? next.id : null,
    };
  });
}

module.exports = { listStages, startStage, submitStage, hasPassedStageGate };
