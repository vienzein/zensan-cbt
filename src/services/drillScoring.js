'use strict';

const C = require('../config/rr');

/**
 * Logika RR murni (tanpa DB) supaya mudah diuji.
 * Semua ID (subtopic/topic) diperlakukan sebagai string, karena `pg`
 * mengembalikan BIGINT sebagai string.
 */

const clamp = (n) => Math.min(C.RR_MAX, Math.max(C.RR_MIN, n));

// Persentase dari poin, dibulatkan, minimal 1 agar soal berpoin kecil tetap berdampak
const pct = (poin, rate) => (poin > 0 ? Math.max(1, Math.round(poin * rate)) : 0);

/**
 * Aturan 1 & 2: hitung delta RR untuk satu jawaban.
 *  - benar : +poin_reward (+20% jika durasi < 50% target dan bukan tebakan)
 *  - salah : -20% dari poin_reward
 */
function scoreAnswer({ isCorrect, durasi, targetWaktu, poinReward }) {
  const isFlaggedGuess = durasi < targetWaktu * C.GUESS_THRESHOLD;
  const isSpeedBonus =
    isCorrect && !isFlaggedGuess && durasi < targetWaktu * C.SPEED_BONUS_THRESHOLD;

  const delta = isCorrect
    ? poinReward + (isSpeedBonus ? pct(poinReward, C.SPEED_BONUS_RATE) : 0)
    : -pct(poinReward, C.WRONG_PENALTY_RATE);

  return { delta, isSpeedBonus, isFlaggedGuess };
}

/**
 * Aturan 3: terapkan delta ke satu bar RR + mesin Strike.
 *  - Salah saat RR = 0                      -> Strike 1 (RR tetap 0)
 *  - Salah saat Strike 1 dan RR < 10        -> Strike 2 (pemanggil melakukan demosi)
 *  - selain itu                             -> RR berubah biasa (dijepit 0..100)
 * `state` dimutasi. Strike tidak di-reset saat jawaban benar (PRD tidak mengatur).
 */
function applyRr(state, rrKey, delta, isCorrect) {
  const rrBefore = state[rrKey];
  let strike2 = false;
  let strike1 = false;

  if (isCorrect) {
    state[rrKey] = clamp(rrBefore + delta);
  } else if (state.strike_count === 0 && rrBefore <= C.STRIKE_AT_RR) {
    state.strike_count = 1;
    strike1 = true;
  } else if (state.strike_count === 1 && rrBefore < C.STRIKE2_BELOW_RR) {
    strike2 = true;
  } else {
    state[rrKey] = clamp(rrBefore + delta);
  }

  return { rrBefore, strike2, strike1, strikeAfter: strike2 ? 2 : state.strike_count };
}

// Perbarui hitungan subtopik per level ketika satu subtopik berpindah level
function adjustCounts(c, from, to) {
  if (from < 2 && to >= 2) c.at2plus += 1;
  if (from >= 2 && to < 2) c.at2plus -= 1;
  if (from < 3 && to === 3) c.at3 += 1;
  if (from === 3 && to < 3) c.at3 -= 1;
}

/**
 * calculateSessionRR — memproses seluruh jawaban satu sesi secara berurutan.
 *
 * @param {object} p
 * @param {Array}  p.answers  urut menurut `urutan`; tiap item:
 *   { urutan, questionId, topicId, levelSoal, targetWaktu, poinReward,
 *     durasi, isCorrect, subtopicIds: string[] }
 * @param {Map<string,{current_level,rank_rating,strike_count}>} p.subtopicState
 * @param {Map<string,{is_elite,elite_rr,strike_count,level3_unlocked,cooldown_until}>} p.topicState
 * @param {Map<string,{total,at2plus,at3}>} [p.topicCounts]  sebaran level subtopik per topik
 * @param {Date} p.now  waktu acuan (pakai waktu DB)
 * @returns {{results, logs, subtopicUpdates, topicUpdates, totalRrDelta}}
 */
function calculateSessionRR({ answers, subtopicState, topicState, topicCounts = new Map(), now }) {
  const subs = new Map([...subtopicState].map(([k, v]) => [k, { ...v }]));
  const tops = new Map([...topicState].map(([k, v]) => [k, { ...v }]));
  // topicCounts: topicId -> { total, at2plus, at3 } = jumlah subtopik aktif di topik itu
  // (seluruhnya, bukan hanya yang ada di sesi) pada awal sesi
  const counts = new Map([...topicCounts].map(([k, v]) => [k, { ...v }]));
  const countsOf = (tid) => {
    if (!counts.has(tid)) counts.set(tid, { total: 0, at2plus: 0, at3: 0 });
    return counts.get(tid);
  };

  const touchedSubs = new Set();
  const touchedTops = new Set();
  const cooldownTopics = new Set();
  const wrongStreak = new Map(); // topicId -> jumlah salah beruntun
  const lockedTopics = new Set(); // topik yang sedang cooldown

  for (const [tid, t] of tops) {
    if (t.cooldown_until && new Date(t.cooldown_until) > now) lockedTopics.add(tid);
  }

  const results = [];
  const logs = [];
  let totalRrDelta = 0;

  for (const a of answers) {
    const { delta, isSpeedBonus, isFlaggedGuess } = scoreAnswer(a);
    const res = {
      urutan: a.urutan,
      questionId: a.questionId,
      rrDelta: 0,
      isSpeedBonus,
      isFlaggedGuess,
      efek: 'diterapkan', // 'diterapkan' | 'cooldown' | 'diabaikan'
    };
    results.push(res);

    const tid = a.topicId;

    // Topik terkunci cooldown: jawaban tetap dicatat, tetapi RR tidak berubah
    if (lockedTopics.has(tid)) {
      res.efek = 'cooldown';
      res.isSpeedBonus = false;
      continue;
    }

    const topic = tops.get(tid);
    let strike2 = false;
    // Perubahan RR yang benar-benar terjadi. Strike 1 (salah saat RR 0) tidak mengurangi RR, jadi 0.
    let efektif = delta;
    let kenaStrike = 0;

    if (a.levelSoal === 4) {
      // Level 4 hanya memengaruhi RR topik, dan hanya untuk topik Elite
      if (!topic.is_elite) {
        res.efek = 'diabaikan';
        res.isSpeedBonus = false;
        continue;
      }
      const r = applyRr(topic, 'elite_rr', delta, a.isCorrect);
      if (r.strike1) {
        efektif = 0;
        kenaStrike = 1;
      }
      if (r.strike2) {
        topic.is_elite = false; // keluar dari Elite
        topic.elite_rr = 0;
        topic.strike_count = 0;
        strike2 = true;
      }
      touchedTops.add(tid);
      logs.push({
        urutan: a.urutan,
        subtopicId: null,
        topicId: tid,
        levelBefore: 4,
        levelAfter: r.strike2 ? 3 : 4,
        rrBefore: r.rrBefore,
        rrAfter: topic.elite_rr,
        strikeAfter: r.strikeAfter,
      });
    } else {
      // Level 1-3: tiap subtopik yang diikat dihitung dengan nilai penuh
      if (!a.subtopicIds.length) {
        throw new Error(`Soal ${a.questionId} (level ${a.levelSoal}) tidak punya subtopik`);
      }
      let jumlahStrike1 = 0;
      for (const sid of a.subtopicIds) {
        const st = subs.get(sid);
        if (!st) throw new Error(`State mastery subtopik ${sid} tidak ditemukan`);

        const levelBefore = st.current_level;
        const r = applyRr(st, 'rank_rating', delta, a.isCorrect);
        if (r.strike1) jumlahStrike1 += 1;

        if (r.strike2) {
          if (st.current_level > C.LEVEL_MIN) {
            st.current_level -= 1;
            st.rank_rating = C.DEMOTION_START_RR;
          } else {
            st.rank_rating = C.RR_MIN; // sudah di Level 1, tidak bisa turun lagi
          }
          st.strike_count = 0;
          strike2 = true;
        } else if (
          a.isCorrect &&
          st.rank_rating >= C.RR_MAX &&
          st.current_level < C.LEVEL_MAX &&
          // L2 -> L3 tertahan di 100 RR selama Level 3 topik belum terbuka
          !(st.current_level === 2 && !topic.level3_unlocked)
        ) {
          st.current_level += 1;
          st.rank_rating = C.PROMOTION_START_RR;
          st.strike_count = 0;
        }

        if (st.current_level !== levelBefore) adjustCounts(countsOf(tid), levelBefore, st.current_level);
        // Gerbang & Elite juga dicek pada jawaban benar: topik hasil kalibrasi (semua Level 3)
        // baru masuk Elite lewat permainan ranked, bukan lewat kalibrasi itu sendiri
        if (st.current_level !== levelBefore || a.isCorrect) {
          const c = countsOf(tid);
          if (!topic.level3_unlocked && c.total > 0 && c.at2plus >= c.total * C.LEVEL3_UNLOCK_RATIO) {
            topic.level3_unlocked = true; // sekali terbuka tidak dikunci kembali
            touchedTops.add(tid);
          }
          if (!topic.is_elite && c.total > 0 && c.at3 === c.total) {
            topic.is_elite = true; // semua subtopik Level 3 -> masuk Elite
            topic.elite_rr = C.ELITE_START_RR;
            topic.strike_count = 0;
            touchedTops.add(tid);
          }
        }

        touchedSubs.add(sid);
        logs.push({
          urutan: a.urutan,
          subtopicId: sid,
          topicId: tid,
          levelBefore,
          levelAfter: st.current_level,
          rrBefore: r.rrBefore,
          rrAfter: st.rank_rating,
          strikeAfter: r.strikeAfter, // bernilai 2 pada kejadian demosi
        });
      }
      if (jumlahStrike1 > 0) {
        kenaStrike = 1;
        // semua subtopik hanya kena Strike 1 -> tidak ada RR yang berubah
        if (jumlahStrike1 === a.subtopicIds.length) efektif = 0;
      }
    }

    res.rrDelta = efektif;
    res.kenaStrike = strike2 ? 2 : kenaStrike;
    totalRrDelta += efektif;

    // Aturan 4: cooldown jika Strike 2 ATAU 5 salah beruntun pada topik yang sama
    const streak = a.isCorrect ? 0 : (wrongStreak.get(tid) || 0) + 1;
    wrongStreak.set(tid, streak);

    if (strike2 || streak >= C.CONSECUTIVE_WRONG_COOLDOWN) {
      cooldownTopics.add(tid);
      lockedTopics.add(tid);
      touchedTops.add(tid);
      wrongStreak.set(tid, 0);
    }
  }

  return {
    results,
    logs,
    totalRrDelta,
    subtopicUpdates: [...touchedSubs].map((id) => ({ subtopicId: id, ...subs.get(id) })),
    topicUpdates: [...touchedTops].map((id) => ({
      topicId: id,
      ...tops.get(id),
      cooldownTriggered: cooldownTopics.has(id),
    })),
  };
}

module.exports = { calculateSessionRR, scoreAnswer, applyRr };
