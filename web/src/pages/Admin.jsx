import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Memuat, Galat } from '../components/Dasar.jsx';
import FormSoal from '../components/FormSoal.jsx';
import { useMuat, Kartu, tgl } from '../components/AdminDasar.jsx';
import { Persetujuan, SoalSaya, Lembaga } from './AdminLembaga.jsx';

// Halaman admin: ringkasan, laporan soal, siswa, dan jumlah soal per subtopik. Hanya muncul bila akun is_admin.

const TAB_SUPER = [
  ['ringkasan', 'Ringkasan'],
  ['persetujuan', 'Persetujuan'],
  ['laporan', 'Laporan'],
  ['input', 'Input soal'],
  ['siswa', 'Siswa'],
  ['lembaga', 'Lembaga'],
  ['bank', 'Bank soal'],
];
const TAB_LEMBAGA = [
  ['ringkasan', 'Ringkasan'],
  ['input', 'Input soal'],
  ['saya', 'Soal saya'],
  ['siswa', 'Siswa'],
];

function Ringkasan() {
  const { data, galat, muat } = useMuat(() => api.adminRingkasan(), []);
  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  if (data.peran === 'admin_lembaga') {
    return (
      <div>
        <p className="mb-3 text-sm text-redup">
          {data.lembaga} · kode undangan siswa: <span className="font-mono font-bold tracking-widest text-teks">{data.kode_undangan}</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Kartu judul="Siswa lembaga" nilai={data.siswa} />
          <Kartu judul="Aktif 7 hari terakhir" nilai={data.siswa_aktif_7_hari} />
          <Kartu judul="Jawaban 24 jam terakhir" nilai={data.jawaban_24_jam} />
          <Kartu judul="Akurasi 30 hari" nilai={data.akurasi_30_hari === null ? '-' : `${data.akurasi_30_hari}%`} />
          <Kartu judul="Soal menunggu" nilai={data.soal_menunggu} catatan="antre persetujuan" />
          <Kartu judul="Soal disetujui" nilai={data.soal_disetujui} catatan={`${data.soal_ditolak} ditolak`} />
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <Kartu judul="Siswa terdaftar" nilai={data.siswa} />
      <Kartu judul="Aktif 7 hari terakhir" nilai={data.siswa_aktif_7_hari} />
      <Kartu judul="Jawaban 24 jam terakhir" nilai={data.jawaban_24_jam} />
      <Kartu judul="Soal aktif" nilai={data.soal_aktif} />
      <Kartu judul="Laporan baru" nilai={data.laporan_baru} catatan={`${data.soal_dilaporkan_baru} soal`} />
      <Kartu judul="Soal tersembunyi" nilai={data.soal_tersembunyi} catatan="karena laporan / admin" />
      <Kartu judul="Soal menunggu persetujuan" nilai={data.soal_menunggu} catatan="dari lembaga mitra" />
      <Kartu judul="Lembaga mitra" nilai={data.lembaga} />
    </div>
  );
}

function DetailLaporan({ id, label, onKembali, onSelesai, onEdit }) {
  const { data, galat, muat } = useMuat(() => api.adminLaporanDetail(id), [id]);
  const [sibuk, setSibuk] = useState(false);
  const [galatAksi, setGalatAksi] = useState('');

  async function tindak(body) {
    setSibuk(true);
    setGalatAksi('');
    try {
      await api.adminTindak(id, body);
      onSelesai();
    } catch (e) {
      setGalatAksi(e.message);
      setSibuk(false);
    }
  }

  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  const { soal, laporan } = data;
  const kunci = Array.isArray(soal.kunci) ? soal.kunci.join(', ') : String(soal.kunci);

  return (
    <div>
      <button onClick={onKembali} className="mb-3 text-sm text-aksen underline">
        ← Daftar laporan
      </button>
      <p className="text-xs text-redup">
        #{soal.id} · {soal.subtes} / {soal.topik} · Level {soal.level} ·{' '}
        {soal.aktif ? 'aktif' : `TERSEMBUNYI (${soal.tersembunyi_karena || 'nonaktif'})`}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{soal.teks}</p>
      {soal.gambar_url && (
        <img src={soal.gambar_url} alt="Gambar soal" className="mt-3 max-h-64 rounded-xl border border-line" />
      )}
      <ul className="mt-3 space-y-1 text-sm">
        {soal.opsi.map((o) => (
          <li key={o.kode} className="whitespace-pre-wrap">
            <b>{o.kode}.</b> {o.teks}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm">
        <b>Kunci tersimpan:</b> {kunci}
      </p>
      {soal.pembahasan && <p className="mt-2 whitespace-pre-wrap text-xs text-redup">{soal.pembahasan}</p>}
      <button
        onClick={() => onEdit(soal.id)}
        className="mt-3 w-full rounded-xl border border-aksen py-3 text-sm font-bold text-aksen"
      >
        Edit soal ini
      </button>

      <h3 className="mt-5 mb-2 text-sm font-bold uppercase tracking-wide text-redup">Laporan ({laporan.length})</h3>
      <ul className="space-y-2">
        {laporan.map((l) => (
          <li key={l.id} className="rounded-xl border border-line bg-card p-3 text-sm">
            <p>
              <b>{label[l.alasan] || l.alasan}</b> <span className="text-xs text-redup">[{l.status}]</span>
            </p>
            {l.catatan && <p className="mt-1 whitespace-pre-wrap">{l.catatan}</p>}
            <p className="mt-1 text-xs text-redup">
              {l.siswa} · {tgl(l.created_at)}
            </p>
          </li>
        ))}
      </ul>

      {galatAksi && <p className="mt-3 text-sm text-bahaya">{galatAksi}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {soal.aktif ? (
          <button
            disabled={sibuk}
            onClick={() => tindak({ status: 'ditinjau', soal_aktif: false })}
            className="rounded-xl bg-bahaya/20 py-3 text-sm font-bold text-bahaya disabled:opacity-40"
          >
            Sembunyikan soal
          </button>
        ) : (
          <button
            disabled={sibuk}
            onClick={() => tindak({ status: 'selesai', soal_aktif: true })}
            className="rounded-xl bg-lime py-3 text-sm font-bold text-bg disabled:opacity-40"
          >
            Sudah diperbaiki, aktifkan
          </button>
        )}
        <button
          disabled={sibuk}
          onClick={() => tindak({ status: 'selesai' })}
          className="rounded-xl bg-card-2 py-3 text-sm font-bold disabled:opacity-40"
        >
          Tandai selesai
        </button>
        <button
          disabled={sibuk}
          onClick={() => tindak({ status: 'ditolak', ...(soal.aktif ? {} : { soal_aktif: true }) })}
          className="col-span-2 rounded-xl border border-line py-3 text-sm font-semibold text-redup disabled:opacity-40"
        >
          Tolak laporan (soal baik-baik saja){soal.aktif ? '' : ' dan aktifkan lagi'}
        </button>
      </div>
    </div>
  );
}

function Laporan({ label }) {
  const [semua, setSemua] = useState(false);
  const [buka, setBuka] = useState(null);
  const [edit, setEdit] = useState(null);
  const { data, galat, muat } = useMuat(() => api.adminLaporan(semua), [semua]);

  if (edit) {
    return (
      <EditSoal
        id={edit}
        onKembali={() => setEdit(null)}
        onSelesai={() => {
          setEdit(null);
          muat();
        }}
      />
    );
  }
  if (buka) {
    return (
      <DetailLaporan
        id={buka}
        label={label}
        onKembali={() => setBuka(null)}
        onEdit={setEdit}
        onSelesai={() => {
          setBuka(null);
          muat();
        }}
      />
    );
  }
  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;

  return (
    <div>
      <label className="mb-3 flex items-center gap-2 text-xs text-redup">
        <input type="checkbox" checked={semua} onChange={(e) => setSemua(e.target.checked)} />
        Tampilkan juga yang sudah selesai / ditolak
      </label>
      {!data.soal.length && <p className="text-sm text-redup">Tidak ada laporan.</p>}
      <ul className="space-y-2">
        {data.soal.map((s) => (
          <li key={s.question_id}>
            <button
              onClick={() => setBuka(s.question_id)}
              className="w-full rounded-2xl border border-line bg-card p-3 text-left"
            >
              <p className="text-xs text-redup">
                #{s.question_id} · {s.subtes} / {s.topik} · L{s.level}
                {!s.aktif && <span className="ml-1 font-bold text-bahaya">TERSEMBUNYI</span>}
              </p>
              <p className="mt-1 text-sm">{s.cuplikan}</p>
              <p className="mt-1 text-xs text-aksen">
                {s.jumlah_siswa} siswa · {s.alasan.map((a) => label[a] || a).join('; ')}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}


// Memuat soal + pilihan lalu menampilkan form edit.
function EditSoal({ id, onKembali, onSelesai }) {
  const { data, galat, muat } = useMuat(async () => {
    const [soal, pil] = await Promise.all([api.adminSoal(id), api.adminPilihan()]);
    return { soal, pilihan: pil.subtes };
  }, [id]);
  const [selesai, setSelesai] = useState(false);
  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  if (selesai) {
    return (
      <div>
        <p className="rounded-xl bg-lime/10 p-3 text-sm text-lime">Soal #{id} sudah diperbarui.</p>
        <button onClick={onSelesai} className="mt-4 w-full rounded-xl bg-card-2 py-3 text-sm font-bold">
          Kembali
        </button>
      </div>
    );
  }
  return (
    <div>
      <button onClick={onKembali} className="mb-3 text-sm text-aksen underline">
        ← Batal
      </button>
      <FormSoal pilihan={data.pilihan} awal={data.soal} onSelesai={() => setSelesai(true)} />
    </div>
  );
}

// ---------- Input soal ----------

function UnggahDocx() {
  const [file, setFile] = useState(null);
  const [lewati, setLewati] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const [hasil, setHasil] = useState(null);

  async function jalan(tulis) {
    setSibuk(true);
    setGalat('');
    try {
      setHasil({ ...(await api.adminImporDocx(file, { tulis, lewatiBertanda: lewati })) });
    } catch (e) {
      setGalat(e.message);
    }
    setSibuk(false);
  }

  const siapSimpan = hasil?.ok && !hasil.tulis && hasil.stat.baru > 0;
  return (
    <div className="space-y-4">
      <p className="text-sm text-redup">
        Unggah berkas Word berformat kesepakatan (gambar tertanam ikut terbawa). Soal diperiksa dulu tanpa disimpan; setelah
        hasilnya benar, tekan Simpan.
      </p>
      <input
        type="file"
        accept=".docx"
        onChange={(e) => {
          setFile(e.target.files?.[0] || null);
          setHasil(null);
          setGalat('');
        }}
        className="block w-full text-sm"
      />
      <label className="flex items-center gap-2 text-xs text-redup">
        <input type="checkbox" checked={lewati} onChange={(e) => { setLewati(e.target.checked); setHasil(null); }} />
        Lewati soal yang masih bertanda sementara ([GAMBAR DIPERLUKAN…] dan sejenisnya)
      </label>
      <button
        disabled={!file || sibuk}
        onClick={() => jalan(false)}
        className="w-full rounded-xl bg-card-2 py-3 text-sm font-bold disabled:opacity-40"
      >
        {sibuk ? 'Memproses…' : 'Periksa dulu (simulasi)'}
      </button>
      {galat && <p className="text-sm font-semibold text-bahaya">{galat}</p>}

      {hasil && !hasil.ok && (
        <div className="rounded-xl border border-bahaya/50 p-3 text-sm">
          <p className="font-bold text-bahaya">Ada masalah, belum ada yang disimpan.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {hasil.galat.map((g, i) => (
              <li key={i}>
                <b>{g.lokasi}:</b> {g.pesan}
              </li>
            ))}
          </ul>
          {hasil.jumlahGalat > hasil.galat.length && (
            <p className="mt-2 text-xs text-redup">…dan {hasil.jumlahGalat - hasil.galat.length} masalah lainnya.</p>
          )}
        </div>
      )}

      {hasil?.ok && (
        <div className="rounded-xl border border-line bg-card p-3 text-sm">
          <p className={`font-bold ${hasil.tulis ? 'text-lime' : 'text-aksen'}`}>
            {hasil.tulis ? 'TERSIMPAN' : 'Simulasi (belum disimpan)'}
          </p>
          <ul className="mt-2 space-y-0.5">
            <li>Soal baru: <b>{hasil.stat.baru}</b></li>
            <li>Sudah ada (dilewati): {hasil.stat.ada}</li>
            {hasil.stat.kembar > 0 && <li>Kembar di berkas: {hasil.stat.kembar}</li>}
            <li>Topik baru: {hasil.stat.topikBaru} · Subtopik baru: {hasil.stat.subBaru}</li>
            {hasil.gambar > 0 && <li>Gambar: {hasil.gambar}</li>}
          </ul>
          {hasil.perKelompok.length > 0 && (
            <div className="mt-2 text-xs text-redup">
              {hasil.perKelompok.map(([k, n]) => (
                <p key={k}>
                  {k}: {n}
                </p>
              ))}
            </div>
          )}
          {hasil.dilewati.length > 0 && (
            <p className="mt-2 text-xs text-emas">Dilewati karena masih bertanda: {hasil.dilewati.join('; ')}</p>
          )}
          {hasil.peringatan.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-emas">
              {hasil.peringatan.slice(0, 20).map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {siapSimpan && (
        <button
          disabled={sibuk}
          onClick={() => jalan(true)}
          className="w-full rounded-xl bg-lime py-3.5 font-bold text-bg disabled:opacity-40"
        >
          {sibuk ? 'Menyimpan…' : `Simpan ${hasil.stat.baru} soal baru`}
        </button>
      )}
    </div>
  );
}

function TulisSoal() {
  const { data, galat, muat } = useMuat(() => api.adminPilihan(), []);
  const [kunciForm, setKunciForm] = useState(0); // naik = form dikosongkan lagi
  const [tersimpan, setTersimpan] = useState(null);
  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  return (
    <div>
      {tersimpan && (
        <p className="mb-4 rounded-xl bg-lime/10 p-3 text-sm text-lime">Soal #{tersimpan} tersimpan. Formulir sudah dikosongkan.</p>
      )}
      <FormSoal
        key={kunciForm}
        pilihan={data.subtes}
        awal={null}
        onSelesai={(id) => {
          setTersimpan(id);
          setKunciForm((n) => n + 1);
          window.scrollTo({ top: 0 });
        }}
      />
    </div>
  );
}

function CariEdit({ onEdit }) {
  const [nomor, setNomor] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (/^\d+$/.test(nomor.trim())) onEdit(nomor.trim());
      }}
      className="flex gap-2"
    >
      <input
        value={nomor}
        onChange={(e) => setNomor(e.target.value)}
        inputMode="numeric"
        placeholder="Nomor soal, mis. 5773"
        className="flex-1 rounded-xl border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-aksen"
      />
      <button type="submit" className="rounded-xl bg-card-2 px-4 text-sm font-bold">
        Edit
      </button>
    </form>
  );
}

function Input() {
  const [mode, setMode] = useState('docx');
  const [edit, setEdit] = useState(null);
  if (edit) return <EditSoal id={edit} onKembali={() => setEdit(null)} onSelesai={() => setEdit(null)} />;
  const MODE = [
    ['docx', 'Unggah docx'],
    ['tulis', 'Tulis soal'],
    ['edit', 'Edit soal'],
  ];
  return (
    <div>
      <div className="mb-4 flex gap-2">
        {MODE.map(([k, n]) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${
              mode === k ? 'bg-card-2 text-aksen' : 'border border-line text-redup'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      {mode === 'docx' && <UnggahDocx />}
      {mode === 'tulis' && <TulisSoal />}
      {mode === 'edit' && (
        <div className="space-y-3">
          <p className="text-sm text-redup">Masukkan nomor soal (tampil sebagai #nomor di daftar laporan).</p>
          <CariEdit onEdit={setEdit} />
        </div>
      )}
    </div>
  );
}

function DetailSiswa({ id, onKembali }) {
  const { data, galat, muat } = useMuat(() => api.adminSiswaDetail(id), [id]);
  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  const { siswa, subtopik, sesi } = data;
  return (
    <div>
      <button onClick={onKembali} className="mb-3 text-sm text-aksen underline">
        ← Daftar siswa
      </button>
      <p className="text-lg font-extrabold">{siswa.nama}</p>
      <p className="text-xs text-redup">
        {siswa.email} · daftar {tgl(siswa.daftar)} · tes {siswa.tes || '-'}
      </p>

      <h3 className="mt-5 mb-2 text-sm font-bold uppercase tracking-wide text-redup">Penguasaan subtopik</h3>
      {!subtopik.length && <p className="text-sm text-redup">Belum ada latihan.</p>}
      <ul className="space-y-1.5">
        {subtopik.map((m, i) => (
          <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2 text-sm">
            <span>
              <span className="text-xs text-redup">{m.subtes} · </span>
              {m.subtopik}
            </span>
            <span className="shrink-0 text-xs font-bold">
              L{m.level} · RR {m.rr}
            </span>
          </li>
        ))}
      </ul>

      <h3 className="mt-5 mb-2 text-sm font-bold uppercase tracking-wide text-redup">Sesi terakhir</h3>
      <ul className="space-y-1.5">
        {sesi.map((a, i) => (
          <li key={i} className="rounded-xl border border-line bg-card px-3 py-2 text-xs">
            {tgl(a.started_at)} · {a.mode}
            {a.subtes ? ` · ${a.subtes}` : ''} · {a.status} · {a.jumlah_benar}/{a.jumlah_soal} benar · RR {a.total_rr_delta >= 0 ? '+' : ''}
            {a.total_rr_delta}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Siswa() {
  const [buka, setBuka] = useState(null);
  const { data, galat, muat } = useMuat(() => api.adminSiswa(), []);
  if (buka) return <DetailSiswa id={buka} onKembali={() => setBuka(null)} />;
  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  if (!data.siswa.length) return <p className="text-sm text-redup">Belum ada siswa.</p>;
  return (
    <ul className="space-y-2">
      {data.siswa.map((s) => (
        <li key={s.id}>
          <button onClick={() => setBuka(s.id)} className="w-full rounded-2xl border border-line bg-card p-3 text-left">
            <p className="font-bold">
              {s.nama}
              {s.lembaga && <span className="ml-2 text-xs text-aksen">{s.lembaga}</span>}
            </p>
            <p className="text-xs text-redup">{s.email}</p>
            <p className="mt-1 text-xs">
              {s.sesi} sesi · {s.jawaban} jawaban · akurasi {s.akurasi === null ? '-' : `${s.akurasi}%`} · terakhir{' '}
              {tgl(s.terakhir_latihan)}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

const PILIH = 'w-full rounded-xl border border-line bg-card px-3 py-2.5 text-sm text-teks';

function BankSoal() {
  const { data, galat, muat } = useMuat(() => api.adminBankSoal(), []);
  const [tes, setTes] = useState('');
  const [subtes, setSubtes] = useState('');
  const [topik, setTopik] = useState('');
  const [kosong, setKosong] = useState(false);
  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;

  const uniq = (baris, kunci) => [...new Set(baris.map((r) => r[kunci]))];
  const daftarTes = [...new Map(data.subtopik.map((r) => [r.tes, r.tes_nama || r.tes])).entries()];
  const tesPilih = tes || daftarTes[0]?.[0] || '';
  const barisTes = data.subtopik.filter((r) => r.tes === tesPilih);
  const daftarSubtes = uniq(barisTes, 'subtes');
  const subtesPilih = daftarSubtes.includes(subtes) ? subtes : '';
  const barisSubtes = subtesPilih ? barisTes.filter((r) => r.subtes === subtesPilih) : barisTes;
  const daftarTopik = uniq(barisSubtes, 'topik');
  const topikPilih = daftarTopik.includes(topik) ? topik : '';
  const baris = (topikPilih ? barisSubtes.filter((r) => r.topik === topikPilih) : barisSubtes).filter(
    (r) => !kosong || r.l1 === 0 || r.l2 === 0 || r.l3 === 0 || r.l4 === 0,
  );
  const jumlah = baris.reduce((t, r) => t + r.l1 + r.l2 + r.l3 + r.l4, 0);
  const sel = (n) => <td className={`px-2 py-1 text-center ${n === 0 ? 'font-bold text-bahaya' : ''}`}>{n}</td>;

  return (
    <div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="text-xs text-redup">
          Jenis tes
          <select
            className={`${PILIH} mt-1`}
            value={tesPilih}
            onChange={(e) => {
              setTes(e.target.value);
              setSubtes('');
              setTopik('');
            }}
          >
            {daftarTes.map(([k, n]) => (
              <option key={k} value={k}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-redup">
          Subtes
          <select
            className={`${PILIH} mt-1`}
            value={subtesPilih}
            onChange={(e) => {
              setSubtes(e.target.value);
              setTopik('');
            }}
          >
            <option value="">Semua subtes</option>
            {daftarSubtes.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-redup">
          Topik
          <select className={`${PILIH} mt-1`} value={topikPilih} onChange={(e) => setTopik(e.target.value)}>
            <option value="">Semua topik</option>
            {daftarTopik.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-lime" checked={kosong} onChange={(e) => setKosong(e.target.checked)} />
        Hanya subtopik yang ada level kosong
      </label>
      <p className="mt-3 mb-2 text-xs text-redup">
        {baris.length} subtopik · {jumlah} soal aktif. Angka merah = kosong (siswa dialihkan ke subtopik lain).
      </p>
      {!baris.length ? (
        <p className="text-sm text-redup">Tidak ada subtopik yang cocok.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-redup">
                <th className="px-2 py-1">Subtopik</th>
                <th className="px-2 py-1">L1</th>
                <th className="px-2 py-1">L2</th>
                <th className="px-2 py-1">L3</th>
                <th className="px-2 py-1">L4</th>
              </tr>
            </thead>
            <tbody>
              {baris.map((r, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-2 py-1">
                    <span className="text-xs text-redup">
                      {subtesPilih ? '' : `${r.subtes} · `}
                      {topikPilih ? '' : `${r.topik} · `}
                    </span>
                    {r.subtopik}
                  </td>
                  {sel(r.l1)}
                  {sel(r.l2)}
                  {sel(r.l3)}
                  {sel(r.l4)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Admin({ me, onKeluar }) {
  const super_ = me.role === 'super_admin';
  const TAB = super_ ? TAB_SUPER : TAB_LEMBAGA;
  const [tab, setTab] = useState('ringkasan');
  const [editId, setEditId] = useState(null);
  const [label, setLabel] = useState({});

  useEffect(() => {
    if (!super_) return;
    api
      .alasanLapor()
      .then((r) => setLabel(Object.fromEntries(r.alasan.map((a) => [a.kode, a.label]))))
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl px-5 pt-6 pb-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">{super_ ? 'Admin Zensan' : me.lembaga?.nama || 'Admin lembaga'}</h1>
          <p className="text-xs text-redup">{me.email}</p>
        </div>
        <button onClick={onKeluar} className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold">
          Keluar
        </button>
      </header>
      <nav className="mt-4 mb-5 flex gap-2 overflow-x-auto">
        {TAB.map(([k, n]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
              tab === k ? 'bg-lime text-bg' : 'border border-line bg-card text-redup'
            }`}
          >
            {n}
          </button>
        ))}
      </nav>
      {editId ? (
        <EditSoal id={editId} onKembali={() => setEditId(null)} onSelesai={() => setEditId(null)} />
      ) : (
        <>
          {tab === 'ringkasan' && <Ringkasan />}
          {tab === 'persetujuan' && <Persetujuan onEdit={setEditId} />}
          {tab === 'laporan' && <Laporan label={label} />}
          {tab === 'input' && <Input />}
          {tab === 'saya' && <SoalSaya onEdit={setEditId} />}
          {tab === 'siswa' && <Siswa />}
          {tab === 'lembaga' && <Lembaga />}
          {tab === 'bank' && <BankSoal />}
        </>
      )}
    </div>
  );
}
