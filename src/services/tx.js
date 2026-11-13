'use strict';

const { HttpError } = require('../errors');

/**
 * Jalankan fn(client) dalam satu transaksi: BEGIN -> fn -> COMMIT, ROLLBACK jika gagal.
 */
async function withTx(pool, fn) {
  const client = await pool.connect();
  let releaseErr;
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = '10s'`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[tx] ROLLBACK gagal:', rollbackErr);
      releaseErr = rollbackErr; // koneksi dibuang dari pool
    }
    if (err && err.code === '23505') {
      throw new HttpError(409, 'DUPLIKAT', 'Data sudah tercatat');
    }
    throw err;
  } finally {
    client.release(releaseErr);
  }
}

/** Kunci advisory selama transaksi, mencegah dua request "mulai" berjalan bersamaan. */
async function advisoryLock(client, key) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [key]);
}

module.exports = { withTx, advisoryLock };
