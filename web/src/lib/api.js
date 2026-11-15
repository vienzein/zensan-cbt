import { supabase } from './supabase.js';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Semua panggilan ke server membawa token login (Bearer). Respons error dari server berbentuk
// { error: { code, message } }.
async function panggil(method, path, body) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api${path}`, {
    method,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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
    throw new ApiError(res.status, e?.code || 'ERROR', e?.message || `Permintaan gagal (${res.status})`);
  }
  return json;
}

export const api = {
  me: () => panggil('GET', '/me'),
  pilihTes: (id) => panggil('PUT', '/me/tes', { curriculum_group_id: id }),
  daftarTes: async () => (await panggil('GET', '/kurikulum')).tes,
  beranda: (id) => panggil('GET', `/kurikulum/${id}/beranda`),
  mulaiDrill: (body) => panggil('POST', '/drill/start', body),
  kirimDrill: (body) => panggil('POST', '/drill/submit', body),
  mulaiDomain0: (id) => panggil('POST', '/domain0/start', { curriculum_group_id: id }),
  kirimDomain0: (body) => panggil('POST', '/domain0/submit', body),
};
