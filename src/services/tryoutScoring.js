'use strict';

/**
 * Ringkasan skor tryout (murni). Tryout tidak mengubah RR; hanya menghasilkan skor.
 * Soal yang tidak dikirim dihitung belum terjawab (masuk total, bukan benar).
 *
 * @param {Array} scored             hasil prepareSubmission ({ topicId, isCorrect })
 * @param {Map<string,string>} subjectOfTopic  topicId -> subjectId
 * @param {Map<string,number>} totalBySubject  subjectId -> jumlah soal sesi
 */
function summarizeTryout({ scored, subjectOfTopic, totalBySubject }) {
  const subtes = new Map();
  for (const [sid, total] of totalBySubject) subtes.set(sid, { subject_id: sid, benar: 0, dijawab: 0, total });

  const topik = new Map();
  for (const a of scored) {
    const sid = subjectOfTopic.get(a.topicId);
    const s = subtes.get(sid);
    if (s) {
      s.dijawab += 1;
      if (a.isCorrect) s.benar += 1;
    }
    if (!topik.has(a.topicId)) topik.set(a.topicId, { topic_id: a.topicId, benar: 0, dijawab: 0 });
    const t = topik.get(a.topicId);
    t.dijawab += 1;
    if (a.isCorrect) t.benar += 1;
  }

  const subtesArr = [...subtes.values()].map((s) => ({
    ...s,
    persen: s.total ? Math.round((s.benar / s.total) * 100) : 0,
  }));
  const total = subtesArr.reduce((n, s) => n + s.total, 0);
  const benar = subtesArr.reduce((n, s) => n + s.benar, 0);

  return {
    skor: { benar, total, persen: total ? Math.round((benar / total) * 100) : 0 },
    subtes: subtesArr,
    topik: [...topik.values()],
  };
}

module.exports = { summarizeTryout };
