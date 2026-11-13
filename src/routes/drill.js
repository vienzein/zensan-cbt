'use strict';

const express = require('express');
const pool = require('../db');
const { HttpError } = require('../errors');
const { parseSubmitBody } = require('../validators/drillSubmit');
const { submitDrill } = require('../services/drillSubmitService');
const { parseStartBody } = require('../validators/drillStart');
const { startDrill } = require('../services/drillStartService');

const router = express.Router();

/** POST /api/drill/start — pilih soal di server, buat attempt. */
router.post('/start', async (req, res, next) => {
  try {
    const studentId = req.user && req.user.id;
    if (!studentId) throw new HttpError(401, 'UNAUTHORIZED', 'Harus login');

    const payload = parseStartBody(req.body);
    const result = await startDrill(pool, studentId, payload);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/drill/submit
 * student_id SELALU diambil dari sesi login (req.user.id), bukan dari body.
 */
router.post('/submit', async (req, res, next) => {
  try {
    const studentId = req.user && req.user.id;
    if (!studentId) throw new HttpError(401, 'UNAUTHORIZED', 'Harus login');

    const payload = parseSubmitBody(req.body);
    const result = await submitDrill(pool, studentId, payload);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
