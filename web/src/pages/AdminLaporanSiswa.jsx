import { useState } from 'react';
import { api } from '../lib/api.js';
import { Memuat, Galat, Batang } from '../components/Dasar.jsx';
import { useMuat, Kartu, tgl } from '../components/AdminDasar.jsx';
import { Radar, Grafik, SubtesKartu } from './Profil.jsx';

// Laporan untuk sekolah / bimbel: keseluruhan siswa (tabel + ringkasan), lalu laporan per siswa setelah nama diklik.
// Admin lembaga hanya melihat siswa lembaganya (dijaga di server).

const STATUS = {
  aktif: { label: 'Aktif', kelas: 'bg-lime/15 text-lime' },
  perlu_dorongan: { label: 'Perlu dorongan', kelas: 'bg-emas/15 text-emas' },
  perlu_perhatian: { label: 'Perlu perhatian', kelas: 'bg-bahaya/15 text-bahaya' },
  belum_mulai: { label: 'Belum mulai', kelas: 'bg-line text-redup' },
};
const NAMA_MODE = { drill: 'Drill', tryout: 'Tryout', domain0: 'Ujian dasar', stage: 'Stage' };

function Chip({ status }) {
  const s = STATUS[status] || STATUS.belum_mulai;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${s.kelas}`}>{s.label}</span>;
}

function Judul({ children }) {
  return <h2 className="mb-3 text-[11px] font-extrabold tracking-[0.14em] text-redup uppercase">{children}</h2>;
}

function Blok({ judul, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-4 ${className}`}>
      {judul && <Judul>{judul}</Judul>}
      {children}
    </section>
  );
}

function BatangAktivitas({ data }) {
  const maks = Math.max(...data.map((d) => d.sesi), 1);
  return (
    <div>
      <div className="flex h-32 items-end gap-[3px]" role="img" aria-label="Sesi per hari, 30 hari terakhir">
        {data.map((d, i) => (
          <div
            key={d.hari}
            title={`${d.hari}: ${d.sesi} sesi`}
            className={`flex-1 rounded-t ${i >= data.length - 7 ? 'bg-lime' : 'bg-aksen/60'}`}
            style={{ height: `${Math.max(2, (d.sesi / maks) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-redup">
        <span>{data[0]?.hari}</span>
        <span>{data[data.length - 1]?.hari}</span>
      </div>
    </div>
  );
}

function RrSubtes({ subtes }) {
  if (!subtes.length) return <p className="text-sm text-redup">Belum ada data latihan.</p>;
  return (
    <div className="space-y-3">
      {subtes.map((s) => (
        <div key={s.kode}>
          <div className="flex justify-between text-sm">
            <span>
              {s.kode} <span className="text-xs text-redup">{s.nama}</span>
            </span>
            <b className={s.rr_rata < 35 ? 'text-bahaya' : s.rr_rata >= 50 ? 'text-lime' : 'text-aksen'}>{Math.round(s.rr_rata)} RR</b>
          </div>
          <div className="mt-1.5">
            <Batang persen={s.rr_rata} warna={s.rr_rata < 35 ? 'bg-bahaya' : s.rr_rata >= 50 ? 'bg-lime' : 'bg-aksen'} tinggi="h-1.5" />
          </div>
        </div>
      ))}
    </div>
  );
}

const terakhirTeks = (s) => {
  if (s.hari_sejak === null) return 'Belum mulai';
  if (s.hari_sejak === 0) return 'Hari ini';
  if (s.hari_sejak === 1) return 'Kemarin';
  return `${s.hari_sejak} hari lalu`;
};

function DetailSiswaLaporan({ id, onKembali }) {
  const { data, galat, muat } = useMuat(() => api.adminSiswaProfil(id), [id]);
  if (galat) {
    return (
      <div>
        <button onClick={onKembali} className="mb-3 text-sm text-aksen underline">← Laporan keseluruhan siswa</button>
        <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />
      </div>
    );
  }
  if (!data) return <Memuat />;
  const { siswa, ringkasan: r, streak, subtes, grafik, sesi, rekomendasi, terkuat } = data;
  return (
    <div>
      <p className="text-sm text-redup print:hidden">
        <button onClick={onKembali} className="font-bold text-aksen underline">← Laporan keseluruhan siswa</button>
        {' / '}
        {siswa.nama}
      </p>
      <header className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{siswa.nama}</h1>
          <p className="mt-1 text-xs text-redup">
            {siswa.email}
            {siswa.lembaga ? ` · ${siswa.lembaga}` : ''}
            {data.tes ? ` · tes ${data.tes.nama}` : ''}
          </p>
        </div>
        <button onClick={() => window.print()} title="Di jendela cetak, pilih Simpan sebagai PDF" className="rounded-full bg-lime px-5 py-2.5 text-sm font-extrabold text-bg print:hidden">
          Unduh PDF
        </button>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kartu judul="Sesi selesai" nilai={r.sesi_selesai} catatan={`${r.jawaban} jawaban`} />
        <Kartu judul="Akurasi" nilai={r.akurasi === null ? '-' : `${r.akurasi}%`} catatan={`${r.benar} benar`} />
        <Kartu judul="Streak" nilai={`${streak.saat_ini} hari`} catatan={`terpanjang ${streak.terpanjang} hari`} />
        <Kartu judul="Hari aktif" nilai={r.hari_aktif} />
        <Kartu judul="Subtopik dilatih" nilai={`${r.subtopik_dilatih}/${r.subtopik_total}`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.5fr]">
        <Blok judul="Radar kemampuan (RR per subtes)">
          <Radar subtes={subtes} />
        </Blok>
        <Blok judul="Perkembangan 30 hari">
          <Grafik data={grafik} />
        </Blok>
      </div>

      <Blok judul="Level dan RR per subtes" className="mt-4">
        <div className="space-y-2.5">
          {subtes.map((sj) => (
            <SubtesKartu key={sj.kode} sj={sj} />
          ))}
        </div>
      </Blok>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Blok judul="Subtopik terkuat">
          {terkuat.length === 0 ? (
            <p className="text-sm text-redup">Belum ada data.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {terkuat.map((t) => (
                <li key={`${t.subtes}${t.subtopik}`} className="flex justify-between rounded-xl border border-line bg-card-2 px-3 py-2">
                  <span>{t.subtopik} <span className="text-xs text-redup">· {t.subtes}</span></span>
                  <span className="text-xs font-bold text-lime">L{t.level} · {Math.round(t.rr)}</span>
                </li>
              ))}
            </ul>
          )}
        </Blok>
        <Blok judul="Perlu diperkuat / dicoba">
          {rekomendasi.length === 0 ? (
            <p className="text-sm text-redup">Belum ada rekomendasi.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {rekomendasi.map((t) => (
                <li key={`${t.subtes}${t.subtopik}`} className="rounded-xl border border-line bg-card-2 px-3 py-2">
                  <p>{t.subtopik} <span className="text-xs text-redup">· {t.subtes} / {t.topik}</span></p>
                  <p className="text-xs font-bold text-aksen">{t.alasan} · L{t.level} · RR {Math.round(t.rr)}</p>
                </li>
              ))}
            </ul>
          )}
        </Blok>
      </div>

      <Blok judul="Riwayat sesi terbaru" className="mt-4">
        {sesi.length === 0 ? (
          <p className="text-sm text-redup">Belum ada sesi.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {sesi.slice(0, 10).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="w-32 shrink-0 text-xs text-redup">{tgl(s.mulai)}</span>
                <span className="flex-1 font-semibold">{NAMA_MODE[s.mode] || s.mode}{s.subtes ? ` · ${s.subtes}` : ''}</span>
                <span className="w-24 text-right">{s.benar}/{s.soal} benar</span>
                <span className={`w-20 text-right text-xs font-extrabold ${s.rr_delta >= 0 ? 'text-lime' : 'text-bahaya'}`}>
                  {s.rr_delta > 0 ? '+' : ''}{s.rr_delta} RR
                </span>
              </li>
            ))}
          </ul>
        )}
      </Blok>
    </div>
  );
}

export default function LaporanSiswa() {
  const [buka, setBuka] = useState(null);
  const [cari, setCari] = useState('');
  const [status, setStatus] = useState('semua');
  const { data, galat, muat } = useMuat(() => api.adminLaporanSiswa(), []);

  if (buka) return <DetailSiswaLaporan id={buka} onKembali={() => setBuka(null)} />;
  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;

  const { ringkasan: r, aktivitas, subtes, siswa } = data;
  if (!siswa.length) return <p className="text-sm text-redup">Belum ada siswa. Bagikan kode undangan lembaga agar siswa bisa bergabung.</p>;

  const q = cari.trim().toLowerCase();
  const tampil = siswa.filter(
    (s) => (status === 'semua' || s.status === status) && (!q || `${s.nama} ${s.email}`.toLowerCase().includes(q)),
  );

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">Laporan keseluruhan siswa</h1>
          <p className="mt-0.5 text-xs text-redup">
            {data.lembaga ? `${data.lembaga} · ` : ''}data 30 hari terakhir
          </p>
        </div>
        <button onClick={() => window.print()} title="Di jendela cetak, pilih Simpan sebagai PDF" className="rounded-full bg-lime px-5 py-2.5 text-sm font-extrabold text-bg print:hidden">
          Unduh PDF
        </button>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kartu judul="Siswa aktif" nilai={`${r.siswa_aktif_7_hari} / ${r.siswa}`} catatan="berlatih dalam 7 hari" />
        <Kartu judul="Akurasi 30 hari" nilai={r.akurasi_30_hari === null ? '-' : `${r.akurasi_30_hari}%`} />
        <Kartu judul="Sesi 30 hari" nilai={r.sesi_30_hari} catatan={`rata-rata ${r.sesi_rata_per_siswa} per siswa`} />
        <Kartu judul="Rata-rata RR" nilai={r.rr_rata === null ? '-' : r.rr_rata} catatan="dari 100 per subtopik" />
        <Kartu judul="Perlu perhatian" nilai={`${r.perlu_perhatian} siswa`} catatan="tidak berlatih 7 hari atau lebih" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Blok judul="Aktivitas 30 hari (sesi per hari)">
          <BatangAktivitas data={aktivitas} />
        </Blok>
        <Blok judul="RR rata-rata per subtes">
          <RrSubtes subtes={subtes} />
        </Blok>
      </div>

      <Blok judul={`Daftar siswa (${tampil.length}${tampil.length !== siswa.length ? ` dari ${siswa.length}` : ''})`} className="mt-4">
        <div className="mb-3 flex flex-wrap gap-2 print:hidden">
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama atau email"
            className="min-h-[40px] w-64 rounded-xl border border-line bg-bg px-3 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="min-h-[40px] rounded-xl border border-line bg-bg px-3 text-sm"
          >
            <option value="semua">Semua status</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="text-[11px] font-extrabold tracking-[0.12em] text-redup uppercase">
                <th className="pb-2 font-extrabold">Siswa</th>
                <th className="pb-2 font-extrabold">Sesi</th>
                <th className="pb-2 font-extrabold">Akurasi</th>
                <th className="pb-2 font-extrabold">Streak</th>
                <th className="pb-2 font-extrabold">RR rata</th>
                <th className="pb-2 font-extrabold">Level</th>
                <th className="pb-2 font-extrabold">Terakhir aktif</th>
                <th className="pb-2 text-right font-extrabold">Status</th>
              </tr>
            </thead>
            <tbody>
              {tampil.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="py-2.5">
                    <button onClick={() => setBuka(s.id)} className="text-left font-extrabold text-aksen underline-offset-2 hover:underline">
                      {s.nama}
                    </button>
                    <div className="text-xs text-redup">{s.email}</div>
                  </td>
                  <td>{s.sesi_30_hari}</td>
                  <td className={s.akurasi !== null && s.akurasi >= 65 ? 'font-bold text-lime' : s.akurasi !== null && s.akurasi < 50 ? 'font-bold text-bahaya' : ''}>
                    {s.akurasi === null ? '-' : `${s.akurasi}%`}
                  </td>
                  <td>{s.streak} hari</td>
                  <td>{s.rr_rata === null ? '-' : Math.round(s.rr_rata)}</td>
                  <td>{s.level_maks ? `Level ${s.level_maks}` : '-'}</td>
                  <td className="text-redup">{terakhirTeks(s)}</td>
                  <td className="text-right"><Chip status={s.status} /></td>
                </tr>
              ))}
              {!tampil.length && (
                <tr><td colSpan={8} className="py-6 text-center text-sm text-redup">Tidak ada siswa yang cocok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs font-bold text-aksen print:hidden">Klik nama siswa untuk membuka laporan per siswa.</p>
      </Blok>
    </div>
  );
}
