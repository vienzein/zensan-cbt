'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuth } = require('../src/middleware/auth');

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

// Pool palsu yang meniru dua query di middleware
function fakePool() {
  const rows = [];
  const stats = { select: 0, insert: 0 };
  return {
    rows,
    stats,
    async query(sql, params) {
      if (/^\s*SELECT/i.test(sql)) {
        stats.select += 1;
        return { rows: rows.filter((r) => r.auth_user_id === params[0]).map((r) => ({ id: r.id })) };
      }
      stats.insert += 1;
      const [email, nama, authUserId] = params;
      if (rows.some((r) => r.email === email && r.auth_user_id !== authUserId)) {
        const e = new Error('duplicate key');
        e.code = '23505';
        throw e;
      }
      let row = rows.find((r) => r.auth_user_id === authUserId);
      if (!row) {
        row = { id: `S${rows.length + 1}`, email, nama, auth_user_id: authUserId };
        rows.push(row);
      }
      return { rows: [{ id: row.id }] };
    },
  };
}

const verifierOf = (payloads) => async (token) => {
  if (!(token in payloads)) throw new Error('bad token');
  return payloads[token];
};

async function jalankan(mw, authorization) {
  const req = { headers: authorization ? { authorization } : {} };
  let err;
  let lanjut = false;
  await mw(req, {}, (e) => {
    if (e) err = e;
    else lanjut = true;
  });
  return { req, err, lanjut };
}

test('tanpa header Authorization -> 401', async () => {
  const mw = createAuth({ pool: fakePool(), verifyToken: verifierOf({}) });
  const { err, lanjut } = await jalankan(mw);
  assert.equal(lanjut, false);
  assert.equal(err.status, 401);
  assert.equal(err.code, 'UNAUTHORIZED');
});

test('token tidak valid -> 401 TOKEN_TIDAK_VALID', async () => {
  const mw = createAuth({ pool: fakePool(), verifyToken: verifierOf({}) });
  const { err } = await jalankan(mw, 'Bearer salah');
  assert.equal(err.status, 401);
  assert.equal(err.code, 'TOKEN_TIDAK_VALID');
});

test('login pertama: baris siswa dibuat, req.user.id terisi', async () => {
  const pool = fakePool();
  const mw = createAuth({
    pool,
    verifyToken: verifierOf({ t1: { sub: U1, email: 'Budi@Contoh.com', user_metadata: { nama: 'Budi' } } }),
  });
  const { req, err, lanjut } = await jalankan(mw, 'Bearer t1');
  assert.equal(err, undefined);
  assert.equal(lanjut, true);
  assert.equal(req.user.id, 'S1');
  assert.equal(req.user.authUserId, U1);
  assert.deepEqual([pool.rows[0].email, pool.rows[0].nama], ['budi@contoh.com', 'Budi']);
});

test('nama kosong: dipakai bagian depan email', async () => {
  const pool = fakePool();
  const mw = createAuth({ pool, verifyToken: verifierOf({ t: { sub: U1, email: 'sari@contoh.com' } }) });
  await jalankan(mw, 'Bearer t');
  assert.equal(pool.rows[0].nama, 'sari');
});

test('permintaan berikutnya memakai cache, tidak menyentuh database lagi', async () => {
  const pool = fakePool();
  const mw = createAuth({ pool, verifyToken: verifierOf({ t: { sub: U1, email: 'a@b.com' } }) });
  await jalankan(mw, 'Bearer t');
  const before = { ...pool.stats };
  const { req } = await jalankan(mw, 'Bearer t');
  assert.equal(req.user.id, 'S1');
  assert.deepEqual(pool.stats, before);
});

test('pengguna yang sudah ada di database dikenali tanpa membuat baris baru', async () => {
  const pool = fakePool();
  pool.rows.push({ id: 'S9', email: 'lama@contoh.com', nama: 'Lama', auth_user_id: U2 });
  const mw = createAuth({ pool, verifyToken: verifierOf({ t: { sub: U2, email: 'lama@contoh.com' } }) });
  const { req } = await jalankan(mw, 'Bearer t');
  assert.equal(req.user.id, 'S9');
  assert.equal(pool.stats.insert, 0);
});

test('email sudah dipakai siswa lain -> 409', async () => {
  const pool = fakePool();
  pool.rows.push({ id: 'S1', email: 'sama@contoh.com', nama: 'X', auth_user_id: U1 });
  const mw = createAuth({ pool, verifyToken: verifierOf({ t: { sub: U2, email: 'sama@contoh.com' } }) });
  const { err } = await jalankan(mw, 'Bearer t');
  assert.equal(err.status, 409);
  assert.equal(err.code, 'EMAIL_SUDAH_TERDAFTAR');
});

test('token tanpa email (mis. login anonim) ditolak', async () => {
  const mw = createAuth({ pool: fakePool(), verifyToken: verifierOf({ t: { sub: U1 } }) });
  const { err } = await jalankan(mw, 'Bearer t');
  assert.equal(err.status, 401);
});

test('sub bukan UUID ditolak', async () => {
  const mw = createAuth({ pool: fakePool(), verifyToken: verifierOf({ t: { sub: 'abc', email: 'a@b.com' } }) });
  const { err } = await jalankan(mw, 'Bearer t');
  assert.equal(err.status, 401);
});
