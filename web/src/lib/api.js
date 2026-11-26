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
    // 402 = akses program belum aktif: App mengarahkan siswa ke halaman bayar (lihat App.jsx).
    if (res.status === 402 && e?.code === 'AKSES_DIPERLUKAN') {
      window.dispatchEvent(new CustomEvent('zq-akses', { detail: { program: e.details?.program, alasan: e.details?.alasan } }));
    }
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
  adminLaporanSiswa: () => panggil('GET', '/admin/laporan-siswa'),
  adminSiswaProfil: (id) => panggil('GET', `/admin/siswa/${id}/profil`),
  adminPilihan: () => panggil('GET', '/admin/pilihan'),
  adminImporDocx: (file, { tulis, lewatiBertanda }) =>
    panggil('POST', `/admin/impor/docx?tulis=${tulis ? 1 : 0}&lewati_bertanda=${lewatiBertanda ? 1 : 0}`, undefined, file),
  adminUnggahGambar: (file) => panggil('POST', '/admin/gambar', undefined, file),
  adminBuatSoal: (body) => panggil('POST', '/admin/soal', body),
  adminSoal: (id) => panggil('GET', `/admin/soal/${id}`),
  adminUbahSoal: (id, body) => panggil('PUT', `/admin/soal/${id}`, body),
  adminBankSoal: () => panggil('GET', '/admin/bank-soal'),
  adminSoalLembaga: (status) => panggil('GET', `/admin/soal-lembaga${status ? `?status=${status}` : ''}`),
  adminPutuskan: (body) => panggil('POST', '/admin/persetujuan', body),
  adminLembaga: () => panggil('GET', '/admin/lembaga'),
  adminBuatLembaga: (nama) => panggil('POST', '/admin/lembaga', { nama }),
  adminUbahLembaga: (id, body) => panggil('PATCH', `/admin/lembaga/${id}`, body),
  adminTambahAdmin: (id, email) => panggil('POST', `/admin/lembaga/${id}/admin`, { email }),
  adminCabutAdmin: (id, studentId) => panggil('DELETE', `/admin/lembaga/${id}/admin/${studentId}`),
  profil: () => panggil('GET', '/me/profil'),
  akses: async () => (await panggil('GET', '/me/akses')).program,
  pembayaran: () => panggil('GET', '/pembayaran'),
  buatPesanan: (program) => panggil('POST', '/pembayaran', { program }),
  konfirmasiPesanan: (id, body) => panggil('POST', `/pembayaran/${id}/konfirmasi`, body),
  batalPesanan: (id) => panggil('POST', `/pembayaran/${id}/batal`),
  unggahBukti: (id, berkas) => panggil('POST', `/pembayaran/${id}/bukti`, undefined, berkas),
  adminBuktiUrl: (id) => panggil('GET', `/admin/pembayaran/${id}/bukti`),
  adminPembayaran: (semua) => panggil('GET', `/admin/pembayaran${semua ? '?status=semua' : ''}`),
  kelas: async () => (await panggil('GET', '/me/kelas')).kelas,
  adminKelas: async (semua) => (await panggil('GET', `/admin/kelas${semua ? '?status=semua' : ''}`)).kelas,
  adminBuatKelas: (body) => panggil('POST', '/admin/kelas', body),
  adminUbahKelas: (id, body) => panggil('PUT', `/admin/kelas/${id}`, body),
  adminBatalKelas: (id) => panggil('POST', `/admin/kelas/${id}/batal`),
  adminProgram: async () => (await panggil('GET', '/admin/program')).program,
  adminBuatProgram: (body) => panggil('POST', '/admin/program', body),
  adminUbahProgram: (kode, body) => panggil('PATCH', `/admin/program/${kode}`, body),
  adminBeriAkses: (body) => panggil('POST', '/admin/program/akses', body),
  adminPutuskanBayar: (id, body) => panggil('POST', `/admin/pembayaran/${id}/keputusan`, body),
  gabungLembaga: (kode) => panggil('POST', '/me/lembaga', { kode }),
  keluarLembaga: () => panggil('DELETE', '/me/lembaga'),
  mulaiDrill: (body) => panggil('POST', '/drill/start', body),
  jawabDrill: (body) => panggil('POST', '/drill/jawab', body),
  kirimDrill: (body) => panggil('POST', '/drill/submit', body),
  mulaiDomain0: (id) => panggil('POST', '/domain0/start', { curriculum_group_id: id }),
  kirimDomain0: (body) => panggil('POST', '/domain0/submit', body),
  daftarStage: (id) => panggil('GET', `/domain0/stages?curriculum_group_id=${id}`),
  mulaiStage: (id) => panggil('POST', '/domain0/stage/start', { curriculum_group_id: id }),
  kirimStage: (body) => panggil('POST', '/domain0/stage/submit', body),
};
