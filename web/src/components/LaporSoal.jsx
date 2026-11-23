import { useState } from 'react';
import { api } from '../lib/api.js';

// Tombol kecil "Laporkan soal" + lembar pilihan alasan. Dipakai di layar ujian, stage, dan tinjauan hasil.
// Pewaktu soal tidak berhenti saat lembar terbuka (sengaja, supaya tidak bisa dipakai untuk menambah waktu).
export default function LaporSoal({ questionId, sedangUjian = false, className = '' }) {
  const [buka, setBuka] = useState(false);
  const [alasan, setAlasan] = useState(null);
  const [daftar, setDaftar] = useState(null);
  const [catatan, setCatatan] = useState('');
  const [mengirim, setMengirim] = useState(false);
  const [galat, setGalat] = useState('');
  const [terkirim, setTerkirim] = useState(false);

  async function bukaLembar() {
    setBuka(true);
    setGalat('');
    if (!daftar) {
      try {
        setDaftar((await api.alasanLapor()).alasan);
      } catch (e) {
        setGalat(e.message);
      }
    }
  }

  async function kirim() {
    setMengirim(true);
    setGalat('');
    try {
      await api.laporSoal({ question_id: questionId, alasan, catatan: catatan.trim() || undefined });
      setTerkirim(true);
      setBuka(false);
    } catch (e) {
      setGalat(e.message);
    } finally {
      setMengirim(false);
    }
  }

  const perluCatatan = alasan === 'lainnya' && !catatan.trim();

  return (
    <>
      <button
        type="button"
        onClick={bukaLembar}
        disabled={terkirim}
        className={`text-xs ${terkirim ? 'text-lime' : 'text-redup underline decoration-dotted underline-offset-4'} ${className}`}
      >
        {terkirim ? '✓ Terima kasih, laporan terkirim' : 'Laporkan soal ini'}
      </button>

      {buka && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setBuka(false)}>
          <div
            role="dialog"
            aria-label="Laporkan soal"
            className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-line bg-card p-5 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[19px] font-extrabold tracking-tight">Laporkan soal</h2>
                <p className="text-xs text-redup">
                  Ada masalah di soal ini?{sedangUjian ? ' Waktu soal tetap berjalan.' : ''}
                </p>
              </div>
              <button onClick={() => setBuka(false)} className="px-1 text-xl text-redup" aria-label="Tutup">
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {(daftar || []).map((a) => (
                <label
                  key={a.kode}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 text-sm ${
                    alasan === a.kode ? 'border-lime bg-card-2' : 'border-line'
                  }`}
                >
                  <input
                    type="radio"
                    name="alasan-lapor"
                    value={a.kode}
                    checked={alasan === a.kode}
                    onChange={() => setAlasan(a.kode)}
                    className="accent-[#52c5b4]"
                  />
                  {a.label}
                </label>
              ))}
              {!daftar && !galat && <p className="text-sm text-redup">Memuat pilihan…</p>}
            </div>

            {alasan && (
              <textarea
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder={alasan === 'lainnya' ? 'Jelaskan masalahnya (wajib)' : 'Catatan tambahan (opsional)'}
                className="mt-3 w-full rounded-2xl border border-line bg-bg px-4 py-3 text-sm outline-none focus:border-aksen"
              />
            )}

            {galat && <p className="mt-3 rounded-xl bg-bahaya/10 p-3 text-sm text-bahaya">{galat}</p>}

            <button
              onClick={kirim}
              disabled={!alasan || perluCatatan || mengirim}
              className="mt-4 min-h-[52px] w-full rounded-[14px] bg-lime py-3 text-[15px] font-extrabold text-bg disabled:opacity-40"
            >
              {mengirim ? 'Mengirim…' : 'Kirim laporan'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
