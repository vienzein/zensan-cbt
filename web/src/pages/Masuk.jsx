import { useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { Layar, Logo, Galat } from '../components/Dasar.jsx';

export default function Masuk() {
  const [daftar, setDaftar] = useState(false);
  const [email, setEmail] = useState('');
  const [sandi, setSandi] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const [info, setInfo] = useState('');

  async function kirim(e) {
    e.preventDefault();
    setSibuk(true);
    setGalat('');
    setInfo('');
    const { data, error } = daftar
      ? await supabase.auth.signUp({ email, password: sandi })
      : await supabase.auth.signInWithPassword({ email, password: sandi });
    setSibuk(false);
    if (error) {
      setGalat(error.message);
    } else if (daftar && !data.session) {
      setInfo('Akun dibuat. Cek email Anda untuk konfirmasi, lalu masuk.');
    }
  }

  return (
    <Layar>
      <div className="flex flex-1 flex-col justify-center">
        <Logo className="mx-auto h-14" />
        <h1 className="mt-8 text-center text-2xl font-extrabold">
          {daftar ? 'Buat akun' : 'Selamat datang'}
        </h1>
        <p className="mt-1 text-center text-sm text-redup">
          Latihan soal bertahap untuk berbagai tes. Naik level terus sampai ahli.
        </p>

        <form onSubmit={kirim} className="mt-8 space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-line bg-card px-4 py-3.5 outline-none focus:border-aksen"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={daftar ? 'new-password' : 'current-password'}
            placeholder="Kata sandi"
            value={sandi}
            onChange={(e) => setSandi(e.target.value)}
            className="w-full rounded-2xl border border-line bg-card px-4 py-3.5 outline-none focus:border-aksen"
          />
          {galat && <Galat pesan={galat} />}
          {info && <p className="rounded-2xl bg-lime/10 p-3 text-sm text-lime">{info}</p>}
          <button
            type="submit"
            disabled={sibuk}
            className="w-full rounded-2xl bg-lime py-3.5 font-bold text-bg disabled:opacity-60"
          >
            {sibuk ? 'Memproses…' : daftar ? 'Daftar' : 'Masuk'}
          </button>
        </form>

        <button
          onClick={() => {
            setDaftar(!daftar);
            setGalat('');
            setInfo('');
          }}
          className="mt-5 text-center text-sm text-aksen"
        >
          {daftar ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'}
        </button>
      </div>
    </Layar>
  );
}
