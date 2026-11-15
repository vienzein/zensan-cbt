'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseStartBody } = require('../src/validators/drillStart');

const dasar = { subject_id: 3, topic_ids: [12] };

test('jumlah_soal 1 sampai 10 diterima', () => {
  for (const n of [1, 2, 5, 7, 10]) {
    assert.equal(parseStartBody({ ...dasar, jumlah_soal: n }).jumlahSoal, n);
  }
});

test('jumlah_soal di luar 1-10 atau bukan bilangan bulat ditolak (422)', () => {
  for (const n of [0, 11, 20, 30, -1, 2.5, '5', null, undefined]) {
    assert.throws(
      () => parseStartBody({ ...dasar, jumlah_soal: n }),
      (e) => e.status === 422 && e.code === 'VALIDATION_ERROR',
      `jumlah_soal ${String(n)} seharusnya ditolak`,
    );
  }
});
