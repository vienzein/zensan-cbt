import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Memuat, Galat } from '../components/Dasar.jsx';

// Halaman admin: ringkasan, laporan soal, siswa, dan jumlah soal per subtopik. Hanya muncul bila akun is_admin.

const TAB = [
  ['ringkasan', 'Ringkasan'],
  ['laporan', 'Laporan'],
  ['siswa', 'Siswa'],
  ['bank', 'Bank soal'],
];

const tgl = (iso) =>
  iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

// Memuat data sekali per layar, dengan tombol coba lagi.
function useMuat(ambil, deps) {
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState('');
  const muat = useCallback(async () => {
    setGalat('');
    try {
      setData(await ambil());
    } catch (e) {
      setGalat(e.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    setData(null);
    muat();
  }, [muat]);
  return { data, galat, muat };
}

function Kartu({ judul, nilai, catatan }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-xs text-redup">{judul}</p>
      <p className="mt-1 text-2xl font-extrabold">{nilai}</p>
      {catatan && <p className="mt-0.5 text-xs text-redup">{catatan}</p>}
    </div>
  );
}

function Ringkasan() {
  const { data, galat, muat } = useMuat(() => api.adminRingkasan(), []);
  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Kartu judul="Siswa terdaftar" nilai={data.siswa} />
      <Kartu judul="Aktif 7 hari terakhir" nilai={data.siswa_aktif_7_hari} />
      <Kartu judul="Jawaban 24 jam terakhir" nilai={data.jawaban_24_jam} />
      <Kartu judul="Soal aktif" nilai={data.soal_aktif} />
      <Kartu judul="Laporan baru" nilai={data.laporan_baru} catatan={`${data.soal_dilaporkan_baru} soal`} />
      <Kartu judul="Soal tersembunyi" nilai={data.soal_tersembunyi} catatan="karena laporan / admin" />
    </div>
  );
}

function DetailLaporan({ id, label, onKembali, onSelesai }) {
  const { data, galat, muat } = useMuat(() => api.adminLaporanDetail(id), [id]);
  const [sibuk, setSibuk] = useState(false);
  const [galatAksi, setGalatAksi] = useState('');

  async function tindak(body) {
    setSibuk(true);
    setGalatAksi('');
    try {
      await api.adminTindak(id, body);
      onSelesai();
    } catch (e) {
      setGalatAksi(e.message);
      setSibuk(false);
    }
  }

  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  const { soal, laporan } = data;
  const kunci = Array.isArray(soal.kunci) ? soal.kunci.join(', ') : String(soal.kunci);

  return (
    <div>
      <button onClick={onKembali} className="mb-3 text-sm text-aksen underline">
        ← Daftar laporan
      </button>
      <p className="text-xs text-redup">
        #{soal.id} · {soal.subtes} / {soal.topik} · Level {soal.level} ·{' '}
        {soal.aktif ? 'aktif' : `TERSEMBUNYI (${soal.tersembunyi_karena || 'nonaktif'})`}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{soal.teks}</p>
      {soal.gambar_url && (
        <img src={soal.gambar_url} alt="Gambar soal" className="mt-3 max-h-64 rounded-xl border border-line" />
      )}
      <ul className="mt-3 space-y-1 text-sm">
        {soal.opsi.map((o) => (
          <li key={o.kode} className="whitespace-pre-wrap">
            <b>{o.kode}.</b> {o.teks}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">
        <b>Kunci tersimpan:</b> {kunci}
      </p>
      {soal.pembahasan && <p className="mt-2 whitespace-pre-wrap text-xs text-redup">{soal.pembahasan}</p>}

      <h3 className="mt-5 mb-2 text-sm font-bold uppercase tracking-wide text-redup">Laporan ({laporan.length})</h3>
      <ul className="space-y-2">
        {laporan.map((l) => (
          <li key={l.id} className="rounded-xl border border-line bg-card p-3 text-sm">
            <p>
              <b>{label[l.alasan] || l.alasan}</b> <span className="text-xs text-redup">[{l.status}]</span>
            </p>
            {l.catatan && <p className="mt-1 whitespace-pre-wrap">{l.catatan}</p>}
            <p className="mt-1 text-xs text-redup">
              {l.siswa} · {tgl(l.created_at)}
            </p>
          </li>
        ))}
      </ul>

      {galatAksi && <p className="mt-3 text-sm text-bahaya">{galatAksi}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {soal.aktif ? (
          <button
            disabled={sibuk}
            onClick={() => tindak({ status: 'ditinjau', soal_aktif: false })}
            className="rounded-xl bg-bahaya/20 py-3 text-sm font-bold text-bahaya disabled:opacity-40"
          >
            Sembunyikan soal
          </button>
        ) : (
          <button
            disabled={sibuk}
            onClick={() => tindak({ status: 'selesai', soal_aktif: true })}
            className="rounded-xl bg-lime py-3 text-sm font-bold text-bg disabled:opacity-40"
          >
            Sudah diperbaiki, aktifkan
          </button>
        )}
        <button
          disabled={sibuk}
          onClick={() => tindak({ status: 'selesai' })}
          className="rounded-xl bg-card-2 py-3 text-sm font-bold disabled:opacity-40"
        >
          Tandai selesai
        </button>
        <button
          disabled={sibuk}
          onClick={() => tindak({ status: 'ditolak', ...(soal.aktif ? {} : { soal_aktif: true }) })}
          className="col-span-2 rounded-xl border border-line py-3 text-sm font-semibold text-redup disabled:opacity-40"
        >
          Tolak laporan (soal baik-baik saja){soal.aktif ? '' : ' dan aktifkan lagi'}
        </button>
      </div>
    </div>
  );
}

function Laporan({ label }) {
  const [semua, setSemua] = useState(false);
  const [buka, setBuka] = useState(null);
  const { data, galat, muat } = useMuat(() => api.adminLaporan(semua), [semua]);

  if (buka) {
    return (
      <DetailLaporan
        id={buka}
        label={label}
        onKembali={() => setBuka(null)}
        onSelesai={() => {
          setBuka(null);
          muat();
        }}
      />
    );
  }
  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;

  return (
    <div>
      <label className="mb-3 flex items-center gap-2 text-xs text-redup">
        <input type="checkbox" checked={semua} onChange={(e) => setSemua(e.target.checked)} />
        Tampilkan juga yang sudah selesai / ditolak
      </label>
      {!data.soal.length && <p className="text-sm text-redup">Tidak ada laporan.</p>}
      <ul className="space-y-2">
        {data.soal.map((s) => (
          <li key={s.question_id}>
            <button
              onClick={() => setBuka(s.question_id)}
              className="w-full rounded-2xl border border-line bg-card p-3 text-left"
            >
              <p className="text-xs text-redup">
                #{s.question_id} · {s.subtes} / {s.topik} · L{s.level}
                {!s.aktif && <span className="ml-1 font-bold text-bahaya">TERSEMBUNYI</span>}
              </p>
              <p className="mt-1 text-sm">{s.cuplikan}</p>
              <p className="mt-1 text-xs text-aksen">
                {s.jumlah_siswa} siswa · {s.alasan.map((a) => label[a] || a).join('; ')}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetailSiswa({ id, onKembali }) {
  const { data, galat, muat } = useMuat(() => api.adminSiswaDetail(id), [id]);
  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  const { siswa, subtopik, sesi } = data;
  return (
    <div>
      <button onClick={onKembali} className="mb-3 text-sm text-aksen underline">
        ← Daftar siswa
      </button>
      <p className="text-lg font-extrabold">{siswa.nama}</p>
      <p className="text-xs text-redup">
        {siswa.email} · daftar {tgl(siswa.daftar)} · tes {siswa.tes || '-'}
      </p>

      <h3 className="mt-5 mb-2 text-sm font-bold uppercase tracking-wide text-redup">Penguasaan subtopik</h3>
      {!subtopik.length && <p className="text-sm text-redup">Belum ada latihan.</p>}
      <ul className="space-y-1.5">
        {subtopik.map((m, i) => (
          <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2 text-sm">
            <span>
              <span className="text-xs text-redup">{m.subtes} · </span>
              {m.subtopik}
            </span>
            <span className="shrink-0 text-xs font-bold">
              L{m.level} · RR {m.rr}
            </span>
          </li>
        ))}
      </ul>

      <h3 className="mt-5 mb-2 text-sm font-bold uppercase tracking-wide text-redup">Sesi terakhir</h3>
      <ul className="space-y-1.5">
        {sesi.map((a, i) => (
          <li key={i} className="rounded-xl border border-line bg-card px-3 py-2 text-xs">
            {tgl(a.started_at)} · {a.mode}
            {a.subtes ? ` · ${a.subtes}` : ''} · {a.status} · {a.jumlah_benar}/{a.jumlah_soal} benar · RR {a.total_rr_delta >= 0 ? '+' : ''}
            {a.total_rr_delta}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Siswa() {
  const [buka, setBuka] = useState(null);
  const { data, galat, muat } = useMuat(() => api.adminSiswa(), []);
  if (buka) return <DetailSiswa id={buka} onKembali={() => setBuka(null)} />;
  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  if (!data.siswa.length) return <p className="text-sm text-redup">Belum ada siswa.</p>;
  return (
    <ul className="space-y-2">
      {data.siswa.map((s) => (
        <li key={s.id}>
          <button onClick={() => setBuka(s.id)} className="w-full rounded-2xl border border-line bg-card p-3 text-left">
            <p className="font-bold">
              {s.nama}
              {s.admin && <span className="ml-2 text-xs text-aksen">admin</span>}
            </p>
            <p className="text-xs text-redup">{s.email}</p>
            <p className="mt-1 text-xs">
              {s.sesi} sesi · {s.jawaban} jawaban · akurasi {s.akurasi === null ? '-' : `${s.akurasi}%`} · terakhir{' '}
              {tgl(s.terakhir_latihan)}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function BankSoal() {
  const { data, galat, muat } = useMuat(() => api.adminBankSoal(), []);
  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  const sel = (n) => (
    <td className={`px-2 py-1 text-center ${n === 0 ? 'font-bold text-bahaya' : ''}`}>{n}</td>
  );
  let subtesIni = '';
  return (
    <div>
      <p className="mb-2 text-xs text-redup">Soal aktif per level. Angka merah = kosong (siswa dialihkan ke subtopik lain).</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-redup">
              <th className="px-2 py-1">Subtopik</th>
              <th className="px-2 py-1">L1</th>
              <th className="px-2 py-1">L2</th>
              <th className="px-2 py-1">L3</th>
              <th className="px-2 py-1">L4</th>
            </tr>
          </thead>
          <tbody>
            {data.subtopik.map((r, i) => {
              const baru = r.subtes !== subtesIni;
              subtesIni = r.subtes;
              return [
                baru && (
                  <tr key={`h${r.subtes}`}>
                    <td colSpan={5} className="pt-3 pb-1 text-xs font-bold uppercase tracking-wide text-aksen">
                      {r.subtes}
                    </td>
                  </tr>
                ),
                <tr key={i} className="border-t border-line">
                  <td className="px-2 py-1">
                    <span className="text-xs text-redup">{r.topik} · </span>
                    {r.subtopik}
                  </td>
                  {sel(r.l1)}
                  {sel(r.l2)}
                  {sel(r.l3)}
                  {sel(r.l4)}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Admin({ onKembali }) {
  const [tab, setTab] = useState('ringkasan');
  const [label, setLabel] = useState({});

  useEffect(() => {
    api
      .alasanLapor()
      .then((r) => setLabel(Object.fromEntries(r.alasan.map((a) => [a.kode, a.label]))))
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl px-5 pt-6 pb-10">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Admin</h1>
        <button onClick={onKembali} className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold">
          Tutup
        </button>
      </header>
      <nav className="mt-4 mb-5 flex gap-2 overflow-x-auto">
        {TAB.map(([k, n]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              tab === k ? 'bg-lime text-bg' : 'border border-line bg-card text-redup'
            }`}
          >
            {n}
          </button>
        ))}
      </nav>
      {tab === 'ringkasan' && <Ringkasan />}
      {tab === 'laporan' && <Laporan label={label} />}
      {tab === 'siswa' && <Siswa />}
      {tab === 'bank' && <BankSoal />}
    </div>
  );
}
