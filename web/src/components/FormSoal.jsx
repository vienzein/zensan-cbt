import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import TeksSoal from './TeksSoal.jsx';

// Form soal untuk admin: dipakai untuk soal baru (awal = null) dan edit soal (awal = data dari /admin/soal/:id).
// Saat edit, subtes dan topik tetap; yang boleh diubah: isi soal, opsi, kunci, level, waktu, gambar, subtopik.

const HURUF = ['A', 'B', 'C', 'D', 'E'];
const kolom = 'w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-aksen';

function Label({ judul, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-redup">{judul}</span>
      {children}
    </label>
  );
}

function Gambar({ judul, url, setUrl, setGalat }) {
  const [sibuk, setSibuk] = useState(false);
  async function pilih(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setSibuk(true);
    setGalat('');
    try {
      setUrl((await api.adminUnggahGambar(f)).url);
    } catch (err) {
      setGalat(err.message);
    }
    setSibuk(false);
  }
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <p className="mb-2 text-xs font-semibold text-redup">{judul}</p>
      {url && <img src={url} alt="" className="mb-2 max-h-48 rounded-lg border border-line" />}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={pilih} disabled={sibuk} className="text-xs" />
        {sibuk && <span className="text-xs text-redup">Mengunggah…</span>}
        {url && (
          <button type="button" onClick={() => setUrl('')} className="text-xs text-bahaya underline">
            Hapus gambar
          </button>
        )}
      </div>
    </div>
  );
}

export default function FormSoal({ pilihan, awal, onSelesai }) {
  const edit = Boolean(awal);
  const [subtes, setSubtes] = useState(awal?.subtes || pilihan[0]?.kode || '');
  const [topikId, setTopikId] = useState(awal?.topik_id || '');
  const [subIds, setSubIds] = useState(new Set(awal?.subtopik_ids || []));
  const [level, setLevel] = useState(awal?.level || 1);
  const [teks, setTeks] = useState(awal?.teks || '');
  const [opsi, setOpsi] = useState(awal?.opsi || { A: '', B: '', C: '', D: '', E: '' });
  const [kunci, setKunci] = useState(awal?.kunci || '');
  const [pembahasan, setPembahasan] = useState(awal?.pembahasan || '');
  const [gambar, setGambar] = useState(awal?.gambar_url || '');
  const [pembGambar, setPembGambar] = useState(awal?.pembahasan_gambar_url || '');
  const [waktu, setWaktu] = useState(awal?.waktu_detik ? String(awal.waktu_detik) : '');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const [rincian, setRincian] = useState([]);

  const subtesIni = useMemo(() => pilihan.find((s) => s.kode === subtes), [pilihan, subtes]);
  const topikIni = useMemo(
    () => subtesIni?.topik.find((t) => t.id === topikId) || null,
    [subtesIni, topikId],
  );

  function gantiSubtes(k) {
    setSubtes(k);
    setTopikId('');
    setSubIds(new Set());
  }
  function gantiTopik(id) {
    setTopikId(id);
    setSubIds(new Set());
  }
  const alih = (id) =>
    setSubIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function simpan(e) {
    e.preventDefault();
    setSibuk(true);
    setGalat('');
    setRincian([]);
    const body = {
      subtes,
      topik_id: topikId,
      subtopik_ids: [...subIds],
      level,
      teks,
      opsi,
      kunci,
      pembahasan,
      gambar_url: gambar,
      pembahasan_gambar_url: pembGambar,
      waktu_detik: waktu,
    };
    try {
      const r = edit ? await api.adminUbahSoal(awal.id, body) : await api.adminBuatSoal(body);
      onSelesai(r.id, edit);
    } catch (err) {
      setGalat(err.message);
      setRincian(Array.isArray(err.details) ? err.details : []);
      setSibuk(false);
    }
  }

  const opsiTerisi = HURUF.filter((h) => opsi[h].trim());

  return (
    <form onSubmit={simpan} className="space-y-4">
      {edit ? (
        <p className="rounded-xl bg-card-2 px-3 py-2 text-sm">
          Mengedit soal <b>#{awal.id}</b> · {awal.subtes} / {awal.topik}
          {!awal.aktif && <span className="ml-2 font-bold text-bahaya">(tersembunyi)</span>}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Label judul="Subtes">
            <select value={subtes} onChange={(e) => gantiSubtes(e.target.value)} className={kolom}>
              {pilihan.map((s) => (
                <option key={s.kode} value={s.kode}>
                  {s.kode} · {s.nama}
                </option>
              ))}
            </select>
          </Label>
          <Label judul="Topik">
            <select value={topikId} onChange={(e) => gantiTopik(e.target.value)} className={kolom}>
              <option value="">Pilih topik…</option>
              {subtesIni?.topik.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nama}
                </option>
              ))}
            </select>
          </Label>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold text-redup">
          Subtopik (boleh lebih dari satu, dalam topik yang sama)
        </p>
        <div className="space-y-1.5">
          {(edit ? pilihan.find((s) => s.kode === awal.subtes)?.topik.find((t) => t.id === awal.topik_id) : topikIni)
            ?.subtopik.map((st) => (
              <label key={st.id} className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm">
                <input type="checkbox" checked={subIds.has(st.id)} onChange={() => alih(st.id)} />
                {st.nama}
              </label>
            )) || <p className="text-xs text-redup">Pilih topik dulu.</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Label judul="Level">
          <select value={level} onChange={(e) => setLevel(Number(e.target.value))} className={kolom}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                Level {n}
              </option>
            ))}
          </select>
        </Label>
        <Label judul="Waktu (detik, kosong = bawaan)">
          <input value={waktu} onChange={(e) => setWaktu(e.target.value)} inputMode="numeric" className={kolom} />
        </Label>
      </div>

      <Label judul="Teks soal (tabel: tulis baris dengan pemisah ' | ', baris pertama = judul kolom)">
        <textarea value={teks} onChange={(e) => setTeks(e.target.value)} rows={6} className={kolom} />
      </Label>
      <Gambar judul="Gambar soal (opsional)" url={gambar} setUrl={setGambar} setGalat={setGalat} />

      <div className="space-y-2">
        <p className="text-xs font-semibold text-redup">Opsi jawaban (minimal A dan B, tanpa celah) dan kunci</p>
        {HURUF.map((h) => (
          <div key={h} className="flex items-start gap-2">
            <input
              type="radio"
              name="kunci"
              checked={kunci === h}
              onChange={() => setKunci(h)}
              disabled={!opsi[h].trim()}
              aria-label={`Kunci ${h}`}
              className="mt-3"
            />
            <span className="mt-2.5 w-4 text-sm font-bold">{h}</span>
            <textarea
              value={opsi[h]}
              onChange={(e) => setOpsi({ ...opsi, [h]: e.target.value })}
              rows={1}
              className={kolom}
            />
          </div>
        ))}
        {kunci && !opsiTerisi.includes(kunci) && <p className="text-xs text-bahaya">Kunci {kunci} belum punya teks opsi.</p>}
      </div>

      <Label judul="Pembahasan (opsional)">
        <textarea value={pembahasan} onChange={(e) => setPembahasan(e.target.value)} rows={4} className={kolom} />
      </Label>
      <Gambar judul="Gambar pembahasan (opsional)" url={pembGambar} setUrl={setPembGambar} setGalat={setGalat} />

      {teks.trim() && (
        <div className="rounded-xl border border-dashed border-line p-3">
          <p className="mb-2 text-xs font-semibold text-redup">Pratinjau soal</p>
          <TeksSoal teks={teks} className="text-sm leading-relaxed" />
          <ul className="mt-2 space-y-1 text-sm">
            {opsiTerisi.map((h) => (
              <li key={h}>
                <b>{h}{kunci === h ? ' ✓' : ''}.</b> {opsi[h]}
              </li>
            ))}
          </ul>
        </div>
      )}

      {galat && <p className="text-sm font-semibold text-bahaya">{galat}</p>}
      {rincian.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-bahaya">
          {rincian.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      <button
        type="submit"
        disabled={sibuk}
        className="w-full rounded-xl bg-lime py-3.5 font-bold text-bg disabled:opacity-50"
      >
        {sibuk ? 'Menyimpan…' : edit ? 'Simpan perubahan' : 'Simpan soal baru'}
      </button>
    </form>
  );
}
