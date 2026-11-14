// Komponen dasar yang dipakai semua layar: bingkai HP, logo, loading, dan pesan galat.

export function Layar({ children }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-8 pb-6">{children}</div>
  );
}

export function Logo({ className = 'h-9' }) {
  return <img src="/logo-zensan-gelap.png" alt="Zensan Institute" className={className} />;
}

export function Memuat({ teks = 'Memuat…' }) {
  return (
    <Layar>
      <div className="flex flex-1 items-center justify-center text-redup">{teks}</div>
    </Layar>
  );
}

export function Galat({ pesan, aksi, onAksi }) {
  return (
    <div className="rounded-2xl border border-bahaya/40 bg-bahaya/10 p-4 text-sm">
      <p>{pesan}</p>
      {aksi && (
        <button
          onClick={onAksi}
          className="mt-3 rounded-xl bg-card-2 px-4 py-2 font-semibold text-teks"
        >
          {aksi}
        </button>
      )}
    </div>
  );
}

export function Batang({ persen, warna = 'bg-lime', tinggi = 'h-2' }) {
  const p = Math.max(0, Math.min(100, Math.round(persen)));
  return (
    <div className={`w-full overflow-hidden rounded-full bg-line ${tinggi}`}>
      <div className={`${warna} ${tinggi} rounded-full transition-all`} style={{ width: `${p}%` }} />
    </div>
  );
}
