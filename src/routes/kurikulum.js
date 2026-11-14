'use strict';

const express = require('express');
const pool = require('../db');
const { HttpError } = require('../errors');
const { listCurricula, getBeranda } = require('../services/readService');

const router = express.Router();
const ID_RE = /^[1-9]\d{0,17}$/;

const needStudent = (req) => {
  const id = req.user && req.user.id;
  if (!id) throw new HttpError(401, 'UNAUTHORIZED', 'Harus login');
  return id;
};

router.get('/', async (req, res, next) => {
  try {
    res.json({ tes: await listCurricula(pool, needStudent(req)) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/beranda', async (req, res, next) => {
  try {
    const studentId = needStudent(req);
    if (!ID_RE.test(req.params.id)) {
      throw new HttpError(422, 'VALIDATION_ERROR', 'ID tes tidak valid');
    }
    res.json(await getBeranda(pool, studentId, req.params.id));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
