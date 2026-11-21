import { useState } from 'react';
import { Layar } from '../components/Dasar.jsx';
import LaporSoal from '../components/LaporSoal.jsx';
import TeksSoal from '../components/TeksSoal.jsx';

function jam(iso) {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function Angka({ nilai, label, warna = 'text-teks' }) {
  return (
    <div className="rounded-2xl bg-card p-3 text-center">
      <p className={`text-2xl font-extrabold ${warna}`}>{nilai}</p>
      <p className="mt-0.5 text-xs text-redup">{label}</p>
    </div>
  );
}

// Layar hasil setelah sesi selesai. Bentuk data berbeda untuk drill dan Domain 0.
export default function Hasil({ mode, hasil, onKembali }) {
  const [buka, setBuka] = useState(null); // nomor soal yang sedang ditinjau
  if (mode === 'domain0') {
    return (
      <Layar>
        <div className="flex flex-1 flex-col justify-center text-center">
          <p className="text-5xl">{hasil.lulus ? '🎉' : '💪'}</p>
          <h1 className="mt-4 text-2xl font-extrabold">
            {hasil.lulus ? 'Lulus Ujian Kelayakan Dasar' : 'Belum lulus'}
          </h1>
          <p className="mt-2 text-sm text-redup">
            Benar {hasil.jumlah_benar} dari {hasil.jumlah_soal} soal.
            {hasil.lulus
              ? ' Semua topik matematika sekarang terbuka.'
              : ` Syarat lulus: semua benar.${
                  hasil.cooldown_until ? ` Bisa mengulang setelah ${jam(hasil.cooldown_until)}.` : ''
                }`}
          </p>
        </div>
        <button onClick={onKembali} className="w-full rounded-2xl bg-lime py-3.5 font-bold text-bg">
          Kembali ke Beranda
        </button>
      </Layar>
    );
  }

  const r = hasil.ringkasan;
  const delta = r.total_rr_delta;
  const naik = hasil.mastery.filter((m) => m.naik_level).length;
  const turun = hasil.mastery.filter((m) => m.turun_level).length;
  const strike2 = hasil.mastery.some((m) => m.kena_strike_2);
  const cooldown = hasil.topik.find((t) => t.cooldown_until && new Date(t.cooldown_until) > new Date());

  return (
    <Layar>
      <h1 className="text-2xl font-extrabold">Sesi selesai</h1>
      <p className="mt-1 text-sm text-redup">
        {delta > 0 ? 'Progres Anda naik.' : delta < 0 ? 'RR turun, tetap semangat.' : 'RR tidak berubah.'}
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Angka nilai={r.jumlah_benar} label="Benar" warna="text-lime" />
        <Angka nilai={r.jumlah_salah} label="Salah" warna="text-bahaya" />
        <Angka nilai={`${delta > 0 ? '+' : ''}${delta}`} label="RR" warna={delta >= 0 ? 'text-aksen' : 'text-bahaya'} />
      </div>

      {naik > 0 && (
        <p className="mt-4 rounded-2xl bg-lime/10 p-3 text-sm text-lime">
          🚀 {naik} subtopik naik level!
        </p>
      )}
      {turun > 0 && (
        <p className="mt-4 rounded-2xl bg-bahaya/10 p-3 text-sm text-bahaya">
          ⚠️ {turun} subtopik turun level{strike2 ? ' karena Strike 2' : ''}.
        </p>
      )}
      {cooldown && (
        <p className="mt-4 rounded-2xl bg-card-2 p-3 text-sm">⏳ Topik dijeda sampai {jam(cooldown.cooldown_until)}.</p>
      )}

      <h2 className="mt-6 mb-2 text-sm font-bold uppercase tracking-wide text-redup">Per soal</h2>
      <div className="space-y-2">
        {hasil.hasil.map((h) => (
          <div key={h.urutan} className="rounded-2xl bg-card text-sm">
            <button
              onClick={() => setBuka(buka === h.urutan ? null : h.urutan)}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left"
            >
              <span>
                Soal {h.urutan} <span className="text-xs text-redup">{buka === h.urutan ? '▴' : '▾ tinjau'}</span>
              </span>
              <span className="flex items-center gap-3">
                {h.is_speed_bonus && <span className="text-xs text-emas">⚡ cepat</span>}
                {h.is_flagged_guess && <span className="text-xs text-redup">terlalu cepat</span>}
                {h.efek === 'waktu_habis' ? (
                  <span className="font-bold text-redup">⏰ Waktu habis · RR tetap</span>
                ) : h.kena_strike > 0 ? (
                  <span className="font-bold text-emas">✗ ⚠️ Strike {h.kena_strike}</span>
                ) : (
                  <span className={h.rr_delta >= 0 ? 'font-bold text-lime' : 'font-bold text-bahaya'}>
                    {h.is_correct ? '✓' : '✗'} {h.rr_delta > 0 ? '+' : ''}
                    {h.rr_delta}
                  </span>
                )}
              </span>
            </button>
            {buka === h.urutan && <Tinjauan h={h} />}
          </div>
        ))}
      </div>

      <button onClick={onKembali} className="mt-8 w-full rounded-2xl bg-lime py-3.5 font-bold text-bg">
        Kembali ke Beranda
      </button>
    </Layar>
  );
}

// Tinjauan satu soal: teks soal, pilihan (kunci hijau, jawaban Anda merah bila salah), dan pembahasan.
function Tinjauan({ h }) {
  const opsi = Array.isArray(h.opsi_jawaban) ? h.opsi_jawaban : [];
  const kunci = typeof h.kunci_jawaban === 'string' ? h.kunci_jawaban : null;
  return (
    <div className="border-t border-line px-4 py-3">
      {h.soal_teks && <TeksSoal teks={h.soal_teks} className="leading-relaxed" />}
      {opsi.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {opsi.map((o) => {
            const benar = o.kode === kunci;
            const pilihan = o.kode === h.jawaban_siswa;
            return (
              <div
                key={o.kode}
                className={`flex gap-2 rounded-xl px-3 py-2 ${
                  benar ? 'bg-lime/15 text-lime' : pilihan ? 'bg-bahaya/15 text-bahaya' : 'text-redup'
                }`}
              >
                <span className="font-bold">{o.kode}.</span>
                <span className="flex-1">{o.teks}</span>
                {benar && <span className="text-xs font-bold">kunci</span>}
                {pilihan && !benar && <span className="text-xs font-bold">jawaban Anda</span>}
              </div>
            );
          })}
        </div>
      )}
      {!h.jawaban_siswa && <p className="mt-2 text-xs text-redup">Tidak dijawab.</p>}
      {h.pembahasan ? (
        <div className="mt-3 rounded-xl bg-card-2 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-aksen">Pembahasan</p>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed">{h.pembahasan}</p>
          {h.pembahasan_gambar_url && (
            <img src={h.pembahasan_gambar_url} alt="" className="mt-2 max-h-56 w-full rounded-xl object-contain" />
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-redup">Pembahasan untuk soal ini belum tersedia.</p>
      )}
      {h.question_id && (
        <div className="mt-3 text-right">
          <LaporSoal questionId={h.question_id} />
        </div>
      )}
    </div>
  );
}
