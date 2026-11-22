'use strict';

const express = require('express');
const pool = require('../db');
const { HttpError } = require('../errors');
const svc = require('../services/adminService');
const soalSvc = require('../services/adminSoalService');
const lembagaSvc = require('../services/lembagaService');
const persetujuanSvc = require('../services/persetujuanService');
const { requireSuper } = require('../middleware/admin');

const router = express.Router();

const ID_RE = /^[1-9]\d{0,17}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idSoal = (v) => {
  if (!ID_RE.test(String(v))) throw new HttpError(422, 'VALIDATION_ERROR', 'id soal tidak valid');
  return String(v);
};

// Dibungkus agar galat async diteruskan ke penangan galat Express.
const jalan = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

router.get('/ringkasan', jalan(async (req, res) => res.json(await svc.ringkasan(pool, req.admin))));

router.get('/laporan', requireSuper, jalan(async (req, res) => {
  res.json({ soal: await svc.daftarLaporan(pool, { semua: req.query.status === 'semua' }) });
}));

router.get('/laporan/:id', requireSuper, jalan(async (req, res) => {
  res.json(await svc.detailLaporan(pool, idSoal(req.params.id)));
}));

router.post('/laporan/:id/tindak', requireSuper, jalan(async (req, res) => {
  res.json(await svc.tindakLaporan(pool, idSoal(req.params.id), svc.parseTindak(req.body)));
}));

router.get('/siswa', jalan(async (req, res) => res.json({ siswa: await svc.daftarSiswa(pool, req.admin) })));

router.get('/siswa/:id', jalan(async (req, res) => {
  if (!UUID_RE.test(req.params.id)) throw new HttpError(422, 'VALIDATION_ERROR', 'id siswa tidak valid');
  res.json(await svc.detailSiswa(pool, req.params.id, req.admin));
}));

router.get('/bank-soal', jalan(async (req, res) => res.json({ subtopik: await svc.bankSoal(pool) })));

// ---------- Input dan edit soal ----------

// Isi berkas (docx / gambar) dikirim apa adanya sebagai badan permintaan.
const berkasMentah = (batas) => express.raw({ type: () => true, limit: batas });
const flag = (v) => v === '1' || v === 'true';

router.get('/pilihan', jalan(async (req, res) => res.json({ subtes: await soalSvc.pilihan(pool) })));

router.post('/impor/docx', berkasMentah('30mb'), jalan(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'BAD_REQUEST', 'Berkas .docx kosong');
  res.json(await soalSvc.imporDocx(pool, req.body, { tulis: flag(req.query.tulis), lewatiBertanda: flag(req.query.lewati_bertanda), admin: req.admin }));
}));

router.post('/gambar', berkasMentah('6mb'), jalan(async (req, res) => res.json(await soalSvc.unggahGambar(req.body))));

router.post('/soal', jalan(async (req, res) => res.status(201).json(await soalSvc.buatSoal(pool, req.body, req.admin))));

router.get('/soal/:id', jalan(async (req, res) => res.json(await soalSvc.ambilSoal(pool, idSoal(req.params.id), req.admin))));

router.put('/soal/:id', jalan(async (req, res) => res.json(await soalSvc.ubahSoal(pool, idSoal(req.params.id), req.body, req.admin))));

// ---------- Antrean persetujuan soal lembaga ----------

router.get('/soal-lembaga', jalan(async (req, res) => {
  res.json({ soal: await persetujuanSvc.antrean(pool, req.admin, { status: req.query.status }) });
}));

router.post('/persetujuan', requireSuper, jalan(async (req, res) => {
  res.json(await persetujuanSvc.putuskan(pool, persetujuanSvc.parsePutusan(req.body)));
}));

// ---------- Lembaga mitra (super admin) ----------

const idLembaga = (v) => {
  if (!ID_RE.test(String(v))) throw new HttpError(422, 'VALIDATION_ERROR', 'id lembaga tidak valid');
  return String(v);
};

router.get('/lembaga', requireSuper, jalan(async (req, res) => res.json({ lembaga: await lembagaSvc.daftarLembaga(pool) })));
router.post('/lembaga', requireSuper, jalan(async (req, res) => res.status(201).json(await lembagaSvc.buatLembaga(pool, req.body))));
router.patch('/lembaga/:id', requireSuper, jalan(async (req, res) => res.json(await lembagaSvc.ubahLembaga(pool, idLembaga(req.params.id), req.body))));
router.post('/lembaga/:id/admin', requireSuper, jalan(async (req, res) => res.status(201).json(await lembagaSvc.tambahAdmin(pool, idLembaga(req.params.id), req.body))));
router.delete('/lembaga/:id/admin/:studentId', requireSuper, jalan(async (req, res) => {
  if (!UUID_RE.test(req.params.studentId)) throw new HttpError(422, 'VALIDATION_ERROR', 'id akun tidak valid');
  res.json(await lembagaSvc.cabutAdmin(pool, idLembaga(req.params.id), req.params.studentId));
}));

module.exports = router;
