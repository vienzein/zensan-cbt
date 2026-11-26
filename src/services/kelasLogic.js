'use strict';

const { HttpError } = require('../errors');

const MAKS_DURASI_MS = 12 * 60 * 60 * 1000; // satu sesi paling lama 12 jam
const KODE_PROGRAM_RE = /^[a-z0-9][a-z0-9-]{1,29}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const bad = (pesan, details) => new HttpError(422, 'VALIDATION_ERROR', pesan, details);
const teks = (v) => String(v ?? '').trim().replace(/[ \t]+/g, ' ');

/** Hanya tautan Google Meet (https://meet.google.com/...). Mengembalikan tautan yang sudah dirapikan. */
function parseLinkMeet(raw) {
  const v = teks(raw);
  let u;
  try {
    u = new URL(v);
  } catch {
    throw bad('Link Google Meet tidak valid', ['link_meet harus berupa alamat lengkap, misalnya https://meet.google.com/abc-defg-hij']);
  }
  if (u.protocol !== 'https:' || u.hostname !== 'meet.google.com' || u.pathname.length < 4) {
    throw bad('Link harus dari Google Meet', ['link_meet harus diawali https://meet.google.com/']);
  }
  return u.toString();
}

function parseWaktu(raw, nama) {
  const d = new Date(raw);
  if (!raw || Number.isNaN(d.getTime())) throw bad(`${nama} tidak valid`, [`${nama} harus berupa waktu ISO, misalnya 2026-11-29T15:00:00+07:00`]);
  return d;
}

/** Validasi badan tambah/ubah kelas. { programKode, judul, deskripsi, pengajar, mulai, selesai, linkMeet } */
function parseKelas(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'BAD_REQUEST', 'Body harus berupa JSON object');
  const errors = [];
  const programKode = teks(body.program_kode);
  const judul = teks(body.judul);
  const deskripsi = String(body.deskripsi ?? '').trim();
  const pengajar = teks(body.pengajar);
  if (!KODE_PROGRAM_RE.test(programKode)) errors.push('program_kode wajib diisi');
  if (judul.length < 3 || judul.length > 160) errors.push('judul harus 3-160 karakter');
  if (deskripsi.length > 2000) errors.push('deskripsi maksimal 2000 karakter');
  if (pengajar.length > 120) errors.push('pengajar maksimal 120 karakter');
  if (errors.length) throw bad('Data kelas tidak valid', errors);

  const mulai = parseWaktu(body.mulai_pada, 'mulai_pada');
  const selesai = parseWaktu(body.selesai_pada, 'selesai_pada');
  if (selesai <= mulai) throw bad('Jam selesai harus setelah jam mulai');
  if (selesai - mulai > MAKS_DURASI_MS) throw bad('Satu sesi maksimal 12 jam');
  const linkMeet = parseLinkMeet(body.link_meet);
  return { programKode, judul, deskripsi, pengajar: pengajar || null, mulai, selesai, linkMeet };
}

/** Status sesi terhadap waktu `sekarang`: 'berlangsung' | 'segera' (<= 15 menit lagi) | 'akan_datang' | 'selesai'. */
function statusKelas(mulai, selesai, sekarang = new Date()) {
  const now = new Date(sekarang).getTime();
  const m = new Date(mulai).getTime();
  const s = new Date(selesai).getTime();
  if (now >= s) return 'selesai';
  if (now >= m) return 'berlangsung';
  if (m - now <= 15 * 60 * 1000) return 'segera';
  return 'akan_datang';
}

/** Validasi program baru / perubahan program. Pada ubah, kode tidak dipakai. */
function parseProgram(body, { baru }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'BAD_REQUEST', 'Body harus berupa JSON object');
  const errors = [];
  const out = {};
  if (baru) {
    out.kode = teks(body.kode).toLowerCase();
    if (!KODE_PROGRAM_RE.test(out.kode)) errors.push('kode harus 2-30 karakter: huruf kecil, angka, atau tanda hubung');
  }
  if (baru || body.nama !== undefined) {
    out.nama = teks(body.nama);
    if (out.nama.length < 3 || out.nama.length > 120) errors.push('nama harus 3-120 karakter');
  }
  if (body.deskripsi !== undefined) {
    out.deskripsi = String(body.deskripsi).trim();
    if (out.deskripsi.length > 500) errors.push('deskripsi maksimal 500 karakter');
  }
  if (baru || body.harga_rupiah !== undefined) {
    out.hargaRupiah = Number(body.harga_rupiah ?? 0);
    if (!Number.isInteger(out.hargaRupiah) || out.hargaRupiah < 0 || out.hargaRupiah > 100000000) errors.push('harga_rupiah harus bilangan bulat 0-100.000.000 (0 = belum ditetapkan)');
  }
  if (baru || body.durasi_hari !== undefined) {
    const d = body.durasi_hari;
    out.durasiHari = d === null || d === '' || d === undefined ? null : Number(d);
    if (out.durasiHari !== null && (!Number.isInteger(out.durasiHari) || out.durasiHari < 1 || out.durasiHari > 3650)) errors.push('durasi_hari harus 1-3650, atau kosong untuk tanpa batas');
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') errors.push('is_active harus true atau false');
    else out.isActive = body.is_active;
  }
  if (errors.length) throw bad('Data program tidak valid', errors);
  return out;
}

/** Validasi pemberian akses manual { email, program_kode, hari? }. hari kosong = ikut durasi program. */
function parseBeriAkses(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'BAD_REQUEST', 'Body harus berupa JSON object');
  const errors = [];
  const email = teks(body.email).toLowerCase();
  const programKode = teks(body.program_kode);
  let hari = null;
  if (!EMAIL_RE.test(email)) errors.push('email tidak valid');
  if (!KODE_PROGRAM_RE.test(programKode)) errors.push('program_kode wajib diisi');
  if (body.hari !== undefined && body.hari !== null && body.hari !== '') {
    hari = Number(body.hari);
    if (!Number.isInteger(hari) || hari < 1 || hari > 3650) errors.push('hari harus 1-3650, atau kosong untuk mengikuti durasi program');
  }
  if (errors.length) throw bad('Data akses tidak valid', errors);
  return { email, programKode, hari };
}

module.exports = { parseKelas, parseLinkMeet, statusKelas, parseProgram, parseBeriAkses, MAKS_DURASI_MS };
