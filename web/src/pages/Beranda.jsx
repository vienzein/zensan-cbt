import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { api } from '../lib/api.js';
import { Layar, Logo, Memuat, Galat, Batang } from '../components/Dasar.jsx';
import MenuBawah, { TombolTema } from '../components/MenuBawah.jsx';
import PanelKanan from '../components/PanelKanan.jsx';

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
    <div className={`rounded-2xl border border-line bg-card p-4 ${terkunci ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xs font-extrabold ${warna}`}>
          {t.is_elite ? 'EL' : `L${r.level_terendah}`}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-snug">{t.nama}</p>
          <p className="text-[11px] text-redup">
            {label} · {r.jumlah_subtopik} subtopik
            {!t.is_elite && r.di_level > 0 ? ` · ${r.di_level} di atas Level 1` : ''}
          </p>
        </div>
        <span className={`shrink-0 text-sm font-extrabold ${t.is_elite ? 'text-emas' : 'text-lime'}`}>{Math.round(persen)} RR</span>
      </div>
      <div className="mt-3">
        <Batang persen={persen} warna={t.is_elite ? 'bg-emas' : 'bg-lime'} tinggi="h-1.5" />
      </div>
      {catatan && <p className="mt-3 text-xs text-redup">{catatan}</p>}
    </div>
  );
}

export default function Beranda({ me, onGantiTes, onPilihDrill, onSesi, onStage, onNav }) {
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
    <Layar denganMenu>
      <header className="flex items-center justify-between gap-3">
        <Logo className="h-8 lg:hidden" />
        <div className="flex items-center gap-2 lg:ml-auto">
          <button
            onClick={onGantiTes}
            className="rounded-xl border border-line bg-card px-3 py-2.5 text-xs font-bold text-aksen"
          >
            {me.tes_aktif.nama} ▾
          </button>
          <TombolTema />
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-8">
      <div className="min-w-0">

      <section className="mt-6">
        <p className="text-[11px] font-extrabold tracking-[0.16em] text-aksen uppercase">{me.tes_aktif.nama} · Lobby</p>
        <h1 className="mt-1.5 text-[31px] leading-[1.13] font-extrabold tracking-tight">
          Halo, {String(me.nama || '').trim().split(/\s+/)[0] || 'siswa'} 👋
        </h1>
        <p className="mt-1.5 text-sm text-redup">Satu sesi lagi, satu langkah lebih dekat.</p>
      </section>

      <section className="relative mt-5 overflow-hidden rounded-[20px] border border-line bg-gradient-to-br from-card-2 to-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold tracking-[0.16em] text-aksen uppercase">Siap drill hari ini?</p>
            <p className="mt-1 text-sm text-redup">
              {kuota.sisa > 0 ? `${kuota.sisa} soal ranked tersisa hari ini` : 'Kuota ranked hari ini habis'}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-bg/40 px-3 py-1.5 text-xs font-extrabold text-emas">🔥 {streak} hari</span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Batang persen={(kuota.terpakai / kuota.batas) * 100} warna="bg-lime" />
          <span className="shrink-0 text-xs text-redup">
            {kuota.terpakai}/{kuota.batas}
          </span>
        </div>
        <button
          onClick={() => onPilihDrill(data)}
          className="mt-4 flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[13px] bg-lime px-4 py-3 text-sm font-extrabold text-bg"
        >
          Mulai Drill <span aria-hidden="true">→</span>
        </button>
      </section>

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <div className="rounded-2xl border border-line bg-card px-2.5 py-3">
          <p className="text-[11px] text-redup">🔥 STREAK</p>
          <p className="mt-1.5 text-[22px] font-extrabold leading-none tracking-tight">{streak} hari</p>
          <p className="mt-1 text-[11px] text-redup">Terus jaga!</p>
        </div>
        <div className="rounded-2xl border border-line bg-card px-2.5 py-3">
          <p className="text-[11px] text-redup">✦ SISA SOAL</p>
          <p className="mt-1.5 text-[22px] font-extrabold leading-none tracking-tight text-lime">{kuota.sisa}</p>
          <p className="mt-1 text-[11px] text-redup">hari ini</p>
        </div>
        <div className="rounded-2xl border border-line bg-card px-2.5 py-3">
          <p className="text-[11px] text-redup">↗ TOPIK</p>
          <p className="mt-1.5 text-[22px] font-extrabold leading-none tracking-tight">{data.subtes.reduce((n, x) => n + x.topik.length, 0)}</p>
          <p className="mt-1 text-[11px] text-redup">tersedia</p>
        </div>
      </div>

      {perluDomain0 && (
        <section className="mt-4 rounded-3xl border border-aksen/40 bg-card p-5">
          <p className="font-bold">Ujian Kelayakan Dasar</p>
          <p className="mt-1 text-sm text-redup">
            Beberapa topik terkunci sampai Anda lulus ujian singkat ini.
            {domain0.cooldown_until ? ` Bisa diulang setelah ${jam(domain0.cooldown_until)}.` : ''}
          </p>
          {galatD0 && <p className="mt-2 text-sm text-bahaya">{galatD0}</p>}
          <button
            onClick={domain0.mode === 'stage' ? onStage : mulaiDomain0}
            disabled={sibukD0 || (domain0.cooldown_until && new Date(domain0.cooldown_until) > new Date())}
            className="mt-3 w-full rounded-2xl bg-lime py-3 font-bold text-bg disabled:opacity-40"
          >
            {sibukD0 ? 'Menyiapkan…' : domain0.mode === 'stage' ? 'Buka Peta Stage' : 'Mulai Ujian'}
          </button>
        </section>
      )}

      <h2 className="mt-7 mb-3 text-[19px] font-extrabold tracking-tight">Peta penguasaan</h2>
      <div className="space-y-6">
        {data.subtes.map((s) => (
          <div key={s.id}>
            <p className="mb-2 text-[11px] font-extrabold tracking-[0.16em] text-aksen uppercase">{s.nama}</p>
            <div className="grid gap-3 lg:grid-cols-2">
              {s.topik.map((t) => (
                <KartuTopik key={t.id} t={t} />
              ))}
            </div>
          </div>
        ))}
      </div>

      </div>
      <div className="lg:mt-6">
        <PanelKanan onPilihDrill={() => onPilihDrill(data)} />
      </div>
      </div>

      <footer className="mt-10 flex items-center justify-between text-xs text-redup lg:hidden">
        <span>{me.email}</span>
        <span className="flex items-center gap-4">
          <button onClick={() => supabase.auth.signOut()} className="underline">
            Keluar
          </button>
        </span>
      </footer>
      <MenuBawah aktif="beranda" onPilih={onNav} email={me.email} />
    </Layar>
  );
}
