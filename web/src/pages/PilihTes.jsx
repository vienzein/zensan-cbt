import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Layar, Logo, Memuat, Galat } from '../components/Dasar.jsx';

export default function PilihTes({ bisaBatal, onBatal, onTerpilih }) {
  const [daftar, setDaftar] = useState(null);
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(null);

  useEffect(() => {
    api.daftarTes().then(setDaftar).catch((e) => setGalat(e.message));
  }, []);

  async function pilih(t) {
    setSibuk(t.id);
    setGalat('');
    try {
      onTerpilih(await api.pilihTes(t.id));
    } catch (e) {
      setGalat(e.message);
      setSibuk(null);
    }
  }

  if (!daftar && !galat) return <Memuat />;

  return (
    <Layar>
      <div className="flex items-center justify-between">
        <Logo className="h-8" />
        {bisaBatal && (
          <button onClick={onBatal} className="text-sm text-redup">
            Batal
          </button>
        )}
      </div>

      <h1 className="mt-8 text-2xl font-extrabold">Mau latihan tes apa?</h1>
      <p className="mt-1 text-sm text-redup">
        Pilih satu. Progres tiap tes tersimpan terpisah, dan Anda bisa berpindah kapan saja.
      </p>

      {galat && (
        <div className="mt-4">
          <Galat pesan={galat} />
        </div>
      )}

      <div className="mt-6 space-y-3">
        {daftar?.map((t) => (
          <button
            key={t.id}
            onClick={() => pilih(t)}
            disabled={sibuk !== null}
            className={`w-full rounded-3xl border p-5 text-left transition active:scale-[0.99] disabled:opacity-60 ${
              t.aktif ? 'border-aksen bg-card-2' : 'border-line bg-card'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">{t.nama}</p>
                <p className="mt-1 text-sm text-redup">
                  {t.jumlah_subtes} subtes
                  {t.butuh_domain0 ? ' · ada ujian kelayakan dasar' : ''}
                </p>
              </div>
              {t.aktif && (
                <span className="rounded-full bg-aksen/20 px-3 py-1 text-xs font-semibold text-aksen">
                  Aktif
                </span>
              )}
              {sibuk === t.id && <span className="text-xs text-redup">Memilih…</span>}
            </div>
          </button>
        ))}
      </div>
    </Layar>
  );
}
