import { useState } from 'react';
import { api } from '../lib/api.js';
import { Layar, Memuat, Galat, Batang } from '../components/Dasar.jsx';
import { useMuat, tgl } from '../components/AdminDasar.jsx';
import MenuBawah, { TombolTema } from '../components/MenuBawah.jsx';
import { supabase } from '../lib/supabase.js';

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
export function Grafik({ data }) {
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

/** Pecah nama subtes jadi dua baris pendek untuk label radar. */
function duaBaris(nama) {
  const k = String(nama).split(' ');
  if (k.length < 2) return [nama, ''];
  const tengah = Math.ceil(k.length / 2);
  return [k.slice(0, tengah).join(' '), k.slice(tengah).join(' ')];
}

/** Radar kemampuan: RR rata-rata per subtes (skala 0-100) plus daftar nilainya. Perlu minimal 3 subtes. */
export function Radar({ subtes }) {
  const n = subtes.length;
  if (n < 3) return null;
  const cx = 160;
  const cy = 150;
  const r = 98;
  const titik = (i, v) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(a) * r * (v / 100), cy + Math.sin(a) * r * (v / 100)];
  };
  const poligon = (v) => Array.from({ length: n }, (_, i) => titik(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  const nilai = subtes.map((s) => Math.round(s.rr_rata));
  return (
    <div className="rounded-[18px] border border-line bg-card p-5">
      <h3 className="text-xl font-extrabold tracking-tight">Radar kemampuan</h3>
      <p className="mt-1 text-xs text-redup">Peta kekuatanmu di {n} subtes · skala 0–100</p>
      <svg
        viewBox="0 0 320 310"
        className="mx-auto mt-3 block h-auto w-full max-w-[380px] overflow-visible"
        role="img"
        aria-label={`Radar kemampuan: ${subtes.map((s, i) => `${s.nama} ${nilai[i]} dari 100`).join(', ')}`}
      >
        {[25, 50, 75, 100].map((v) => (
          <polygon key={v} points={poligon(v)} fill="none" stroke="var(--color-line)" strokeWidth="1.2" />
        ))}
        {subtes.map((s, i) => {
          const [x, y] = titik(i, 100);
          return <line key={s.kode} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-line)" strokeWidth="1.2" />;
        })}
        <polygon
          points={nilai.map((v, i) => titik(i, v).map((x) => x.toFixed(1)).join(',')).join(' ')}
          fill="var(--color-lime)"
          fillOpacity="0.24"
          stroke="var(--color-lime)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {nilai.map((v, i) => {
          const [x, y] = titik(i, v);
          return <circle key={subtes[i].kode} cx={x} cy={y} r="4.5" fill="var(--color-aksen)" stroke="var(--color-card)" strokeWidth="2" />;
        })}
        {subtes.map((s, i) => {
          const [x, y] = titik(i, 100);
          const [b1, b2] = duaBaris(s.nama);
          const atas = y < cy - 5;
          const sisi = x < cx - 5 ? 'end' : x > cx + 5 ? 'start' : 'middle';
          const dx = sisi === 'end' ? -12 : sisi === 'start' ? 12 : 0;
          const dy = atas ? -(b2 ? 26 : 14) : y > cy + 5 ? 16 : -4;
          return (
            <text key={s.kode} x={x + dx} y={y + dy} textAnchor={sisi} fontSize="11" fontWeight="700" fill="var(--color-teks)">
              <tspan x={x + dx}>{b1}</tspan>
              {b2 && (
                <tspan x={x + dx} dy="13">
                  {b2}
                </tspan>
              )}
            </text>
          );
        })}
      </svg>
      <ul className="mt-3 grid gap-x-5 sm:grid-cols-2">
        {subtes.map((s, i) => (
          <li key={s.kode} className="flex justify-between gap-3 border-b border-line py-2 text-xs">
            <span className="text-redup">{s.nama}</span>
            <strong className="whitespace-nowrap text-lime">{nilai[i]}/100</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SubtesKartu({ sj }) {
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

export default function Profil({ me, onNav, onMeBerubah }) {
  const { data, galat, muat } = useMuat(() => api.profil(), []);
  if (galat) {
    return (
      <Layar>
        <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />
        <button onClick={() => onNav('beranda')} className="mt-4 text-sm text-redup underline">Kembali</button>
      </Layar>
    );
  }
  if (!data) return <Memuat />;
  const { ringkasan: r, streak, lencana, subtes, grafik, sesi, rekomendasi, terkuat } = data;
  const diraih = lencana.filter((l) => l.diraih);

  return (
    <Layar denganMenu>
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-extrabold tracking-[0.16em] text-aksen uppercase">Pemain ZenQuest · {data.tes?.nama}</p>
          <h1 className="mt-1 text-[31px] leading-tight font-extrabold tracking-tight">Profil</h1>
        </div>
        <TombolTema />
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
          <Radar subtes={subtes} />
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

      <button onClick={() => supabase.auth.signOut()} className="mt-8 text-center text-xs text-redup underline lg:hidden">
        Keluar ({me.email})
      </button>
      <MenuBawah aktif="profil" onPilih={onNav} email={me.email} />
    </Layar>
  );
}
