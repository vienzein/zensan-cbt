import { supabase } from './supabase.js';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Semua panggilan ke server membawa token login (Bearer). Respons error dari server berbentuk
// { error: { code, message } }.
async function panggil(method, path, body, berkas) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api${path}`, {
    method,
    cache: 'no-store',
    headers: {
      // berkas (docx / gambar) dikirim apa adanya; selain itu JSON
      'Content-Type': berkas ? 'application/octet-stream' : 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: berkas || (body === undefined ? undefined : JSON.stringify(body)),
  });
  const teks = await res.text();
  let json = null;
  try {
    json = teks ? JSON.parse(teks) : null;
  } catch {
    /* respons bukan JSON */
  }
  if (!res.ok) {
    const e = json?.error;
    throw new ApiError(res.status, e?.code || 'ERROR', e?.message || `Permintaan gagal (${res.status})`, e?.details);
  }
  return json;
}

export const api = {
  me: () => panggil('GET', '/me'),
  pilihTes: (id) => panggil('PUT', '/me/tes', { curriculum_group_id: id }),
  daftarTes: async () => (await panggil('GET', '/kurikulum')).tes,
  beranda: (id) => panggil('GET', `/kurikulum/${id}/beranda`),
  alasanLapor: () => panggil('GET', '/soal/alasan-lapor'),
  laporSoal: (body) => panggil('POST', '/soal/lapor', body),
  adminRingkasan: () => panggil('GET', '/admin/ringkasan'),
  adminLaporan: (semua) => panggil('GET', `/admin/laporan${semua ? '?status=semua' : ''}`),
  adminLaporanDetail: (id) => panggil('GET', `/admin/laporan/${id}`),
  adminTindak: (id, body) => panggil('POST', `/admin/laporan/${id}/tindak`, body),
  adminSiswa: () => panggil('GET', '/admin/siswa'),
  adminSiswaDetail: (id) => panggil('GET', `/admin/siswa/${id}`),
  adminPilihan: () => panggil('GET', '/admin/pilihan'),
  adminImporDocx: (file, { tulis, lewatiBertanda }) =>
    panggil('POST', `/admin/impor/docx?tulis=${tulis ? 1 : 0}&lewati_bertanda=${lewatiBertanda ? 1 : 0}`, undefined, file),
  adminUnggahGambar: (file) => panggil('POST', '/admin/gambar', undefined, file),
  adminBuatSoal: (body) => panggil('POST', '/admin/soal', body),
  adminSoal: (id) => panggil('GET', `/admin/soal/${id}`),
  adminUbahSoal: (id, body) => panggil('PUT', `/admin/soal/${id}`, body),
  adminBankSoal: () => panggil('GET', '/admin/bank-soal'),
  mulaiDrill: (body) => panggil('POST', '/drill/start', body),
  jawabDrill: (body) => panggil('POST', '/drill/jawab', body),
  kirimDrill: (body) => panggil('POST', '/drill/submit', body),
  mulaiDomain0: (id) => panggil('POST', '/domain0/start', { curriculum_group_id: id }),
  kirimDomain0: (body) => panggil('POST', '/domain0/submit', body),
  daftarStage: (id) => panggil('GET', `/domain0/stages?curriculum_group_id=${id}`),
  mulaiStage: (id) => panggil('POST', '/domain0/stage/start', { curriculum_group_id: id }),
  kirimStage: (body) => panggil('POST', '/domain0/stage/submit', body),
};
