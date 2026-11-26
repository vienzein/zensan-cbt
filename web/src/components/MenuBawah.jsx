import { useState } from 'react';
import { gantiTema, ambilTema } from '../lib/tema.js';
import { supabase } from '../lib/supabase.js';
import { Logo } from './Dasar.jsx';

// Bilah menu bawah (HP) yang berubah jadi sidebar kiri di layar laptop (lebar >= 1024px), plus tombol tema.

const IKON = {
  home: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  kelas: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/>',
  bayar: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  beranda: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-6h6v6"/>',
  latihan: '<path d="m8 5 11 7-11 7z"/>',
  profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  matahari: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  bulan: '<path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z"/>',
};

export function Ikon({ nama, ukuran = 20 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={ukuran}
      height={ukuran}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: IKON[nama] }}
    />
  );
}

export function TombolTema() {
  const [tema, setTema] = useState(ambilTema);
  return (
    <button
      onClick={() => setTema(gantiTema())}
      aria-label={tema === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
      className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-card text-teks"
    >
      <Ikon nama={tema === 'dark' ? 'matahari' : 'bulan'} ukuran={18} />
    </button>
  );
}

const MENU = [
  ['home', 'Home', 'home'],
  ['beranda', 'Beranda', 'beranda'],
  ['latihan', 'Latihan', 'latihan'],
  ['profil', 'Profil', 'profil'],
];

/** aktif: 'beranda' | 'latihan' | 'profil'; onPilih(kunci) */
export default function MenuBawah({ aktif, onPilih, email }) {
  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed bottom-0 left-1/2 z-20 grid w-full max-w-md -translate-x-1/2 grid-cols-4 border-t border-line bg-card px-2 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] lg:top-0 lg:left-0 lg:flex lg:w-60 lg:max-w-none lg:translate-x-0 lg:flex-col lg:gap-1 lg:border-t-0 lg:border-r lg:p-4"
    >
      <div className="hidden rounded-xl bg-white px-3 py-2 lg:mb-6 lg:block">
        <Logo className="mx-auto h-10" />
      </div>
      <p className="hidden px-3 pb-2 text-[10px] font-extrabold tracking-[0.16em] text-redup lg:block">MENU UTAMA</p>
      {MENU.map(([kunci, nama, ikon]) => (
        <button
          key={kunci}
          onClick={() => onPilih(kunci)}
          aria-current={aktif === kunci ? 'page' : undefined}
          className={`grid justify-items-center gap-1 py-1 text-[11px] font-bold lg:flex lg:items-center lg:gap-3 lg:rounded-xl lg:px-3 lg:py-3 lg:text-sm ${
            aktif === kunci ? 'text-lime lg:bg-card-2' : 'text-redup lg:hover:bg-card-2'
          }`}
        >
          <Ikon nama={ikon} />
          {nama}
        </button>
      ))}
      <div className="mt-auto hidden border-t border-line pt-4 lg:block">
        {email && <p className="truncate px-3 pb-2 text-xs text-redup">{email}</p>}
        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold text-redup hover:bg-card-2"
        >
          Keluar
        </button>
      </div>
    </nav>
  );
}
