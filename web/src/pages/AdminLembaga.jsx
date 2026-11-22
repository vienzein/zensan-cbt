import { useState } from 'react';
import { api } from '../lib/api.js';
import { Memuat, Galat } from '../components/Dasar.jsx';
import { useMuat, tgl } from '../components/AdminDasar.jsx';

// Bagian admin yang berkaitan dengan lembaga mitra: antrean persetujuan soal, soal saya (admin lembaga), kelola lembaga (super admin).

const WARNA_STATUS = {
  menunggu: 'bg-card-2 text-aksen',
  disetujui: 'bg-lime/15 text-lime',
  ditolak: 'bg-bahaya/15 text-bahaya',
};
const NAMA_STATUS = { menunggu: 'Menunggu', disetujui: 'Disetujui', ditolak: 'Ditolak' };

function Lencana({ status }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${WARNA_STATUS[status] || ''}`}>
      {NAMA_STATUS[status] || status}
    </span>
  );
}

/** Super admin: setujui / tolak soal dari lembaga. */
export function Persetujuan({ onEdit }) {
  const [status, setStatus] = useState('menunggu');
  const [pilih, setPilih] = useState(() => new Set());
  const [catatan, setCatatan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galatAksi, setGalatAksi] = useState('');
  const { data, galat, muat } = useMuat(() => api.adminSoalLembaga(status), [status]);

  const ganti = (id) =>
    setPilih((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function putuskan(aksi) {
    setSibuk(true);
    setGalatAksi('');
    try {
      await api.adminPutuskan({ aksi, ids: [...pilih], catatan });
      setPilih(new Set());
      setCatatan('');
      await muat();
    } catch (e) {
      setGalatAksi(e.message);
    } finally {
      setSibuk(false);
    }
  }

  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  const menunggu = status === 'menunggu';
  return (
    <div>
      <div className="mb-4 flex gap-2">
        {['menunggu', 'disetujui', 'ditolak'].map((k) => (
          <button
            key={k}
            onClick={() => {
              setPilih(new Set());
              setStatus(k);
            }}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${
              status === k ? 'bg-card-2 text-aksen' : 'border border-line text-redup'
            }`}
          >
            {NAMA_STATUS[k]}
          </button>
        ))}
      </div>
      {!data.soal.length && <p className="text-sm text-redup">Tidak ada soal berstatus {NAMA_STATUS[status].toLowerCase()}.</p>}
      <ul className="space-y-2">
        {data.soal.map((q) => (
          <li key={q.id} className="rounded-2xl border border-line bg-card p-3">
            <div className="flex items-start gap-3">
              {menunggu && (
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 accent-lime"
                  checked={pilih.has(q.id)}
                  onChange={() => ganti(q.id)}
                  aria-label={`Pilih soal ${q.id}`}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-redup">
                  #{q.id} · {q.lembaga} · {q.subtes} / {q.topik} · Level {q.level}
                </p>
                <p className="mt-1 text-sm">{q.cuplikan}</p>
                {q.catatan && <p className="mt-1 text-xs text-bahaya">Catatan: {q.catatan}</p>}
                <div className="mt-2 flex items-center gap-3">
                  <Lencana status={q.status} />
                  <button onClick={() => onEdit(q.id)} className="text-xs text-aksen underline">
                    Lihat / edit
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {menunggu && data.soal.length > 0 && (
        <div className="sticky bottom-3 mt-4 rounded-2xl border border-line bg-panel p-3">
          <p className="text-xs text-redup">{pilih.size} soal dipilih</p>
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Catatan (wajib bila menolak)"
            className="mt-2 w-full rounded-xl border border-line bg-card p-2 text-sm"
          />
          {galatAksi && <p className="mt-2 text-xs text-bahaya">{galatAksi}</p>}
          <div className="mt-2 flex gap-2">
            <button
              disabled={sibuk || !pilih.size}
              onClick={() => putuskan('setujui')}
              className="flex-1 rounded-xl bg-lime py-2.5 text-sm font-bold text-bg disabled:opacity-40"
            >
              Setujui
            </button>
            <button
              disabled={sibuk || !pilih.size || !catatan.trim()}
              onClick={() => putuskan('tolak')}
              className="flex-1 rounded-xl border border-bahaya/60 py-2.5 text-sm font-bold text-bahaya disabled:opacity-40"
            >
              Tolak
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Admin lembaga: soal yang pernah dikirim beserta statusnya. */
export function SoalSaya({ onEdit }) {
  const { data, galat, muat } = useMuat(() => api.adminSoalLembaga(), []);
  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  if (!data.soal.length) return <p className="text-sm text-redup">Belum ada soal yang Anda kirim.</p>;
  return (
    <ul className="space-y-2">
      {data.soal.map((q) => (
        <li key={q.id} className="rounded-2xl border border-line bg-card p-3">
          <p className="text-xs text-redup">
            #{q.id} · {q.subtes} / {q.topik} · Level {q.level} · {tgl(q.dibuat)}
          </p>
          <p className="mt-1 text-sm">{q.cuplikan}</p>
          {q.status === 'ditolak' && q.catatan && <p className="mt-1 text-xs text-bahaya">Alasan ditolak: {q.catatan}</p>}
          <div className="mt-2 flex items-center gap-3">
            <Lencana status={q.status} />
            {q.status !== 'disetujui' && (
              <button onClick={() => onEdit(q.id)} className="text-xs text-aksen underline">
                {q.status === 'ditolak' ? 'Perbaiki & kirim ulang' : 'Edit'}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function KartuLembaga({ l, onUbah }) {
  const [email, setEmail] = useState('');
  const [pesan, setPesan] = useState('');
  const [sibuk, setSibuk] = useState(false);

  async function jalan(fn) {
    setSibuk(true);
    setPesan('');
    try {
      await fn();
      await onUbah();
    } catch (e) {
      setPesan(e.message);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{l.nama}</p>
          <p className="text-xs text-redup">
            {l.siswa} siswa · soal menunggu {l.soal_menunggu} · disetujui {l.soal_disetujui}
          </p>
        </div>
        <button
          disabled={sibuk}
          onClick={() => jalan(() => api.adminUbahLembaga(l.id, { aktif: !l.aktif }))}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${l.aktif ? 'bg-lime/15 text-lime' : 'bg-bahaya/15 text-bahaya'}`}
        >
          {l.aktif ? 'Aktif' : 'Nonaktif'}
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-panel px-3 py-2">
        <div>
          <p className="text-[11px] text-redup">Kode undangan siswa</p>
          <p className="font-mono text-lg font-bold tracking-widest">{l.kode_undangan}</p>
        </div>
        <button
          disabled={sibuk}
          onClick={() => {
            if (window.confirm('Buat kode baru? Kode lama tidak berlaku lagi (siswa yang sudah bergabung tetap tergabung).')) {
              jalan(() => api.adminUbahLembaga(l.id, { kode_baru: true }));
            }
          }}
          className="text-xs text-aksen underline"
        >
          Kode baru
        </button>
      </div>
      <div className="mt-3">
        <p className="text-xs text-redup">Admin lembaga</p>
        {l.admin.length === 0 && <p className="text-sm text-redup">Belum ada.</p>}
        <ul className="mt-1 space-y-1">
          {l.admin.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm">
              <span>
                {a.nama} <span className="text-xs text-redup">{a.email}</span>
              </span>
              <button disabled={sibuk} onClick={() => jalan(() => api.adminCabutAdmin(l.id, a.id))} className="text-xs text-bahaya underline">
                Cabut
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            jalan(async () => {
              await api.adminTambahAdmin(l.id, email);
              setEmail('');
            });
          }}
        >
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="email akun yang sudah terdaftar"
            className="min-w-0 flex-1 rounded-xl border border-line bg-panel px-3 py-2 text-sm"
          />
          <button disabled={sibuk || !email} className="rounded-xl bg-card-2 px-3 text-sm font-semibold text-aksen disabled:opacity-40">
            Tambah
          </button>
        </form>
        {pesan && <p className="mt-2 text-xs text-bahaya">{pesan}</p>}
      </div>
    </li>
  );
}

/** Super admin: kelola lembaga mitra. */
export function Lembaga() {
  const { data, galat, muat } = useMuat(() => api.adminLembaga(), []);
  const [nama, setNama] = useState('');
  const [pesan, setPesan] = useState('');

  async function buat(e) {
    e.preventDefault();
    setPesan('');
    try {
      await api.adminBuatLembaga(nama);
      setNama('');
      await muat();
    } catch (err) {
      setPesan(err.message);
    }
  }

  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  return (
    <div>
      <form onSubmit={buat} className="mb-4 flex gap-2">
        <input
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Nama lembaga / sekolah baru"
          className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2.5 text-sm"
        />
        <button disabled={nama.trim().length < 3} className="rounded-xl bg-lime px-4 text-sm font-bold text-bg disabled:opacity-40">
          Buat
        </button>
      </form>
      {pesan && <p className="mb-3 text-xs text-bahaya">{pesan}</p>}
      {!data.lembaga.length && <p className="text-sm text-redup">Belum ada lembaga.</p>}
      <ul className="space-y-3">
        {data.lembaga.map((l) => (
          <KartuLembaga key={l.id} l={l} onUbah={muat} />
        ))}
      </ul>
    </div>
  );
}
