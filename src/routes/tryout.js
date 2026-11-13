'use strict';

const express = require('express');
const pool = require('../db');
const { HttpError } = require('../errors');
const { parseSubmitBody } = require('../validators/drillSubmit');
const { parseCurriculumBody } = require('../validators/curriculum');
const { startCalibration, submitCalibration } = require('../services/calibrationService');
const { startTryout, submitTryout } = require('../services/tryoutService');

const router = express.Router();

const needStudent = (req) => {
  const id = req.user && req.user.id;
  if (!id) throw new HttpError(401, 'UNAUTHORIZED', 'Harus login');
  return id;
};

router.post('/start', async (req, res, next) => {
  try {
    const studentId = needStudent(req);
    res.status(200).json(await startTryout(pool, studentId, parseCurriculumBody(req.body)));
  } catch (err) {
    next(err);
  }
});

router.post('/submit', async (req, res, next) => {
  try {
    const studentId = needStudent(req);
    res.status(200).json(await submitTryout(pool, studentId, parseSubmitBody(req.body)));
  } catch (err) {
    next(err);
  }
});

router.post('/kalibrasi/start', async (req, res, next) => {
  try {
    const studentId = needStudent(req);
    res.status(200).json(await startCalibration(pool, studentId, parseCurriculumBody(req.body)));
  } catch (err) {
    next(err);
  }
});

router.post('/kalibrasi/submit', async (req, res, next) => {
  try {
    const studentId = needStudent(req);
    res.status(200).json(await submitCalibration(pool, studentId, parseSubmitBody(req.body)));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
