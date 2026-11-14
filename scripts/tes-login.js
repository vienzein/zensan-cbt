'use strict';
// Tes login asli: node --env-file=.env scripts/tes-login.js
// Butuh env: SUPABASE_URL, SUPABASE_ANON_KEY, DATABASE_URL, TEST_EMAIL, TEST_PASSWORD
// TEST_EMAIL / TEST_PASSWORD diisi lewat terminal, jangan disimpan di file.
const { Pool } = require('pg');

const BASE = process.env.API_URL || 'http://localhost:5000';
const need = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'DATABASE_URL', 'TEST_EMAIL', 'TEST_PASSWORD'];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Variabel belum diisi:', missing.join(', '));
  process.exit(1);
}

let ok = 0, gagal = 0;
const cek = (nama, kondisi, info = '') => {
  console.log(`${kondisi ? '✔' : '✘'} ${nama}${info ? ' — ' + info : ''}`);
  kondisi ? ok++ : gagal++;
};

async function panggil(token) {
  const r = await fetch(`${BASE}/api/drill/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: '{}',
  });
  let body = null;
  try { body = await r.json(); } catch (_) {}
  return { status: r.status, code: body && body.error && body.error.code };
}

(async () => {
  // 1. Login ke Supabase
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: process.env.SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD }),
  });
  const sesi = await res.json();
  cek('login Supabase berhasil', res.ok && !!sesi.access_token, res.ok ? '' : (sesi.msg || sesi.error_description || res.status));
  if (!res.ok) return;

  // 2. Tanpa token / token palsu -> 401
  cek('tanpa token ditolak 401', (await panggil(null)).status === 401);
  cek('token palsu ditolak 401', (await panggil('abc.def.ghi')).status === 401);

  // 3. Token asli lolos auth: body kosong harus ditolak validasi (422), bukan 401
  const r = await panggil(sesi.access_token);
  cek('token asli lolos login (422 validasi, bukan 401)', r.status === 422, `status ${r.status} ${r.code || ''}`);

  // 4. Baris siswa terbuat otomatis & terhubung ke akun Supabase
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const q = await pool.query('SELECT id, email FROM students WHERE auth_user_id = $1', [sesi.user.id]);
    cek('baris students terbuat & terhubung auth_user_id', q.rowCount === 1);
    // 5. Panggil kedua: tidak membuat baris duplikat
    await panggil(sesi.access_token);
    const q2 = await pool.query('SELECT count(*)::int AS n FROM students WHERE auth_user_id = $1', [sesi.user.id]);
    cek('login ulang tidak membuat siswa ganda', q2.rows[0].n === 1);
  } finally {
    await pool.end();
  }
})()
  .catch((e) => { console.error('Error:', e.message); gagal++; })
  .finally(() => {
    console.log(`\n${ok} lulus, ${gagal} gagal`);
    process.exit(gagal ? 1 : 0);
  });
