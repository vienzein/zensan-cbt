'use strict';

const { HttpError } = require('../errors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pemeriksa token Supabase.
 *  - SUPABASE_JWT_SECRET terisi  -> kunci legacy (HS256)
 *  - kosong                      -> kunci asimetris, diambil dari JWKS milik project
 * Hanya memeriksa keaslian token; password siswa tidak pernah lewat server ini.
 */
function buildDefaultVerifier(env = process.env) {
  const jose = require('jose');
  const base = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!base) throw new Error('SUPABASE_URL belum diisi di .env');
  const issuer = `${base}/auth/v1`;

  let key;
  let algorithms;
  if (env.SUPABASE_JWT_SECRET) {
    key = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
    algorithms = ['HS256'];
  } else {
    key = jose.createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    algorithms = ['ES256', 'RS256'];
  }

  return async (token) => {
    const { payload } = await jose.jwtVerify(token, key, {
      issuer,
      audience: 'authenticated',
      algorithms,
    });
    return payload;
  };
}

/**
 * Middleware login: memeriksa header "Authorization: Bearer <token>", mencari (atau membuat pada
 * login pertama) baris siswa, lalu mengisi req.user = { id: students.id, authUserId }.
 */
function createAuth({ pool, verifyToken, cacheMax = 5000 }) {
  const verify = verifyToken || buildDefaultVerifier();
  const cache = new Map(); // auth_user_id -> students.id

  async function studentIdFor(authUserId, payload) {
    if (cache.has(authUserId)) return cache.get(authUserId);

    const found = await pool.query('SELECT id FROM students WHERE auth_user_id = $1', [authUserId]);
    let id = found.rows[0] && found.rows[0].id;

    if (!id) {
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
      if (!email) throw new HttpError(401, 'TOKEN_TIDAK_VALID', 'Token tidak memuat email');
      const meta = payload.user_metadata || {};
      const nama = String(meta.nama || meta.full_name || meta.name || email.split('@')[0]).slice(0, 120);

      try {
        const ins = await pool.query(
          `INSERT INTO students (email, nama, auth_user_id) VALUES ($1, $2, $3)
           ON CONFLICT (auth_user_id) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id
           RETURNING id`,
          [email, nama, authUserId],
        );
        id = ins.rows[0].id;
      } catch (err) {
        if (err && err.code === '23505') {
          // email sudah dipakai baris siswa lain yang belum terhubung ke akun ini
          throw new HttpError(409, 'EMAIL_SUDAH_TERDAFTAR', 'Email ini sudah terdaftar pada akun siswa lain');
        }
        throw err;
      }
    }

    if (cache.size >= cacheMax) cache.clear();
    cache.set(authUserId, id);
    return id;
  }

  return async function requireAuth(req, res, next) {
    try {
      const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
      if (!m) throw new HttpError(401, 'UNAUTHORIZED', 'Token login tidak ditemukan');

      let payload;
      try {
        payload = await verify(m[1]);
      } catch {
        throw new HttpError(401, 'TOKEN_TIDAK_VALID', 'Token login tidak valid atau kedaluwarsa');
      }

      const authUserId = payload && payload.sub;
      if (typeof authUserId !== 'string' || !UUID_RE.test(authUserId)) {
        throw new HttpError(401, 'TOKEN_TIDAK_VALID', 'Token login tidak valid');
      }

      req.user = { id: await studentIdFor(authUserId, payload), authUserId };
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { createAuth, buildDefaultVerifier };
