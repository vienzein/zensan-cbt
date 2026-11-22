'use strict';

const express = require('express');
const pool = require('../db');
const { HttpError } = require('../errors');
const { parseCurriculumBody } = require('../validators/curriculum');
const { getMe, setActiveTest } = require('../services/readService');
const { gabungLembaga, keluarLembaga } = require('../services/lembagaService');
const { profilSiswa } = require('../services/profilService');

const router = express.Router();

const needStudent = (req) => {
  const id = req.user && req.user.id;
  if (!id) throw new HttpError(401, 'UNAUTHORIZED', 'Harus login');
  return id;
};

router.get('/', async (req, res, next) => {
  try {
    res.json(await getMe(pool, needStudent(req)));
  } catch (err) {
    next(err);
  }
});

/** GET /api/me/profil — profil pencapaian (level & RR, grafik, streak, lencana, rekomendasi) */
router.get('/profil', async (req, res, next) => {
  try {
    res.json(await profilSiswa(pool, needStudent(req)));
  } catch (err) {
    next(err);
  }
});

/** PUT /api/me/tes  { "curriculum_group_id": 1 } */
router.put('/tes', async (req, res, next) => {
  try {
    const studentId = needStudent(req);
    const { curriculumGroupId } = parseCurriculumBody(req.body);
    res.json(await setActiveTest(pool, studentId, curriculumGroupId));
  } catch (err) {
    next(err);
  }
});

/** POST /api/me/lembaga  { "kode": "K7M2PQ9X" } — gabung ke lembaga lewat kode undangan */
router.post('/lembaga', async (req, res, next) => {
  try {
    res.json(await gabungLembaga(pool, needStudent(req), req.body));
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/me/lembaga — keluar dari lembaga */
router.delete('/lembaga', async (req, res, next) => {
  try {
    res.json(await keluarLembaga(pool, needStudent(req)));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
