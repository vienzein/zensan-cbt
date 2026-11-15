import { useState } from 'react';
import { api } from '../lib/api.js';
import { Layar, Galat } from '../components/Dasar.jsx';

const JUMLAH = [5, 10, 20, 30];

function jam(iso) {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

// Siswa memilih subtes, mencentang topik, dan jumlah soal; lalu sesi dimulai di server.
export default function PilihDrill({ data, onMulai, onBatal }) {
  const [subtes, setSubtes] = useState(data.subtes[0]?.id ?? null);
  const [topik, setTopik] = useState([]);
  const [jumlah, setJumlah] = useState(10);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');

  const aktif = data.subtes.find((s) => s.id === subtes);
  const bisaDipilih = (t) => !t.terkunci_domain0 && !t.cooldown_aktif;

  function ganti(id) {
    setSubtes(id);
    setTopik([]);
  }
  function centang(id) {
    setTopik((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }

  async function mulai() {
    setSibuk(true);
    setGalat('');
    try {
      const r = await api.mulaiDrill({
        subject_id: subtes,
        mode: 'drill_ranked',
        topic_ids: topik,
        jumlah_soal: jumlah,
      });
      onMulai({ ...r, mode: 'drill', judul: aktif.nama });
    } catch (e) {
      setGalat(e.message);
      setSibuk(false);
    }
  }

  return (
    <Layar>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">Mau latihan apa?</h1>
        <button onClick={onBatal} className="text-sm text-redup">
          Batal
        </button>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {data.subtes.map((s) => (
          <button
            key={s.id}
            onClick={() => ganti(s.id)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${
              s.id === subtes ? 'border-aksen bg-card-2 text-aksen' : 'border-line bg-card text-redup'
            }`}
          >
            {s.kode || s.nama}
          </button>
        ))}
      </div>

      <p className="mt-5 mb-2 text-sm font-bold">{aktif?.nama}</p>
      <div className="space-y-2.5">
        {aktif?.topik.length === 0 && (
          <p className="rounded-2xl bg-card p-4 text-sm text-redup">Belum ada topik di subtes ini.</p>
        )}
        {aktif?.topik.map((t) => {
          const ok = bisaDipilih(t);
          const dipilih = topik.includes(t.id);
          return (
            <button
              key={t.id}
              disabled={!ok}
              onClick={() => centang(t.id)}
              className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left ${
                dipilih ? 'border-aksen bg-card-2' : 'border-line bg-card'
              } ${ok ? '' : 'opacity-50'}`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm font-bold ${
                  dipilih ? 'border-aksen bg-aksen text-bg' : 'border-line'
                }`}
              >
                {dipilih ? '✓' : ''}
              </span>
              <span className="flex-1">
                <span className="block font-semibold leading-snug">{t.nama}</span>
                {t.terkunci_domain0 && <span className="text-xs text-redup">🔒 Perlu lulus Ujian Kelayakan Dasar</span>}
                {t.cooldown_aktif && <span className="text-xs text-redup">⏳ Jeda sampai {jam(t.cooldown_until)}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-6 mb-2 text-sm font-bold">Jumlah soal</p>
      <div className="grid grid-cols-4 gap-2">
        {JUMLAH.map((n) => (
          <button
            key={n}
            onClick={() => setJumlah(n)}
            className={`rounded-2xl border py-3 font-bold ${
              jumlah === n ? 'border-aksen bg-card-2 text-aksen' : 'border-line bg-card text-redup'
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {galat && (
        <div className="mt-4">
          <Galat pesan={galat} />
        </div>
      )}

      <button
        onClick={mulai}
        disabled={sibuk || topik.length === 0}
        className="mt-6 w-full rounded-2xl bg-lime py-3.5 font-bold text-bg disabled:opacity-40"
      >
        {sibuk ? 'Menyiapkan soal…' : 'Mulai'}
      </button>
    </Layar>
  );
}
