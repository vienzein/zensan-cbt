'use strict';

const express = require('express');
const pool = require('../db');
const { HttpError } = require('../errors');
const svc = require('../services/aksesService');

const router = express.Router();

const jalan = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};
const needStudent = (req) => {
  const id = req.user && req.user.id;
  if (!id) throw new HttpError(401, 'UNAUTHORIZED', 'Harus login');
  return id;
};

/** GET /api/pembayaran — riwayat pesanan + petunjuk rekening */
router.get('/', jalan(async (req, res) => res.json(await svc.riwayat(pool, needStudent(req)))));

/** POST /api/pembayaran { program } — buat pesanan (atau ambil pesanan yang masih terbuka) */
router.post('/', jalan(async (req, res) => res.status(201).json(await svc.buatPesanan(pool, needStudent(req), req.body))));

/** POST /api/pembayaran/:id/konfirmasi { nama_pengirim, catatan } — lapor sudah transfer */
router.post('/:id/konfirmasi', jalan(async (req, res) => res.json(await svc.konfirmasiPesanan(pool, needStudent(req), req.params.id, req.body))));

/** POST /api/pembayaran/:id/bukti — badan permintaan = isi foto bukti transfer (PNG/JPG/WEBP, maks 6 MB) */
router.post('/:id/bukti', express.raw({ type: () => true, limit: '7mb' }), jalan(async (req, res) => {
  res.json(await svc.unggahBukti(pool, needStudent(req), req.params.id, req.body));
}));

/** POST /api/pembayaran/:id/batal */
router.post('/:id/batal', jalan(async (req, res) => res.json(await svc.batalkanPesanan(pool, needStudent(req), req.params.id))));

module.exports = router;
