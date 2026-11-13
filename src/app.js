'use strict';

const express = require('express');
const drillRouter = require('./routes/drill');
const domain0Router = require('./routes/domain0');
const tryoutRouter = require('./routes/tryout');

const app = express();
app.use(express.json({ limit: '100kb' }));

// TODO: pasang middleware autentikasi Anda di sini; ia harus mengisi req.user = { id: <uuid students.id> }
// app.use('/api', requireAuth);

app.use('/api/drill', drillRouter);
app.use('/api/domain0', domain0Router);
app.use('/api/tryout', tryoutRouter);

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
