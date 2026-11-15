import { Layar } from '../components/Dasar.jsx';

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
          <div key={h.urutan} className="flex items-center justify-between rounded-2xl bg-card px-4 py-2.5 text-sm">
            <span>Soal {h.urutan}</span>
            <span className="flex items-center gap-3">
              {h.is_speed_bonus && <span className="text-xs text-emas">⚡ cepat</span>}
              {h.is_flagged_guess && <span className="text-xs text-redup">terlalu cepat</span>}
              {h.kena_strike > 0 ? (
                <span className="font-bold text-emas">✗ ⚠️ Strike {h.kena_strike}</span>
              ) : (
                <span className={h.rr_delta >= 0 ? 'font-bold text-lime' : 'font-bold text-bahaya'}>
                  {h.is_correct ? '✓' : '✗'} {h.rr_delta > 0 ? '+' : ''}
                  {h.rr_delta}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <button onClick={onKembali} className="mt-8 w-full rounded-2xl bg-lime py-3.5 font-bold text-bg">
        Kembali ke Beranda
      </button>
    </Layar>
  );
}
