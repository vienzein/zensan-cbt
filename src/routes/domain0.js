'use strict';

const express = require('express');
const pool = require('../db');
const { HttpError } = require('../errors');
const { parseSubmitBody } = require('../validators/drillSubmit');
const { parseCurriculumBody } = require('../validators/curriculum');
const { startDomain0, submitDomain0 } = require('../services/domain0Service');
const { listStages, startStage, submitStage } = require('../services/stageService');
const { parseStageSubmitBody } = require('../validators/stageSubmit');

const router = express.Router();

const needStudent = (req) => {
  const id = req.user && req.user.id;
  if (!id) throw new HttpError(401, 'UNAUTHORIZED', 'Harus login');
  return id;
};

router.post('/start', async (req, res, next) => {
  try {
    const studentId = needStudent(req);
    res.status(200).json(await startDomain0(pool, studentId, parseCurriculumBody(req.body)));
  } catch (err) {
    next(err);
  }
});

router.post('/submit', async (req, res, next) => {
  try {
    const studentId = needStudent(req);
    res.status(200).json(await submitDomain0(pool, studentId, parseSubmitBody(req.body)));
  } catch (err) {
    next(err);
  }
});

router.get('/stages', async (req, res, next) => {
  try {
    const studentId = needStudent(req);
    const { curriculumGroupId } = parseCurriculumBody({ curriculum_group_id: req.query.curriculum_group_id });
    res.status(200).json(await listStages(pool, studentId, { curriculumGroupId }));
  } catch (err) {
    next(err);
  }
});

router.post('/stage/start', async (req, res, next) => {
  try {
    const studentId = needStudent(req);
    res.status(200).json(await startStage(pool, studentId, parseCurriculumBody(req.body)));
  } catch (err) {
    next(err);
  }
});

router.post('/stage/submit', async (req, res, next) => {
  try {
    const studentId = needStudent(req);
    res.status(200).json(await submitStage(pool, studentId, parseStageSubmitBody(req.body)));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
