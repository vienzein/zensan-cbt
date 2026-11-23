import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Panel informasi di sisi kanan Beranda untuk layar laptop (>= 1024px). Datanya dari /api/me/profil.
// Gagal memuat tidak mengganggu Beranda: panel diam saja.

const NAMA_MODE = { drill_ranked: 'Drill', drill: 'Drill', domain0: 'Ujian dasar', stage: 'Stage', tryout: 'Tryout' };

function Kartu({ judul, children }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <p className="text-[11px] font-extrabold tracking-[0.14em] text-redup uppercase">{judul}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function tglPendek(iso) {
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export default function PanelKanan({ onPilihDrill }) {
  const [p, setP] = useState(null);
  useEffect(() => {
    let batal = false;
    api
      .profil()
      .then((d) => !batal && setP(d))
      .catch(() => {});
    return () => {
      batal = true;
    };
  }, []);
  if (!p) return null;

  const { streak, ringkasan: r, rekomendasi, sesi } = p;
  const target = streak.saat_ini >= 7 ? 30 : 7;
  const proses = Math.min(100, (streak.saat_ini / target) * 100);
  const lanjut = rekomendasi?.[0];

  return (
    <aside className="hidden space-y-4 lg:block" aria-label="Panel informasi">
      <Kartu judul="Streak harian">
        <p className="text-[28px] leading-none font-extrabold tracking-tight">{streak.saat_ini} hari</p>
        <p className="mt-1.5 text-xs text-redup">
          {streak.aktif_hari_ini ? 'Hari ini sudah berlatih.' : 'Berlatih hari ini untuk menjaga streak.'} Terpanjang {streak.terpanjang} hari.
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-lime" style={{ width: `${proses}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-redup">Menuju {target} hari</p>
      </Kartu>

      {lanjut && (
        <Kartu judul="Latihan berikutnya">
          <p className="text-sm font-bold">{lanjut.subtopik}</p>
          <p className="mt-0.5 text-xs text-redup">
            {lanjut.subtes} · {lanjut.topik}
          </p>
          <p className="mt-1 text-[11px] font-bold text-aksen">{lanjut.alasan}</p>
          <button
            onClick={onPilihDrill}
            className="mt-3 min-h-[44px] w-full rounded-xl border border-line bg-card-2 text-sm font-extrabold"
          >
            Mulai latihan →
          </button>
        </Kartu>
      )}

      <Kartu judul="Capaian">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-redup">Akurasi</span>
          <b className="text-lime">{r.akurasi}%</b>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-xs text-redup">Jawaban</span>
          <b>{r.jawaban}</b>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-xs text-redup">Sesi selesai</span>
          <b>{r.sesi_selesai}</b>
        </div>
      </Kartu>

      <Kartu judul="Aktivitas terbaru">
        {sesi.length === 0 ? (
          <p className="text-xs text-redup">Belum ada sesi.</p>
        ) : (
          <ul className="space-y-3">
            {sesi.slice(0, 3).map((s) => (
              <li key={s.id} className="flex gap-2.5 text-xs">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-lime" />
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {NAMA_MODE[s.mode] || s.mode}
                    {s.subtes ? ` · ${s.subtes}` : ''}
                  </p>
                  <p className="text-redup">
                    {tglPendek(s.mulai)} · {s.benar}/{s.soal} benar
                    {s.rr_delta ? ` · ${s.rr_delta > 0 ? '+' : ''}${Math.round(s.rr_delta)} RR` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Kartu>
    </aside>
  );
}
