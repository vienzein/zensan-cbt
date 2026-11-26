import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Memuat, Galat } from '../components/Dasar.jsx';
import { jadwalKelas, NAMA_STATUS_KELAS } from '../lib/rupiah.js';

// Siswa: daftar kelas online mendatang dari program yang aksesnya aktif. Link Meet hanya muncul untuk yang berhak.

function Kartu({ k }) {
  const hidup = k.status === 'berlangsung' || k.status === 'segera';
  return (
    <li className={`rounded-3xl border bg-card p-5 ${hidup ? 'border-lime' : 'border-line'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-redup">{k.program.nama}</span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${hidup ? 'bg-lime/15 text-lime' : 'bg-card-2 text-redup'}`}>
          {NAMA_STATUS_KELAS[k.status]}
        </span>
      </div>
      <h3 className="mt-2 text-lg font-extrabold leading-tight">{k.judul}</h3>
      <p className="mt-1 text-sm text-redup">{jadwalKelas(k.mulai_pada, k.selesai_pada)}</p>
      {k.pengajar && <p className="text-sm text-redup">Pengajar: {k.pengajar}</p>}
      {k.deskripsi && <p className="mt-2 whitespace-pre-line text-sm">{k.deskripsi}</p>}
      <a
        href={k.link_meet}
        target="_blank"
        rel="noreferrer"
        className={`mt-4 block rounded-2xl py-3 text-center font-bold ${hidup ? 'bg-lime text-bg' : 'border border-line'}`}
      >
        {k.status === 'berlangsung' ? 'Gabung sekarang' : 'Buka Google Meet'}
      </a>
    </li>
  );
}

export default function Kelas({ onKembali }) {
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState('');
  const muat = () => {
    setGalat('');
    api.kelas().then(setData).catch((e) => setGalat(e.message));
  };
  useEffect(muat, []);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-6 pb-10 lg:max-w-3xl">
      <button onClick={onKembali} className="self-start text-sm font-bold text-redup">← Kembali ke Home</button>
      <h1 className="mt-4 text-[28px] font-extrabold tracking-tight">Kelas Mendatang</h1>
      <p className="mt-1 text-sm text-redup">Jadwal kelas online dari program yang kamu ikuti.</p>
      <div className="mt-5">
        {galat && <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />}
        {!galat && !data && <Memuat />}
        {data && !data.length && (
          <p className="rounded-2xl border border-line bg-card p-5 text-sm text-redup">
            Belum ada kelas terjadwal. Kelas akan muncul di sini setelah dijadwalkan oleh tutor.
          </p>
        )}
        {data && data.length > 0 && <ul className="space-y-4">{data.map((k) => <Kartu key={k.id} k={k} />)}</ul>}
      </div>
    </div>
  );
}
