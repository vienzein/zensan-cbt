import { useState } from 'react';
import { api } from '../lib/api.js';
import { Layar, Memuat, Galat, Batang } from '../components/Dasar.jsx';
import { useMuat, tgl } from '../components/AdminDasar.jsx';

// Profil pencapaian siswa: ringkasan, streak & lencana, grafik 30 hari, level & RR per subtes/topik, riwayat sesi, rekomendasi, lembaga.

const NAMA_MODE = { drill: 'Drill', tryout: 'Tryout', domain0: 'Ujian dasar', stage: 'Stage' };

function Kotak({ judul, nilai, catatan }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <p className="text-[11px] text-redup">{judul}</p>
      <p className="mt-0.5 text-xl font-extrabold">{nilai}</p>
      {catatan && <p className="text-[11px] text-redup">{catatan}</p>}
    </div>
  );
}

function Bagian({ judul, children }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-bold tracking-wide text-aksen uppercase">{judul}</h2>
      {children}
    </section>
  );
}

/** Grafik batang jawaban per hari (30 hari terakhir) dengan garis akurasi. SVG inline, tanpa pustaka. */
function Grafik({ data }) {
  if (!data.length) return <p className="text-sm text-redup">Belum ada data. Mulai drill untuk melihat perkembanganmu.</p>;
  const W = 320;
  const H = 120;
  const maks = Math.max(...data.map((d) => d.jawaban), 1);
  const lebar = W / Math.max(data.length, 8);
  const x = (i) => i * lebar + lebar / 2;
  const garis = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${(H - (d.akurasi / 100) * (H - 8) - 4).toFixed(1)}`).join(' ');
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Jawaban per hari dan akurasi 30 hari terakhir">
        {data.map((d, i) => (
          <rect key={d.hari} x={x(i) - lebar * 0.32} width={lebar * 0.64} y={H - (d.jawaban / maks) * (H - 8)} height={(d.jawaban / maks) * (H - 8)} rx="2" fill="#27424D" />
        ))}
        <path d={garis} fill="none" stroke="#8CC63F" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <circle key={d.hari} cx={x(i)} cy={H - (d.akurasi / 100) * (H - 8) - 4} r="2.5" fill="#8CC63F" />
        ))}
      </svg>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-redup">
        <span className="flex items-center gap-1.5"><i className="inline-block h-2 w-3 rounded-sm bg-line" /> jawaban / hari (maks {maks})</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-0.5 w-3 bg-lime" /> akurasi</span>
      </div>
    </div>
  );
}

function SubtesKartu({ sj }) {
  const [buka, setBuka] = useState(false);
  return (
    <div className="rounded-2xl border border-line bg-card">
      <button onClick={() => setBuka((b) => !b)} className="w-full p-3 text-left" aria-expanded={buka}>
        <div className="flex items-baseline justify-between">
          <p className="font-bold">
            {sj.kode} <span className="text-xs font-normal text-redup">{sj.nama}</span>
          </p>
          <span className="text-xs text-redup">{buka ? '▴' : '▾'}</span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex-1"><Batang persen={sj.rr_rata} /></div>
          <span className="text-xs text-redup">RR rata-rata {sj.rr_rata}</span>
        </div>
        <p className="mt-1 text-[11px] text-redup">
          {sj.subtopik_dilatih}/{sj.subtopik_total} subtopik dilatih · level tertinggi {sj.level_tertinggi}
        </p>
      </button>
      {buka && (
        <div className="border-t border-line px-3 pb-3">
          {sj.topik.map((t) => (
            <div key={t.id} className="mt-3">
              <p className="text-xs font-semibold text-aksen">
                {t.nama} <span className="font-normal text-redup">· RR {t.rr_rata}</span>
              </p>
              <ul className="mt-1 space-y-1.5">
                {t.subtopik.map((s) => (
                  <li key={s.nama} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate">{s.nama}</span>
                    {s.dilatih ? (
                      <>
                        <span className="w-14 shrink-0"><Batang persen={s.rr} tinggi="h-1.5" /></span>
                        <span className="w-14 shrink-0 text-right text-redup">L{s.level} · {Math.round(s.rr)}</span>
                      </>
                    ) : (
                      <span className="text-redup">belum dicoba</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Lembaga({ me, onBerubah }) {
  const [kode, setKode] = useState('');
  const [pesan, setPesan] = useState('');
  const [sibuk, setSibuk] = useState(false);

  async function jalan(fn) {
    setSibuk(true);
    setPesan('');
    try {
      await fn();
      setKode('');
      await onBerubah();
    } catch (e) {
      setPesan(e.message);
    } finally {
      setSibuk(false);
    }
  }

  if (me.lembaga) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-line bg-card p-3">
        <div>
          <p className="text-[11px] text-redup">Tergabung di</p>
          <p className="font-bold">{me.lembaga.nama}</p>
        </div>
        <button
          disabled={sibuk}
          onClick={() => window.confirm('Keluar dari lembaga ini?') && jalan(() => api.keluarLembaga())}
          className="text-xs text-bahaya underline"
        >
          Keluar
        </button>
        {pesan && <p className="mt-2 text-xs text-bahaya">{pesan}</p>}
      </div>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        jalan(() => api.gabungLembaga(kode));
      }}
      className="rounded-2xl border border-line bg-card p-3"
    >
      <p className="text-sm">Dari sekolah atau lembaga mitra? Masukkan kode undangan dari gurumu.</p>
      <div className="mt-2 flex gap-2">
        <input
          value={kode}
          onChange={(e) => setKode(e.target.value.toUpperCase())}
          maxLength={9}
          autoCapitalize="characters"
          placeholder="K7M2PQ9X"
          className="min-w-0 flex-1 rounded-xl border border-line bg-panel px-3 py-2.5 font-mono tracking-widest"
        />
        <button disabled={sibuk || kode.replace(/[\s-]/g, '').length !== 8} className="rounded-xl bg-lime px-4 text-sm font-bold text-bg disabled:opacity-40">
          Gabung
        </button>
      </div>
      {pesan && <p className="mt-2 text-xs text-bahaya">{pesan}</p>}
    </form>
  );
}

export default function Profil({ me, onKembali, onMeBerubah }) {
  const { data, galat, muat } = useMuat(() => api.profil(), []);
  if (galat) {
    return (
      <Layar>
        <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />
        <button onClick={onKembali} className="mt-4 text-sm text-redup underline">Kembali</button>
      </Layar>
    );
  }
  if (!data) return <Memuat />;
  const { ringkasan: r, streak, lencana, subtes, grafik, sesi, rekomendasi, terkuat } = data;
  const diraih = lencana.filter((l) => l.diraih);

  return (
    <Layar>
      <header className="flex items-center justify-between">
        <button onClick={onKembali} className="text-sm text-aksen underline">← Beranda</button>
        <span className="text-xs text-redup">{data.tes?.nama}</span>
      </header>

      <section className="mt-5 rounded-3xl bg-card-2 p-5">
        <p className="text-xl font-extrabold">{data.siswa.nama}</p>
        <p className="text-xs text-redup">{data.siswa.email}{data.siswa.lembaga ? ` · ${data.siswa.lembaga}` : ''}</p>
        <div className="mt-4 flex items-center gap-4">
          <div>
            <p className="text-3xl font-extrabold text-lime">{streak.saat_ini}</p>
            <p className="text-[11px] text-redup">hari beruntun</p>
          </div>
          <div className="text-xs text-redup">
            <p>Terpanjang: {streak.terpanjang} hari</p>
            <p>{streak.aktif_hari_ini ? 'Hari ini sudah berlatih' : 'Belum berlatih hari ini'}</p>
          </div>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Kotak judul="Jawaban" nilai={r.jawaban} catatan={`${r.benar} benar`} />
        <Kotak judul="Akurasi" nilai={r.akurasi === null ? '-' : `${r.akurasi}%`} />
        <Kotak judul="Sesi selesai" nilai={r.sesi_selesai} />
        <Kotak judul="Subtopik dilatih" nilai={`${r.subtopik_dilatih}/${r.subtopik_total}`} catatan={`${r.hari_aktif} hari aktif`} />
      </div>

      <Bagian judul="Perkembangan 30 hari">
        <Grafik data={grafik} />
      </Bagian>

      <Bagian judul="Level & RR per subtes">
        <div className="space-y-2.5">
          {subtes.map((sj) => (
            <SubtesKartu key={sj.kode} sj={sj} />
          ))}
        </div>
      </Bagian>

      {terkuat.length > 0 && (
        <Bagian judul="Subtopik terkuat">
          <ul className="space-y-1.5 text-sm">
            {terkuat.map((t) => (
              <li key={`${t.subtes}${t.subtopik}`} className="flex justify-between rounded-xl border border-line bg-card px-3 py-2">
                <span>{t.subtopik} <span className="text-xs text-redup">· {t.subtes}</span></span>
                <span className="text-xs text-lime">L{t.level} · {Math.round(t.rr)}</span>
              </li>
            ))}
          </ul>
        </Bagian>
      )}

      <Bagian judul="Latihan berikutnya">
        {rekomendasi.length === 0 ? (
          <p className="text-sm text-redup">Belum ada rekomendasi.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {rekomendasi.map((t) => (
              <li key={`${t.subtes}${t.subtopik}`} className="rounded-xl border border-line bg-card px-3 py-2">
                <p>{t.subtopik} <span className="text-xs text-redup">· {t.subtes} / {t.topik}</span></p>
                <p className="text-xs text-aksen">{t.alasan}</p>
              </li>
            ))}
          </ul>
        )}
      </Bagian>

      <Bagian judul={`Lencana (${diraih.length}/${lencana.length})`}>
        <div className="grid grid-cols-3 gap-2">
          {lencana.map((l) => (
            <div key={l.kode} title={l.ket} className={`rounded-2xl border p-2.5 text-center ${l.diraih ? 'border-lime/50 bg-lime/10' : 'border-line bg-card opacity-50'}`}>
              <p className={`text-xs font-bold ${l.diraih ? 'text-lime' : ''}`}>{l.nama}</p>
              <p className="mt-1 text-[10px] leading-tight text-redup">{l.ket}</p>
            </div>
          ))}
        </div>
      </Bagian>

      <Bagian judul="Riwayat sesi">
        {sesi.length === 0 ? (
          <p className="text-sm text-redup">Belum ada sesi.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {sesi.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-xl border border-line bg-card px-3 py-2">
                <div>
                  <p>{NAMA_MODE[s.mode] || s.mode}{s.subtes ? ` · ${s.subtes}` : ''}</p>
                  <p className="text-[11px] text-redup">{tgl(s.mulai)} · {s.benar}/{s.soal} benar</p>
                </div>
                <span className={`text-xs font-semibold ${s.rr_delta >= 0 ? 'text-lime' : 'text-bahaya'}`}>{s.rr_delta > 0 ? '+' : ''}{s.rr_delta} RR</span>
              </li>
            ))}
          </ul>
        )}
      </Bagian>

      <Bagian judul="Sekolah / lembaga">
        <Lembaga me={me} onBerubah={onMeBerubah} />
      </Bagian>
    </Layar>
  );
}
