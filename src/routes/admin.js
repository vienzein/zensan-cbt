'use strict';

const express = require('express');
const pool = require('../db');
const { HttpError } = require('../errors');
const svc = require('../services/adminService');

const router = express.Router();

const ID_RE = /^[1-9]\d{0,17}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idSoal = (v) => {
  if (!ID_RE.test(String(v))) throw new HttpError(422, 'VALIDATION_ERROR', 'id soal tidak valid');
  return String(v);
};

// Dibungkus agar galat async diteruskan ke penangan galat Express.
const jalan = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

router.get('/ringkasan', jalan(async (req, res) => res.json(await svc.ringkasan(pool))));

router.get('/laporan', jalan(async (req, res) => {
  res.json({ soal: await svc.daftarLaporan(pool, { semua: req.query.status === 'semua' }) });
}));

router.get('/laporan/:id', jalan(async (req, res) => {
  res.json(await svc.detailLaporan(pool, idSoal(req.params.id)));
}));

router.post('/laporan/:id/tindak', jalan(async (req, res) => {
  res.json(await svc.tindakLaporan(pool, idSoal(req.params.id), svc.parseTindak(req.body)));
}));

router.get('/siswa', jalan(async (req, res) => res.json({ siswa: await svc.daftarSiswa(pool) })));

router.get('/siswa/:id', jalan(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw new HttpError(422, 'VALIDATION_ERROR', 'id siswa tidak valid');
  res.json(await svc.detailSiswa(pool, req.params.id));
}));

router.get('/bank-soal', jalan(async (req, res) => res.json({ subtopik: await svc.bankSoal(pool) })));

module.exports = router;
