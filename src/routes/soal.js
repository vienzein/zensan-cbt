'use strict';

const express = require('express');
const pool = require('../db');
const { HttpError } = require('../errors');
const { ALASAN } = require('../config/laporanSoal');
const { parseLaporBody } = require('../validators/laporSoal');
const { laporSoal } = require('../services/laporSoalService');

const router = express.Router();

/** GET /api/soal/alasan-lapor — daftar pilihan alasan (kode + label) untuk layar lapor. */
router.get('/alasan-lapor', (req, res) => {
  res.json({ alasan: ALASAN });
});

/** POST /api/soal/lapor — laporkan soal yang pernah muncul di sesi siswa. Body: { question_id, alasan, catatan? } */
router.post('/lapor', async (req, res, next) => {
  try {
    const studentId = req.user && req.user.id;
    if (!studentId) throw new HttpError(401, 'UNAUTHORIZED', 'Harus login');
    res.status(201).json(await laporSoal(pool, studentId, parseLaporBody(req.body)));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
