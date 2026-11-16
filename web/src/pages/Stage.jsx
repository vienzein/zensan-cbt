import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { Layar, Memuat, Galat } from '../components/Dasar.jsx';

const mmss = (d) => `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
const jam = (iso) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

// Tes diagnostik Domain 0 berbasis stage: peta stage berurutan -> 3 soal dengan satu batas waktu -> hasil.
export default function Stage({ tesId, onKembali }) {
  const [peta, setPeta] = useState(null);
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [sesi, setSesi] = useState(null);   // respons start
  const [hasil, setHasil] = useState(null); // respons submit

  const muat = useCallback(async () => {
    setGalat('');
    try {
      setPeta(await api.daftarStage(tesId));
    } catch (e) {
      setGalat(e.message);
    }
  }, [tesId]);
  useEffect(() => { muat(); }, [muat]);

  async function mulai() {
    setSibuk(true);
    setGalat('');
    try {
      setSesi(await api.mulaiStage(tesId));
      setHasil(null);
    } catch (e) {
      setGalat(e.message);
      muat();
    } finally {
      setSibuk(false);
    }
  }

  if (sesi && !hasil) {
    return (
      <Kerjakan
        key={sesi.attempt_id}
        sesi={sesi}
        onSelesai={(h) => { setHasil(h); }}
      />
    );
  }
  if (sesi && hasil) {
    return (
      <HasilStage
        sesi={sesi}
        hasil={hasil}
        onLanjut={() => { setSesi(null); setHasil(null); muat().then(mulai); }}
        onBerhenti={() => { setSesi(null); setHasil(null); muat(); }}
      />
    );
  }

  if (!peta) {
    return galat ? (
      <Layar><Galat pesan={galat} aksi="Coba lagi" onAksi={muat} /></Layar>
    ) : <Memuat />;
  }

  const jeda = peta.cooldown_until && new Date(peta.cooldown_until) > new Date();
  return (
    <Layar>
      <header className="flex items-center justify-between">
        <button onClick={onKembali} className="text-sm text-redup">← Kembali</button>
        <span className="text-xs font-semibold text-redup">Tes Diagnostik</span>
      </header>
      <h1 className="mt-4 text-xl font-extrabold">Peta Stage</h1>
      <p className="mt-1 text-sm text-redup">
        {peta.jumlah_lulus} dari {peta.total_stage} stage lulus. Tiap stage: 3 soal, semua harus benar dan
        selesai sebelum waktu habis.
      </p>
      {peta.gerbang_terbuka && (
        <p className="mt-3 rounded-2xl bg-lime/15 p-3 text-sm font-semibold text-lime">
          Topik PK dan PM sudah terbuka. Stage lanjutan boleh dilanjutkan kapan saja.
        </p>
      )}
      {galat && <div className="mt-3"><Galat pesan={galat} /></div>}

      {peta.stage_berikutnya_id && (
        <button
          onClick={mulai}
          disabled={sibuk || jeda}
          className="mt-4 w-full rounded-2xl bg-lime py-3.5 font-bold text-bg disabled:opacity-40"
        >
          {jeda ? `Jeda sampai ${jam(peta.cooldown_until)}` : sibuk ? 'Menyiapkan…' : 'Mulai Stage Berikutnya'}
        </button>
      )}
      {!peta.stage_berikutnya_id && <p className="mt-4 text-sm font-semibold">Semua stage sudah lulus. 🎉</p>}

      <ul className="mt-5 space-y-2">
        {peta.stages.map((s) => (
          <li
            key={s.id}
            className={`rounded-2xl border p-3 text-sm ${
              s.status === 'lulus' ? 'border-lime/40 bg-card' : s.status === 'berikutnya' ? 'border-aksen bg-card-2' : 'border-line bg-card opacity-60'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold">{s.kode}</span>
              <span className="text-xs text-redup">
                {s.status === 'lulus' ? '✓ Lulus' : s.status === 'berikutnya' ? 'Berikutnya' : '🔒'} · {mmss(s.batas_detik)}
              </span>
            </div>
            <p className="text-redup">{s.nama_topik} — {s.indikator}</p>
          </li>
        ))}
      </ul>
    </Layar>
  );
}

function Kerjakan({ sesi, onSelesai }) {
  const { soal, attempt_id: attemptId } = sesi;
  const [idx, setIdx] = useState(0);
  const [jawab, setJawab] = useState({});
  const [sisa, setSisa] = useState(sesi.sisa_detik);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState('');
  const selesai = useRef(false);
  const mulaiMs = useRef(performance.now());
  const jawabRef = useRef(jawab);
  jawabRef.current = jawab;

  const kirim = useCallback(async () => {
    if (selesai.current) return;
    selesai.current = true;
    setMengirim(true);
    setGalat('');
    try {
      const jawaban = soal.map((q) => ({
        question_id: q.question_id,
        jawaban_siswa: jawabRef.current[q.question_id] ?? null,
      }));
      onSelesai(await api.kirimStage({ attempt_id: attemptId, jawaban }));
    } catch (e) {
      selesai.current = false;
      setMengirim(false);
      setGalat(e.message);
    }
  }, [soal, attemptId, onSelesai]);

  useEffect(() => {
    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil(sesi.sisa_detik - (performance.now() - mulaiMs.current) / 1000));
      setSisa(s);
      if (s <= 0) kirim();
    }, 250);
    return () => clearInterval(t);
  }, [sesi.sisa_detik, kirim]);

  const q = soal[idx];
  const opsi = Array.isArray(q.opsi_jawaban) ? q.opsi_jawaban : [];
  const pilihan = jawab[q.question_id] ?? '';
  const terakhir = idx === soal.length - 1;

  return (
    <Layar>
      <header className="flex items-center justify-between">
        <span className="text-xs font-semibold text-redup">{sesi.stage.kode}</span>
        <span className={`rounded-full px-3 py-1 text-sm font-bold tabular-nums ${sisa <= 10 ? 'bg-bahaya/20 text-bahaya' : 'bg-card-2 text-aksen'}`}>
          {mmss(sisa)}
        </span>
      </header>
      <p className="mt-3 text-xs text-redup">Soal {idx + 1} dari {soal.length}</p>

      <section className="mt-3 flex-1">
        <p className="whitespace-pre-wrap text-base leading-relaxed">{q.soal_teks}</p>
        {q.soal_gambar_url && <img src={q.soal_gambar_url} alt="" className="mt-4 max-h-64 w-full rounded-2xl object-contain" />}
        <div className="mt-5 space-y-2.5">
          {opsi.length > 0 ? opsi.map((o) => (
            <button
              key={o.kode}
              onClick={() => setJawab({ ...jawab, [q.question_id]: o.kode })}
              disabled={mengirim}
              className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left ${pilihan === o.kode ? 'border-aksen bg-card-2' : 'border-line bg-card'}`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${pilihan === o.kode ? 'bg-aksen text-bg' : 'bg-line text-redup'}`}>{o.kode}</span>
              <span className="pt-0.5">{o.teks}</span>
            </button>
          )) : (
            <input
              value={pilihan}
              onChange={(e) => setJawab({ ...jawab, [q.question_id]: e.target.value })}
              placeholder="Ketik jawaban"
              className="w-full rounded-2xl border border-line bg-card px-4 py-3.5 outline-none focus:border-aksen"
            />
          )}
        </div>
      </section>

      {galat && <div className="mt-3"><Galat pesan={galat} aksi="Kirim ulang" onAksi={kirim} /></div>}

      <footer className="sticky bottom-0 mt-6 flex gap-3 bg-bg pt-3 pb-2">
        {idx > 0 && (
          <button onClick={() => setIdx(idx - 1)} disabled={mengirim} className="rounded-2xl border border-line px-5 py-3.5 font-semibold text-redup">
            Sebelumnya
          </button>
        )}
        <button
          onClick={() => (terakhir ? kirim() : setIdx(idx + 1))}
          disabled={mengirim}
          className="flex-1 rounded-2xl bg-lime py-3.5 font-bold text-bg disabled:opacity-40"
        >
          {mengirim ? 'Mengirim…' : terakhir ? 'Selesai' : 'Lanjut'}
        </button>
      </footer>
    </Layar>
  );
}

function HasilStage({ sesi, hasil, onLanjut, onBerhenti }) {
  const jeda = hasil.cooldown_until && new Date(hasil.cooldown_until) > new Date();
  const sisaPercobaan = 3 - hasil.gagal_beruntun;
  return (
    <Layar>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-5xl">{hasil.lulus ? '🎉' : '💪'}</p>
        <h1 className="mt-3 text-2xl font-extrabold">{hasil.lulus ? 'Stage lulus!' : 'Belum lulus'}</h1>
        <p className="mt-2 text-sm text-redup">
          {sesi.stage.kode} · {hasil.jumlah_benar}/{hasil.jumlah_soal} benar · {Math.round(hasil.durasi_detik)} dtk
          (batas {Math.round(hasil.batas_detik)} dtk)
        </p>
        {!hasil.lulus && hasil.jumlah_benar === hasil.jumlah_soal && !hasil.tepat_waktu && (
          <p className="mt-2 text-sm">Semua benar, tetapi melewati batas waktu.</p>
        )}
        {!hasil.lulus && !jeda && (
          <p className="mt-2 text-sm text-redup">Kamu boleh langsung mengulang. Kesempatan sebelum jeda: {sisaPercobaan}.</p>
        )}
        {jeda && <p className="mt-2 text-sm font-semibold">Jeda sampai {jam(hasil.cooldown_until)}.</p>}
        {hasil.gerbang_terbuka && hasil.lulus && <p className="mt-3 text-sm font-semibold text-lime">Topik PK dan PM terbuka!</p>}
      </div>
      <div className="space-y-3">
        {!jeda && (hasil.lulus ? hasil.stage_berikutnya_id : true) && (
          <button onClick={onLanjut} className="w-full rounded-2xl bg-lime py-3.5 font-bold text-bg">
            {hasil.lulus ? 'Lanjut ke stage berikutnya' : 'Ulangi stage'}
          </button>
        )}
        <button onClick={onBerhenti} className="w-full rounded-2xl border border-line py-3.5 font-semibold text-redup">
          Berhenti dulu
        </button>
      </div>
    </Layar>
  );
}
