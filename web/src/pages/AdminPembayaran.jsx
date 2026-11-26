import { useState } from 'react';
import { api } from '../lib/api.js';
import { Memuat, Galat } from '../components/Dasar.jsx';
import { useMuat, tgl } from '../components/AdminDasar.jsx';
import { NAMA_STATUS_PESANAN, rupiah } from '../lib/rupiah.js';

// Super admin: cek mutasi rekening, lalu setujui (akses aktif otomatis) atau tolak pesanan transfer manual.

function BarisPesanan({ p, onSelesai }) {
  const [tolak, setTolak] = useState(false);
  const [alasan, setAlasan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const [bukti, setBukti] = useState(null); // alamat sementara foto bukti
  const [muatBukti, setMuatBukti] = useState(false);
  const bisaDiputuskan = p.status === 'menunggu_verifikasi' || p.status === 'menunggu_transfer';

  async function lihatBukti() {
    setMuatBukti(true);
    setGalat('');
    try {
      setBukti((await api.adminBuktiUrl(p.id)).url);
    } catch (e) {
      setGalat(e.message);
    } finally {
      setMuatBukti(false);
    }
  }

  async function putuskan(setuju) {
    setSibuk(true);
    setGalat('');
    try {
      await api.adminPutuskanBayar(p.id, { setuju, catatan: alasan });
      await onSelesai();
    } catch (e) {
      setGalat(e.message);
      setSibuk(false);
    }
  }

  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold">{p.siswa.nama || p.siswa.email}</p>
          <p className="text-xs text-redup">{p.siswa.email}</p>
        </div>
        <span className="text-xs font-semibold text-redup">{NAMA_STATUS_PESANAN[p.status] || p.status}</span>
      </div>
      <p className="mt-3 text-sm">
        {p.program.nama} · <b className="text-lime">{rupiah(p.nominal)}</b>
        <span className="text-redup"> (kode unik {p.kode_unik})</span>
      </p>
      {p.nama_pengirim && (
        <p className="mt-1 text-sm text-redup">
          Pengirim: <b className="text-teks">{p.nama_pengirim}</b> · dilapor {tgl(p.dilapor_pada)}
        </p>
      )}
      {p.catatan_siswa && <p className="mt-1 text-sm text-redup">Catatan siswa: {p.catatan_siswa}</p>}
      {p.ada_bukti ? (
        <div className="mt-2">
          {!bukti ? (
            <button onClick={lihatBukti} disabled={muatBukti} className="rounded-xl border border-line px-4 py-2 text-sm font-bold disabled:opacity-40">
              {muatBukti ? 'Membuka…' : 'Lihat bukti transfer'}
            </button>
          ) : (
            <a href={bukti} target="_blank" rel="noreferrer" title="Buka ukuran penuh">
              <img src={bukti} alt="Bukti transfer" className="max-h-80 rounded-xl border border-line" />
            </a>
          )}
        </div>
      ) : (
        <p className="mt-1 text-sm text-redup">Belum ada bukti transfer.</p>
      )}
      {p.catatan_admin && <p className="mt-1 text-sm text-redup">Catatan admin: {p.catatan_admin}</p>}
      {galat && <p className="mt-2 text-sm text-bahaya">{galat}</p>}

      {bisaDiputuskan && !tolak && (
        <div className="mt-3 flex gap-2">
          <button onClick={() => putuskan(true)} disabled={sibuk} className="flex-1 rounded-xl bg-lime py-2.5 text-sm font-bold text-bg disabled:opacity-40">
            {sibuk ? 'Memproses…' : 'Setujui dan aktifkan'}
          </button>
          <button onClick={() => setTolak(true)} disabled={sibuk} className="rounded-xl border border-line px-4 py-2.5 text-sm font-bold text-bahaya">
            Tolak
          </button>
        </div>
      )}
      {bisaDiputuskan && tolak && (
        <div className="mt-3 space-y-2">
          <input
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            placeholder="Alasan penolakan (dibaca siswa)"
            className="w-full rounded-xl border border-line bg-bg px-4 py-2.5 text-sm outline-none focus:border-lime"
          />
          <div className="flex gap-2">
            <button onClick={() => putuskan(false)} disabled={sibuk || alasan.trim().length < 3} className="flex-1 rounded-xl bg-bahaya py-2.5 text-sm font-bold text-white disabled:opacity-40">
              Kirim penolakan
            </button>
            <button onClick={() => setTolak(false)} className="rounded-xl border border-line px-4 py-2.5 text-sm font-bold">
              Batal
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function Pembayaran() {
  const [semua, setSemua] = useState(false);
  const { data, galat, muat } = useMuat(() => api.adminPembayaran(semua), [semua]);

  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  return (
    <div>
      <div className="mb-4 flex gap-2">
        {[[false, 'Perlu dicek'], [true, 'Semua']].map(([v, n]) => (
          <button
            key={n}
            onClick={() => setSemua(v)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${semua === v ? 'bg-card-2 text-aksen' : 'border border-line text-redup'}`}
          >
            {n}
          </button>
        ))}
      </div>
      {!data.pesanan.length && <p className="text-sm text-redup">Tidak ada pesanan.</p>}
      <ul className="space-y-3">
        {data.pesanan.map((p) => (
          <BarisPesanan key={p.id} p={p} onSelesai={muat} />
        ))}
      </ul>
    </div>
  );
}
