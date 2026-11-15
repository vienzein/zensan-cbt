import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { api } from '../lib/api.js';
import { Layar, Logo, Memuat, Galat, Batang } from '../components/Dasar.jsx';

const WARNA_LEVEL = {
  1: 'bg-aksen/20 text-aksen',
  2: 'bg-lime/20 text-lime',
  3: 'bg-emas/20 text-emas',
};

function jam(iso) {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function KartuTopik({ t }) {
  const r = t.ringkasan;
  const label = t.is_elite ? 'Elite' : r.level_terendah_nama;
  const warna = t.is_elite ? 'bg-emas/20 text-emas' : WARNA_LEVEL[r.level_terendah] || WARNA_LEVEL[1];
  const persen = t.is_elite ? t.elite_rr : r.rr_rata_rata;
  const terkunci = t.terkunci_domain0;

  // Catatan kecil di bawah kartu: alasan topik belum bisa naik / dipakai.
  let catatan = null;
  if (terkunci) catatan = '🔒 Lulus Ujian Kelayakan Dasar dulu untuk membuka topik ini';
  else if (t.cooldown_aktif) catatan = `⏳ Jeda latihan sampai ${jam(t.cooldown_until)}`;
  else if (!t.is_elite && !t.level3_unlocked && r.level_terendah >= 2)
    catatan = '🔒 Level 3 terbuka saat minimal separuh subtopik sudah di Level 2';

  return (
    <div className={`rounded-3xl border border-line bg-card p-4 ${terkunci ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold leading-snug">{t.nama}</p>
          <p className="mt-0.5 text-xs text-redup">
            {r.jumlah_subtopik} subtopik
            {!t.is_elite && r.di_level > 0 ? ` · ${r.di_level} sudah di atas Level 1` : ''}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${warna}`}>{label}</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Batang persen={persen} warna={t.is_elite ? 'bg-emas' : 'bg-lime'} />
        <span className="w-12 shrink-0 text-right text-xs text-redup">RR {Math.round(persen)}</span>
      </div>
      {catatan && <p className="mt-3 text-xs text-redup">{catatan}</p>}
    </div>
  );
}

export default function Beranda({ me, onGantiTes, onPilihDrill, onSesi }) {
  const [data, setData] = useState(null);
  const [galat, setGalat] = useState('');
  const [sibukD0, setSibukD0] = useState(false);
  const [galatD0, setGalatD0] = useState('');

  async function mulaiDomain0() {
    setSibukD0(true);
    setGalatD0('');
    try {
      const r = await api.mulaiDomain0(me.tes_aktif.id);
      onSesi({ ...r, mode: 'domain0', judul: 'Ujian Kelayakan Dasar' });
    } catch (e) {
      setGalatD0(e.message);
      setSibukD0(false);
    }
  }

  const muat = useCallback(async () => {
    setGalat('');
    try {
      setData(await api.beranda(me.tes_aktif.id));
    } catch (e) {
      setGalat(e.message);
    }
  }, [me.tes_aktif.id]);

  useEffect(() => {
    setData(null);
    muat();
  }, [muat]);

  if (!data && !galat) return <Memuat />;
  if (galat) {
    return (
      <Layar>
        <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />
      </Layar>
    );
  }

  const { kuota, streak_hari: streak, domain0 } = data;
  const perluDomain0 = domain0.diperlukan && !domain0.lulus;

  return (
    <Layar>
      <header className="flex items-center justify-between">
        <Logo className="h-8" />
        <button
          onClick={onGantiTes}
          className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-aksen"
        >
          {me.tes_aktif.nama} ▾
        </button>
      </header>

      <section className="mt-6 rounded-3xl bg-card-2 p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-extrabold">Siap drill hari ini?</p>
            <p className="mt-0.5 text-xs text-redup">
              {kuota.sisa > 0 ? `${kuota.sisa} soal ranked tersisa hari ini` : 'Kuota ranked hari ini habis'}
            </p>
          </div>
          <span className="rounded-full bg-bg/40 px-3 py-1 text-xs font-bold text-emas">
            🔥 {streak} hari
          </span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Batang persen={(kuota.terpakai / kuota.batas) * 100} warna="bg-aksen" />
          <span className="shrink-0 text-xs text-redup">
            {kuota.terpakai}/{kuota.batas}
          </span>
        </div>
        <button
          onClick={() => onPilihDrill(data)}
          className="mt-4 w-full rounded-2xl bg-lime py-3.5 font-bold text-bg"
        >
          Mulai Drill
        </button>
      </section>

      {perluDomain0 && (
        <section className="mt-4 rounded-3xl border border-aksen/40 bg-card p-5">
          <p className="font-bold">Ujian Kelayakan Dasar</p>
          <p className="mt-1 text-sm text-redup">
            Beberapa topik terkunci sampai Anda lulus ujian singkat ini.
            {domain0.cooldown_until ? ` Bisa diulang setelah ${jam(domain0.cooldown_until)}.` : ''}
          </p>
          {galatD0 && <p className="mt-2 text-sm text-bahaya">{galatD0}</p>}
          <button
            onClick={mulaiDomain0}
            disabled={sibukD0 || (domain0.cooldown_until && new Date(domain0.cooldown_until) > new Date())}
            className="mt-3 w-full rounded-2xl bg-lime py-3 font-bold text-bg disabled:opacity-40"
          >
            {sibukD0 ? 'Menyiapkan…' : 'Mulai Ujian'}
          </button>
        </section>
      )}

      <h2 className="mt-7 mb-3 text-sm font-bold uppercase tracking-wide text-redup">Peta penguasaan</h2>
      <div className="space-y-6">
        {data.subtes.map((s) => (
          <div key={s.id}>
            <p className="mb-2 font-bold">{s.nama}</p>
            <div className="space-y-3">
              {s.topik.map((t) => (
                <KartuTopik key={t.id} t={t} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <footer className="mt-10 flex items-center justify-between text-xs text-redup">
        <span>{me.email}</span>
        <button onClick={() => supabase.auth.signOut()} className="underline">
          Keluar
        </button>
      </footer>
    </Layar>
  );
}
