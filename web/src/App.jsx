import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseSiap } from './lib/supabase.js';
import { api } from './lib/api.js';
import Masuk from './pages/Masuk.jsx';
import PilihTes from './pages/PilihTes.jsx';
import Beranda from './pages/Beranda.jsx';
import { Layar, Memuat, Galat } from './components/Dasar.jsx';

export default function App() {
  const [sesi, setSesi] = useState(undefined); // undefined = belum tahu, null = belum login
  const [me, setMe] = useState(null);
  const [galat, setGalat] = useState('');
  const [ganti, setGanti] = useState(false); // true = tampilkan layar pilih tes

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

  return <Beranda me={me} onGantiTes={() => setGanti(true)} />;
}
