import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseSiap } from './lib/supabase.js';
import { api } from './lib/api.js';
import Masuk from './pages/Masuk.jsx';
import PilihTes from './pages/PilihTes.jsx';
import Beranda from './pages/Beranda.jsx';
import PilihDrill from './pages/PilihDrill.jsx';
import Ujian from './pages/Ujian.jsx';
import Hasil from './pages/Hasil.jsx';
import Stage from './pages/Stage.jsx';
import Admin from './pages/Admin.jsx';
import { Layar, Memuat, Galat } from './components/Dasar.jsx';

export default function App() {
  const [sesi, setSesi] = useState(undefined); // undefined = belum tahu, null = belum login
  const [me, setMe] = useState(null);
  const [galat, setGalat] = useState('');
  const [ganti, setGanti] = useState(false); // true = tampilkan layar pilih tes
  // Layar di atas Beranda: null | {nama:'pilih', data} | {nama:'ujian', sesi} | {nama:'hasil', mode, hasil}
  const [layar, setLayar] = useState(null);

  useEffect(() => {
    if (!supabaseSiap) return undefined;
    supabase.auth.getSession().then(({ data }) => setSesi(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesi(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const muatProfil = useCallback(async () => {
    setGalat('');
    try {
      setMe(await api.me());
    } catch (e) {
      setGalat(e.message);
    }
  }, []);

  useEffect(() => {
    if (sesi) muatProfil();
    else setMe(null);
  }, [sesi, muatProfil]);

  if (!supabaseSiap) {
    return (
      <Layar>
        <Galat
          pesan="Kunci Supabase belum diisi. Salin web/.env.example menjadi web/.env, isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY, lalu jalankan ulang npm run dev."
        />
      </Layar>
    );
  }
  if (sesi === undefined) return <Memuat />;
  if (!sesi) return <Masuk />;
  if (galat) {
    return (
      <Layar>
        <Galat pesan={galat} aksi="Coba lagi" onAksi={muatProfil} />
        <button className="mt-4 text-sm text-redup underline" onClick={() => supabase.auth.signOut()}>
          Keluar
        </button>
      </Layar>
    );
  }
  if (!me) return <Memuat />;

  if (!me.tes_aktif || ganti) {
    return (
      <PilihTes
        bisaBatal={Boolean(me.tes_aktif)}
        onBatal={() => setGanti(false)}
        onTerpilih={(profil) => {
          setMe(profil);
          setGanti(false);
        }}
      />
    );
  }

  const kembali = () => setLayar(null);

  if (layar?.nama === 'pilih') {
    return (
      <PilihDrill
        data={layar.data}
        onBatal={kembali}
        onMulai={(sesi) => setLayar({ nama: 'ujian', sesi })}
      />
    );
  }
  if (layar?.nama === 'ujian') {
    return (
      <Ujian
        key={layar.sesi.attempt_id}
        sesi={layar.sesi}
        onKeluar={kembali}
        onSelesai={(hasil) => setLayar({ nama: 'hasil', mode: layar.sesi.mode, hasil })}
      />
    );
  }
  if (layar?.nama === 'stage') {
    return <Stage tesId={me.tes_aktif.id} onKembali={kembali} />;
  }
  if (layar?.nama === 'admin' && me.is_admin) {
    return <Admin onKembali={kembali} />;
  }
  if (layar?.nama === 'hasil') {
    return <Hasil mode={layar.mode} hasil={layar.hasil} onKembali={kembali} />;
  }

  return (
    <Beranda
      me={me}
      onGantiTes={() => setGanti(true)}
      onPilihDrill={(data) => setLayar({ nama: 'pilih', data })}
      onSesi={(sesi) => setLayar({ nama: 'ujian', sesi })}
      onStage={() => setLayar({ nama: 'stage' })}
      onAdmin={() => setLayar({ nama: 'admin' })}
    />
  );
}
