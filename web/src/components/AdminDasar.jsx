import { useCallback, useEffect, useState } from 'react';

// Pembantu bersama halaman admin.

export const tgl = (iso) =>
  iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

// Memuat data sekali per layar, dengan tombol coba lagi.
export function useMuat(ambil, deps) {
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

export function Kartu({ judul, nilai, catatan }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-xs text-redup">{judul}</p>
      <p className="mt-1 text-2xl font-extrabold">{nilai}</p>
      {catatan && <p className="mt-0.5 text-xs text-redup">{catatan}</p>}
    </div>
  );
}

