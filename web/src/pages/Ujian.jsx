import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { Layar, Galat } from '../components/Dasar.jsx';

// Halaman mengerjakan soal. Dipakai untuk drill dan Domain 0.
// Server menilai semuanya sekali di akhir sesi; di sini kita hanya mencatat jawaban dan lama pengerjaan
// tiap soal, lalu mengirimnya berurutan.
//
// sesi = { attempt_id, soal: [...], mode: 'drill' | 'domain0', judul }
export default function Ujian({ sesi, onSelesai, onKeluar }) {
  const { soal, attempt_id: attemptId, mode, judul } = sesi;
  const total = soal.length;

  const [idx, setIdx] = useState(0);
  const [pilihan, setPilihan] = useState(null);
  const [sisa, setSisa] = useState(soal[0].target_waktu_detik);
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState('');
  const [umpan, setUmpan] = useState(null); // umpan balik RR terakhir (popup)
  const timerUmpan = useRef(null);
  const rantai = useRef(Promise.resolve()); // jawaban dikunci berurutan, satu per satu

  const jawaban = useRef([]); // { question_id, jawaban_siswa, durasi_pengerjaan_detik }
  const mulai = useRef(performance.now());
  const sudahMaju = useRef(false); // mencegah dua kali maju pada soal yang sama (waktu habis + klik)

  // pilihan terbaru untuk dibaca oleh timer tanpa membuat ulang interval
  const pilihanRef = useRef(null);
  pilihanRef.current = pilihan;

  const q = soal[idx];
  const opsi = Array.isArray(q.opsi_jawaban) ? q.opsi_jawaban : [];
  const terakhir = idx === total - 1;

  // Peringatan bila siswa menutup tab di tengah sesi.
  useEffect(() => {
    const peringatan = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', peringatan);
    return () => window.removeEventListener('beforeunload', peringatan);
  }, []);

  // Setiap ganti soal: reset timer.
  useEffect(() => {
    mulai.current = performance.now();
    sudahMaju.current = false;
    setPilihan(null);
    setSisa(q.target_waktu_detik);
  }, [idx, q.target_waktu_detik]);

  async function kirim() {
    setMengirim(true);
    setGalat('');
    try {
      const body = { attempt_id: attemptId, jawaban: jawaban.current };
      const hasil = mode === 'domain0' ? await api.kirimDomain0(body) : await api.kirimDrill(body);
      onSelesai(hasil);
    } catch (e) {
      setGalat(e.message);
      setMengirim(false);
    }
  }

  // Popup umpan balik RR, hilang sendiri.
  function tampilkanUmpan(u) {
    setUmpan(u);
    clearTimeout(timerUmpan.current);
    timerUmpan.current = setTimeout(() => setUmpan(null), 1800);
  }
  useEffect(() => () => clearTimeout(timerUmpan.current), []);

  // Kunci jawaban di server dan ambil umpan balik. Gagal (mis. jaringan) tidak menghentikan sesi:
  // submit akhir tetap membawa semua jawaban.
  function kunci(entry) {
    if (mode !== 'drill') return Promise.resolve(null);
    // Dirantai: permintaan berikutnya baru dikirim setelah yang sebelumnya selesai, supaya server
    // menerima jawaban sesuai urutan soal (penting untuk hitungan RR dan Strike).
    const hasil = rantai.current.then(async () => {
      try {
        const u = await api.jawabDrill({ attempt_id: attemptId, ...entry });
        tampilkanUmpan(u);
        return u;
      } catch {
        return null;
      }
    });
    rantai.current = hasil;
    return hasil;
  }

  function lanjut(nilai, waktuHabis = false) {
    if (sudahMaju.current || mengirim) return;
    sudahMaju.current = true;
    const detik = Math.round(((performance.now() - mulai.current) / 1000) * 10) / 10;
    const entry = {
      question_id: q.question_id,
      jawaban_siswa: nilai === '' ? null : nilai,
      durasi_pengerjaan_detik: detik,
      // waktu soal habis tanpa pilihan (server memverifikasi lagi)
      ...(waktuHabis && nilai === '' ? { waktu_habis: true } : {}),
    };
    jawaban.current.push(entry);
    if (terakhir) {
      setMengirim(true);
      (async () => {
        // Soal terakhir: tunggu jawaban terkunci dulu, beri waktu popup terbaca, baru kirim.
        const u = await kunci(entry);
        if (u) await new Promise((r) => setTimeout(r, 1200));
        kirim();
      })();
    } else {
      setIdx(idx + 1);
      kunci(entry);
    }
  }

  // Hitung mundur; saat habis, soal dihitung terjawab sesuai pilihan saat itu (atau kosong).
  useEffect(() => {
    if (mengirim) return undefined;
    const t = setInterval(() => {
      const habis = q.target_waktu_detik - (performance.now() - mulai.current) / 1000;
      setSisa(Math.max(0, Math.ceil(habis)));
      if (habis <= 0) lanjut(pilihanRef.current ?? '', true);
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, mengirim]);

  const menit = String(Math.floor(sisa / 60)).padStart(2, '0');
  const detik = String(sisa % 60).padStart(2, '0');
  const genting = sisa <= 10;

  return (
    <Layar>
      {umpan && <Popup u={umpan} />}

      <header className="flex items-center justify-between">
        <button onClick={() => window.confirm('Keluar dari sesi? Jawaban yang belum dikirim hilang.') && onKeluar()} className="text-sm text-redup">
          ✕ Keluar
        </button>
        <span className="text-xs font-semibold text-redup">{judul}</span>
        <span
          className={`rounded-full px-3 py-1 text-sm font-bold tabular-nums ${
            genting ? 'bg-bahaya/20 text-bahaya' : 'bg-card-2 text-aksen'
          }`}
        >
          {menit}:{detik}
        </span>
      </header>

      <div className="mt-4 flex gap-1">
        {soal.map((s, i) => (
          <div
            key={s.question_id}
            className={`h-1.5 flex-1 rounded-full ${i < idx ? 'bg-lime' : i === idx ? 'bg-aksen' : 'bg-line'}`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-redup">
        Soal {idx + 1} dari {total}
      </p>

      <section className="mt-4 flex-1">
        <p className="whitespace-pre-wrap text-base leading-relaxed">{q.soal_teks}</p>
        {q.soal_gambar_url && (
          <img src={q.soal_gambar_url} alt="" className="mt-4 max-h-64 w-full rounded-2xl object-contain" />
        )}

        <div className="mt-5 space-y-2.5">
          {opsi.length > 0 ? (
            opsi.map((o) => (
              <button
                key={o.kode}
                onClick={() => setPilihan(o.kode)}
                disabled={mengirim}
                className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition active:scale-[0.99] ${
                  pilihan === o.kode ? 'border-aksen bg-card-2' : 'border-line bg-card'
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    pilihan === o.kode ? 'bg-aksen text-bg' : 'bg-line text-redup'
                  }`}
                >
                  {o.kode}
                </span>
                <span className="pt-0.5">{o.teks}</span>
              </button>
            ))
          ) : (
            <input
              value={pilihan ?? ''}
              onChange={(e) => setPilihan(e.target.value)}
              placeholder="Ketik jawaban"
              className="w-full rounded-2xl border border-line bg-card px-4 py-3.5 outline-none focus:border-aksen"
            />
          )}
        </div>
      </section>

      {galat && (
        <div className="mt-4">
          <Galat pesan={galat} aksi="Kirim ulang" onAksi={kirim} />
        </div>
      )}

      <footer className="sticky bottom-0 mt-6 flex gap-3 bg-bg pt-3 pb-2">
        <button
          onClick={() => lanjut('')}
          disabled={mengirim}
          className="rounded-2xl border border-line px-5 py-3.5 font-semibold text-redup disabled:opacity-50"
        >
          Lewati
        </button>
        <button
          onClick={() => lanjut(pilihan ?? '')}
          disabled={mengirim || !pilihan}
          className="flex-1 rounded-2xl bg-lime py-3.5 font-bold text-bg disabled:opacity-40"
        >
          {mengirim ? 'Mengirim…' : terakhir ? 'Selesai' : 'Lanjut'}
        </button>
      </footer>
    </Layar>
  );
}

// Popup umpan balik per jawaban: hijau bila benar, merah bila salah.
function Popup({ u }) {
  const ranked = u.efek !== 'tanpa_rr';
  const waktuHabis = u.efek === 'waktu_habis';
  const rr = u.rr_delta > 0 ? `+${u.rr_delta} RR` : u.rr_delta < 0 ? `−${Math.abs(u.rr_delta)} RR` : 'RR tetap';
  const baris = [];
  if (waktuHabis) baris.push('RR tidak berkurang');
  if (u.kena_strike === 1) baris.push('⚠️ Strike 1: RR tetap 0');
  if (u.kena_strike === 2) baris.push('⚠️ Strike 2: turun level');
  if (u.is_correct && u.is_speed_bonus) baris.push('⚡ Bonus kecepatan');
  if (u.is_correct && u.streak_benar >= 3) baris.push(`🔥 Streak ${u.streak_benar}`);
  if (u.is_flagged_guess) baris.push('Terlalu cepat: tanpa bonus kecepatan');
  if (u.efek === 'cooldown') baris.push('⏳ Topik sedang dijeda');
  return (
    <div
      role="status"
      className={`fixed top-4 left-1/2 z-50 w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 rounded-2xl px-4 py-3 shadow-lg ${
        waktuHabis ? 'bg-card-2 text-teks' : u.is_correct ? 'bg-lime text-bg' : 'bg-bahaya text-white'
      }`}
    >
      <p className="font-extrabold">
        {waktuHabis ? '⏰ Waktu habis' : u.is_correct ? 'Benar!' : 'Salah'}
        {ranked && !u.kena_strike && !waktuHabis ? ` ${rr}` : ''}
      </p>
      {baris.map((b) => (
        <p key={b} className="text-xs font-semibold opacity-90">
          {b}
        </p>
      ))}
    </div>
  );
}
