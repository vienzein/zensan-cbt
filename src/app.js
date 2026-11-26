'use strict';

const express = require('express');
const pool = require('./db');
const { createAuth } = require('./middleware/auth');
const drillRouter = require('./routes/drill');
const domain0Router = require('./routes/domain0');
const soalRouter = require('./routes/soal');
const tryoutRouter = require('./routes/tryout');
const meRouter = require('./routes/me');
const kurikulumRouter = require('./routes/kurikulum');
const adminRouter = require('./routes/admin');
const { createRequireAdmin } = require('./middleware/admin');
const { createWajibAkses } = require('./middleware/akses');
const pembayaranRouter = require('./routes/pembayaran');
const akses = require('./config/akses');

const app = express();
app.use(express.json({ limit: '100kb' }));

// Data API selalu segar: jangan di-cache browser dan jangan dijawab 304 tanpa isi.
app.set('etag', false);
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Semua endpoint /api wajib login (token Supabase); middleware mengisi req.user.id
app.use('/api', createAuth({ pool }));

// Gerbang akses program 'cbt': aktif hanya bila WAJIB_BAYAR_CBT=1 (lihat src/config/akses.js).
const wajibCbt = createWajibAkses({ pool, kode: akses.PROGRAM_CBT });

app.use('/api/drill', wajibCbt, drillRouter);
app.use('/api/domain0', wajibCbt, domain0Router);
app.use('/api/soal', soalRouter);
app.use('/api/tryout', tryoutRouter);
app.use('/api/me', meRouter);
app.use('/api/pembayaran', pembayaranRouter);
app.use('/api/kurikulum', kurikulumRouter);
app.use('/api/admin', createRequireAdmin({ pool }), adminRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.status) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  if (err instanceof SyntaxError && err.status === 400) {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: 'JSON tidak valid' } });
  }
  console.error('[unhandled]', err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Terjadi kesalahan server' } });
});

module.exports = app;

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`API berjalan di :${port}`));
}
