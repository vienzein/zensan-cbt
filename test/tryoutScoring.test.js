'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeTryout } = require('../src/services/tryoutScoring');

const subjectOfTopic = new Map([['T1', 'PK'], ['T2', 'PK'], ['T3', 'PU']]);
const totalBySubject = new Map([['PK', 4], ['PU', 2]]);

test('skor per subtes dan total; soal tak terjawab dihitung belum benar', () => {
  const scored = [
    { topicId: 'T1', isCorrect: true },
    { topicId: 'T1', isCorrect: false },
    { topicId: 'T2', isCorrect: true },
    { topicId: 'T3', isCorrect: true },
  ];
  const r = summarizeTryout({ scored, subjectOfTopic, totalBySubject });

  const pk = r.subtes.find((s) => s.subject_id === 'PK');
  assert.deepEqual([pk.benar, pk.dijawab, pk.total, pk.persen], [2, 3, 4, 50]);
  const pu = r.subtes.find((s) => s.subject_id === 'PU');
  assert.deepEqual([pu.benar, pu.dijawab, pu.total, pu.persen], [1, 1, 2, 50]);
  assert.deepEqual(r.skor, { benar: 3, total: 6, persen: 50 });
});

test('akurasi per topik', () => {
  const scored = [
    { topicId: 'T1', isCorrect: true },
    { topicId: 'T1', isCorrect: false },
  ];
  const t = summarizeTryout({ scored, subjectOfTopic, totalBySubject }).topik;
  assert.deepEqual(t, [{ topic_id: 'T1', benar: 1, dijawab: 2 }]);
});

test('tanpa jawaban sama sekali: skor 0', () => {
  const r = summarizeTryout({ scored: [], subjectOfTopic, totalBySubject });
  assert.equal(r.skor.benar, 0);
  assert.equal(r.skor.persen, 0);
});
