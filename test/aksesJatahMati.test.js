'use strict';

// Tanpa WAJIB_BAYAR_CBT (keadaan bawaan): jatah tidak ditegakkan dan database tidak disentuh.
delete process.env.WAJIB_BAYAR_CBT;

const test = require('node:test');
const assert = require('node:assert/strict');
const { createJatahHarian } = require('../src/middleware/akses');
const { jatahHarian } = require('../src/services/aksesService');

const pool = { query: async () => { throw new Error('tidak boleh query'); } };

test('pembatasan mati: middleware jatah langsung lolos', async () => {
  const req = { user: { id: '11111111-1111-1111-1111-111111111111' } };
  const err = await new Promise((resolve) => createJatahHarian({ pool })(req, {}, (e) => resolve(e)));
  assert.equal(err, undefined);
  assert.equal(req.jatahSisa, undefined);
});

test('pembatasan mati: jatahHarian melapor tanpa batas', async () => {
  const j = await jatahHarian(pool, '11111111-1111-1111-1111-111111111111', 'siswa');
  assert.equal(j.tanpa_batas, true);
});
