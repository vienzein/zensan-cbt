import { ringkasanSiswa, tanggalPanjang } from '../lib/laporanTeks.js';

// Tampilan CETAK laporan (A4, memakai kop Zensan Institute sebagai latar tiap halaman). Hanya terlihat saat dicetak
// ("Simpan sebagai PDF" di jendela cetak). Warna memakai palet kop, bukan tema aplikasi.

const TEAL = '#175F7B';
const GRN = '#7FA530';
const GRNL = '#97B53A';
const TXT = '#2F3B3F';
const MUT = '#667479';
const LINE = '#D5E2DE';
const SOFT = '#EEF5F2';
const BAD = '#B9434A';
const EMAS = '#A87908';

const NAMA_MODE = { drill: 'Drill', tryout: 'Tryout', domain0: 'Ujian dasar', stage: 'Stage' };
const tglSingkat = (iso) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Pembungkus: kop jadi latar setiap halaman; thead/tfoot kosong menjaga isi tetap di area putih kop. */
export function KertasKop({ children }) {
  return (
    <div className="hidden print:block" style={{ color: TXT, fontFamily: 'Arimo, system-ui, sans-serif' }}>
      <img src="/kop-zensan.jpg" alt="" style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: -1 }} />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr><td><div style={{ height: '52mm' }} /></td></tr>
        </thead>
        <tfoot>
          <tr><td><div style={{ height: '63mm' }} /></td></tr>
        </tfoot>
        <tbody>
          <tr>
            <td style={{ padding: '0 17mm' }}>{children}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Judul({ kecil, besar, sub }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.16em', color: GRN }}>{kecil}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: TEAL, marginTop: 3 }}>{besar}</div>
      <div style={{ fontSize: 11, color: MUT, marginTop: 3 }}>{sub}</div>
      <div style={{ height: 2, background: TEAL, marginTop: 10 }} />
      <div style={{ height: 1, background: GRNL, marginTop: 2 }} />
    </div>
  );
}

function Kpi({ label, nilai, sub, warna = TEAL }) {
  return (
    <div style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.1em', color: MUT, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: warna, marginTop: 3 }}>{nilai}</div>
      {sub && <div style={{ fontSize: 9, color: MUT, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Bagian({ judul, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.14em', color: TEAL, textTransform: 'uppercase', margin: '0 0 6px' }}>{judul}</div>
      {children}
    </div>
  );
}

const warnaRr = (v) => (v < 35 ? BAD : v >= 50 ? GRN : TEAL);

function RadarCetak({ subtes }) {
  const n = subtes.length;
  if (n < 3) return null;
  const cx = 120, cy = 112, R = 78;
  const pt = (i, f) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + R * f * Math.cos(a), cy + R * f * Math.sin(a)];
  };
  const poligon = (f) => Array.from({ length: n }, (_, i) => pt(i, f).map((x) => x.toFixed(1)).join(',')).join(' ');
  const nilai = subtes.map((s) => Math.max(0, Math.min(100, s.rr_rata)) / 100);
  return (
    <svg width="240" height="224" viewBox="0 0 240 224" role="img" aria-label="Radar kemampuan per subtes">
      {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={poligon(f)} fill="none" stroke={LINE} />)}
      {subtes.map((s, i) => <line key={s.kode} x1={cx} y1={cy} x2={pt(i, 1)[0]} y2={pt(i, 1)[1]} stroke={LINE} />)}
      <polygon points={nilai.map((v, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ')} fill={TEAL} fillOpacity=".22" stroke={TEAL} strokeWidth="2" />
      {subtes.map((s, i) => {
        const [x, y] = pt(i, nilai[i]);
        const [lx, ly] = pt(i, 1.25);
        return (
          <g key={s.kode}>
            <circle cx={x} cy={y} r="3" fill={GRN} />
            <text x={lx} y={ly} fontSize="11" fontWeight="700" fill={TXT} textAnchor="middle" dominantBaseline="middle">{s.kode}</text>
          </g>
        );
      })}
    </svg>
  );
}

function BarisSubtes({ subtes }) {
  return subtes.map((s) => (
    <div key={s.kode} style={{ padding: '7px 0', borderBottom: `1px solid ${LINE}`, breakInside: 'avoid' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span><b>{s.kode}</b> <span style={{ color: MUT }}>{s.nama}</span></span>
        <span>
          <b style={{ color: warnaRr(s.rr_rata) }}>{Math.round(s.rr_rata)} RR</b>
          {s.level_tertinggi ? <span style={{ color: MUT }}> · Level {s.level_tertinggi}</span> : null}
        </span>
      </div>
      <div style={{ marginTop: 4, height: 5, borderRadius: 9, background: LINE, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, s.rr_rata))}%`, height: '100%', background: warnaRr(s.rr_rata) }} />
      </div>
    </div>
  ));
}

function Butir({ judul, sub, warna }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: `1px solid ${LINE}`, breakInside: 'avoid' }}>
      <span style={{ marginTop: 4, width: 7, height: 7, borderRadius: 9, background: warna, flexShrink: 0 }} />
      <div style={{ fontSize: 10.5 }}>
        <b>{judul}</b>
        <div style={{ color: MUT, fontSize: 9.5, marginTop: 1 }}>{sub}</div>
      </div>
    </div>
  );
}

function Tabel({ kolom, baris }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 10.5 }}>
      <thead>
        <tr style={{ borderBottom: `1.5px solid ${TEAL}` }}>
          {kolom.map((k) => (
            <th key={k.judul} style={{ width: k.lebar, textAlign: k.kanan ? 'right' : 'left', fontSize: 8.5, fontWeight: 700, letterSpacing: '.1em', color: MUT, textTransform: 'uppercase', padding: '0 6px 5px', whiteSpace: 'nowrap' }}>
              {k.judul}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {baris.map((b, i) => (
          <tr key={i} style={{ borderBottom: `1px solid ${LINE}`, breakInside: 'avoid' }}>
            {b.map((c, j) => (
              <td key={j} style={{ textAlign: kolom[j].kanan ? 'right' : 'left', padding: '6px' }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Laporan per siswa; `data` = respons profil siswa (/api/admin/siswa/:id/profil). */
export function CetakSiswa({ data }) {
  const { siswa, ringkasan: r, streak, subtes, rekomendasi, terkuat, sesi } = data;
  const sub = [siswa.lembaga, data.tes?.nama && `tes ${data.tes.nama}`, `30 hari terakhir sampai ${tanggalPanjang()}`].filter(Boolean).join(' · ');
  return (
    <KertasKop>
      <Judul kecil="LAPORAN PERKEMBANGAN SISWA" besar={siswa.nama} sub={sub} />
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Kpi label="Akurasi" nilai={r.akurasi === null ? '-' : `${r.akurasi}%`} sub={`${r.benar} dari ${r.jawaban} benar`} warna={GRN} />
        <Kpi label="Sesi selesai" nilai={r.sesi_selesai} sub={`${r.jawaban} jawaban`} />
        <Kpi label="Streak" nilai={`${streak.saat_ini} hari`} sub={`terpanjang ${streak.terpanjang} hari`} />
        <Kpi label="Subtopik dilatih" nilai={`${r.subtopik_dilatih}/${r.subtopik_total}`} sub={`${r.hari_aktif} hari aktif`} />
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
        <Bagian judul="Radar kemampuan" style={{ width: 240, flexShrink: 0 }}><RadarCetak subtes={subtes} /></Bagian>
        <Bagian judul="Level dan RR per subtes" style={{ flex: 1 }}><BarisSubtes subtes={subtes} /></Bagian>
      </div>
      <div style={{ marginTop: 12, background: SOFT, borderRadius: 8, padding: '10px 12px', fontSize: 10.5, lineHeight: 1.55 }}>
        <b style={{ color: TEAL }}>Ringkasan.</b> {ringkasanSiswa(data)}
      </div>

      <div style={{ breakBefore: 'page', paddingTop: 2 }}>
        <Judul kecil="LAPORAN PERKEMBANGAN SISWA" besar={siswa.nama} sub="Lanjutan · subtopik dan riwayat sesi" />
        <div style={{ display: 'flex', gap: 18, marginTop: 12 }}>
          <Bagian judul="Subtopik terkuat" style={{ flex: 1 }}>
            {terkuat.length === 0 && <div style={{ fontSize: 10.5, color: MUT }}>Belum ada data.</div>}
            {terkuat.map((t) => <Butir key={`${t.subtes}${t.subtopik}`} judul={t.subtopik} sub={`${t.subtes} · Level ${t.level} · RR ${Math.round(t.rr)}`} warna={GRN} />)}
          </Bagian>
          <Bagian judul="Perlu diperkuat / dicoba" style={{ flex: 1 }}>
            {rekomendasi.length === 0 && <div style={{ fontSize: 10.5, color: MUT }}>Belum ada rekomendasi.</div>}
            {rekomendasi.map((t) => (
              <Butir key={`${t.subtes}${t.subtopik}`} judul={t.subtopik} sub={`${t.subtes} · ${t.alasan} · RR ${Math.round(t.rr)}`} warna={t.rr < 35 ? BAD : EMAS} />
            ))}
          </Bagian>
        </div>
        <Bagian judul="Riwayat sesi terbaru" style={{ marginTop: 14 }}>
          {sesi.length === 0 ? (
            <div style={{ fontSize: 10.5, color: MUT }}>Belum ada sesi.</div>
          ) : (
            <Tabel
              kolom={[{ judul: 'Waktu', lebar: '34%' }, { judul: 'Sesi', lebar: '28%' }, { judul: 'Benar', lebar: '16%', kanan: true }, { judul: 'Perubahan', lebar: '22%', kanan: true }]}
              baris={sesi.slice(0, 10).map((s) => [
                tglSingkat(s.mulai),
                `${NAMA_MODE[s.mode] || s.mode}${s.subtes ? ` · ${s.subtes}` : ''}`,
                `${s.benar}/${s.soal}`,
                <b key="d" style={{ color: s.rr_delta < 0 ? BAD : GRN }}>{s.rr_delta > 0 ? '+' : ''}{s.rr_delta} RR</b>,
              ])}
            />
          )}
        </Bagian>
        <div style={{ marginTop: 14, fontSize: 9, color: MUT }}>Dicetak {tanggalPanjang()}</div>
      </div>
    </KertasKop>
  );
}

const STATUS = {
  aktif: ['Aktif', GRN],
  perlu_dorongan: ['Perlu dorongan', EMAS],
  perlu_perhatian: ['Perlu perhatian', BAD],
  belum_mulai: ['Belum mulai', MUT],
};
function ChipCetak({ status }) {
  const [t, c] = STATUS[status] || STATUS.belum_mulai;
  return <span style={{ fontSize: 9, fontWeight: 700, color: c, border: `1px solid ${c}`, borderRadius: 99, padding: '2px 7px', whiteSpace: 'nowrap' }}>{t}</span>;
}

function AktivitasCetak({ data }) {
  const W = 640, H = 90, bw = 15;
  const gap = (W - data.length * bw) / Math.max(1, data.length - 1);
  const m = Math.max(...data.map((d) => d.sesi), 1);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sesi per hari">
      {data.map((d, i) => {
        const h = Math.max(2, (d.sesi / m) * (H - 18));
        return <rect key={d.hari} x={i * (bw + gap)} y={H - 12 - h} width={bw} height={h} rx="2" fill={i >= data.length - 7 ? GRN : TEAL} opacity={i >= data.length - 7 ? 1 : 0.6} />;
      })}
      <text x="0" y={H - 1} fontSize="8" fill={MUT}>{data[0]?.hari}</text>
      <text x={W} y={H - 1} fontSize="8" fill={MUT} textAnchor="end">{data[data.length - 1]?.hari}</text>
    </svg>
  );
}

const teksTerakhir = (s) => (s.hari_sejak === null ? 'Belum mulai' : s.hari_sejak === 0 ? 'Hari ini' : s.hari_sejak === 1 ? 'Kemarin' : `${s.hari_sejak} hari lalu`);

/** Laporan keseluruhan; `data` = respons /api/admin/laporan-siswa. */
export function CetakKelas({ data }) {
  const { ringkasan: r, aktivitas, subtes, siswa } = data;
  const rows = siswa.map((s) => [
    <b key="n">{s.nama}</b>,
    s.sesi_30_hari,
    s.akurasi === null ? '-' : `${s.akurasi}%`,
    `${s.streak} hari`,
    s.rr_rata === null ? '-' : Math.round(s.rr_rata),
    teksTerakhir(s),
    <ChipCetak key="s" status={s.status} />,
  ]);
  return (
    <KertasKop>
      <Judul kecil="LAPORAN KESELURUHAN SISWA" besar={data.lembaga || 'Semua lembaga'} sub={`${r.siswa} siswa · 30 hari terakhir sampai ${tanggalPanjang()}`} />
      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <Kpi label="Siswa aktif" nilai={`${r.siswa_aktif_7_hari}/${r.siswa}`} sub="berlatih 7 hari" />
        <Kpi label="Akurasi" nilai={r.akurasi_30_hari === null ? '-' : `${r.akurasi_30_hari}%`} sub="30 hari" warna={GRN} />
        <Kpi label="Sesi" nilai={r.sesi_30_hari} sub={`rata-rata ${r.sesi_rata_per_siswa}/siswa`} />
        <Kpi label="Rata-rata RR" nilai={r.rr_rata === null ? '-' : r.rr_rata} sub="dari 100" />
        <Kpi label="Perlu perhatian" nilai={r.perlu_perhatian} sub="siswa" warna={BAD} />
      </div>
      <Bagian judul="Aktivitas 30 hari (sesi per hari)" style={{ marginTop: 14 }}><AktivitasCetak data={aktivitas} /></Bagian>
      <Bagian judul="RR rata-rata per subtes" style={{ marginTop: 12 }}>
        {subtes.length ? <BarisSubtes subtes={subtes.map((s) => ({ ...s, level_tertinggi: null }))} /> : <div style={{ fontSize: 10.5, color: MUT }}>Belum ada data latihan.</div>}
      </Bagian>

      <div style={{ breakBefore: 'page', paddingTop: 2 }}>
        <Judul kecil="LAPORAN KESELURUHAN SISWA" besar="Daftar siswa" sub="Diurutkan dari yang paling perlu perhatian" />
        <div style={{ marginTop: 12 }}>
          <Tabel
            kolom={[
              { judul: 'Siswa', lebar: '25%' },
              { judul: 'Sesi', lebar: '7%', kanan: true },
              { judul: 'Akurasi', lebar: '10%', kanan: true },
              { judul: 'Streak', lebar: '11%', kanan: true },
              { judul: 'RR rata', lebar: '10%', kanan: true },
              { judul: 'Terakhir aktif', lebar: '15%', kanan: true },
              { judul: 'Status', lebar: '22%', kanan: true },
            ]}
            baris={rows}
          />
        </div>
        <div style={{ marginTop: 10, fontSize: 9, color: MUT }}>Dicetak {tanggalPanjang()}</div>
      </div>
    </KertasKop>
  );
}
