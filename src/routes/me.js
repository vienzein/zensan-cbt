'use strict';

const express = require('express');
const pool = require('../db');
const { HttpError } = require('../errors');
const { parseCurriculumBody } = require('../validators/curriculum');
const { getMe, setActiveTest } = require('../services/readService');
const { gabungLembaga, keluarLembaga } = require('../services/lembagaService');
const { profilSiswa } = require('../services/profilService');
const { programSiswa } = require('../services/aksesService');
const { kelasSiswa } = require('../services/kelasService');

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

/** GET /api/me/akses — program yang tersedia, status akses siswa, dan apakah wajib bayar */
router.get('/akses', async (req, res, next) => {
  try {
    const id = needStudent(req);
    const me = await getMe(pool, id);
    res.json({ program: await programSiswa(pool, id, me.role) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/me/kelas — kelas online mendatang dari program yang aksesnya aktif */
router.get('/kelas', async (req, res, next) => {
  try {
    res.json({ kelas: await kelasSiswa(pool, needStudent(req)) });
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
