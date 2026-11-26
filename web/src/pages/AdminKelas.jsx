import { useState } from 'react';
import { api } from '../lib/api.js';
import { Memuat, Galat } from '../components/Dasar.jsx';
import { useMuat } from '../components/AdminDasar.jsx';
import { jadwalKelas, keInputWaktu, dariInputWaktu, NAMA_STATUS_KELAS, rupiah } from '../lib/rupiah.js';

// Super admin: jadwal kelas (link Google Meet ditempel manual), program, dan pemberian akses manual.

const input = 'w-full rounded-xl border border-line bg-bg px-4 py-2.5 text-sm outline-none focus:border-lime';
const Label = ({ t, children }) => (
  <label className="block text-xs font-semibold text-redup">
    {t}
    <div className="mt-1 text-sm font-normal text-teks">{children}</div>
  </label>
);

function FormKelas({ program, awal, onSimpan, onBatal }) {
  const [f, setF] = useState(
    awal
      ? { program_kode: awal.program.kode, judul: awal.judul, deskripsi: awal.deskripsi, pengajar: awal.pengajar || '',
          mulai: keInputWaktu(awal.mulai_pada), selesai: keInputWaktu(awal.selesai_pada), link_meet: awal.link_meet }
      : { program_kode: program[0]?.kode || '', judul: '', deskripsi: '', pengajar: '', mulai: '', selesai: '', link_meet: '' },
  );
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const ubah = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function simpan(e) {
    e.preventDefault();
    if (!f.mulai || !f.selesai) return setGalat('Isi jam mulai dan jam selesai');
    setSibuk(true);
    setGalat('');
    const body = { program_kode: f.program_kode, judul: f.judul, deskripsi: f.deskripsi, pengajar: f.pengajar,
      mulai_pada: dariInputWaktu(f.mulai), selesai_pada: dariInputWaktu(f.selesai), link_meet: f.link_meet };
    try {
      if (awal) await api.adminUbahKelas(awal.id, body);
      else await api.adminBuatKelas(body);
      await onSimpan();
    } catch (er) {
      setGalat(er.details?.length ? `${er.message}: ${er.details.join('; ')}` : er.message);
      setSibuk(false);
    }
    return undefined;
  }

  return (
    <form onSubmit={simpan} className="mb-4 space-y-3 rounded-2xl border border-lime/50 bg-card p-4">
      <p className="font-bold">{awal ? 'Ubah kelas' : 'Kelas baru'}</p>
      <Label t="Program (hanya siswa program ini yang melihat)">
        <select value={f.program_kode} onChange={ubah('program_kode')} className={input}>
          {program.map((p) => <option key={p.kode} value={p.kode}>{p.nama}</option>)}
        </select>
      </Label>
      <Label t="Judul"><input value={f.judul} onChange={ubah('judul')} className={input} placeholder="Penalaran Umum: Silogisme" /></Label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label t="Mulai"><input type="datetime-local" value={f.mulai} onChange={ubah('mulai')} className={input} /></Label>
        <Label t="Selesai"><input type="datetime-local" value={f.selesai} onChange={ubah('selesai')} className={input} /></Label>
      </div>
      <Label t="Link Google Meet"><input value={f.link_meet} onChange={ubah('link_meet')} className={input} placeholder="https://meet.google.com/abc-defg-hij" /></Label>
      <Label t="Pengajar (opsional)"><input value={f.pengajar} onChange={ubah('pengajar')} className={input} /></Label>
      <Label t="Catatan untuk siswa (opsional)"><textarea rows={3} value={f.deskripsi} onChange={ubah('deskripsi')} className={input} /></Label>
      {galat && <p className="text-sm text-bahaya">{galat}</p>}
      <div className="flex gap-2">
        <button disabled={sibuk} className="flex-1 rounded-xl bg-lime py-2.5 text-sm font-bold text-bg disabled:opacity-40">{sibuk ? 'Menyimpan…' : 'Simpan'}</button>
        <button type="button" onClick={onBatal} className="rounded-xl border border-line px-4 py-2.5 text-sm font-bold">Batal</button>
      </div>
    </form>
  );
}

function Jadwal() {
  const [semua, setSemua] = useState(false);
  const [form, setForm] = useState(null); // null | 'baru' | kelas
  const [galat2, setGalat2] = useState('');
  const kelas = useMuat(() => api.adminKelas(semua), [semua]);
  const prog = useMuat(() => api.adminProgram(), []);

  async function batalkan(k) {
    setGalat2('');
    try {
      await api.adminBatalKelas(k.id);
      await kelas.muat();
    } catch (e) {
      setGalat2(e.message);
    }
  }

  if (kelas.galat || prog.galat) return <Galat pesan={kelas.galat || prog.galat} aksi="Coba lagi" onAksi={() => { kelas.muat(); prog.muat(); }} />;
  if (!kelas.data || !prog.data) return <Memuat />;
  const aktif = prog.data.filter((p) => p.aktif);
  const tutup = async () => { setForm(null); await kelas.muat(); };

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {[[false, 'Mendatang'], [true, 'Semua']].map(([v, n]) => (
          <button key={n} onClick={() => setSemua(v)} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${semua === v ? 'bg-card-2 text-aksen' : 'border border-line text-redup'}`}>{n}</button>
        ))}
        <button onClick={() => setForm('baru')} className="rounded-xl bg-lime px-4 py-2.5 text-sm font-bold text-bg">+ Kelas</button>
      </div>
      {form && <FormKelas program={aktif} awal={form === 'baru' ? null : form} onSimpan={tutup} onBatal={() => setForm(null)} />}
      {galat2 && <p className="mb-2 text-sm text-bahaya">{galat2}</p>}
      {!kelas.data.length && <p className="text-sm text-redup">Belum ada kelas.</p>}
      <ul className="space-y-3">
        {kelas.data.map((k) => (
          <li key={k.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-bold">{k.judul}</p>
              <span className="text-xs font-semibold text-redup">{NAMA_STATUS_KELAS[k.status]}</span>
            </div>
            <p className="mt-1 text-sm text-redup">{k.program.nama} · {jadwalKelas(k.mulai_pada, k.selesai_pada)}</p>
            <p className="mt-1 break-all text-xs text-redup">{k.link_meet}</p>
            {!k.dibatalkan && k.status !== 'selesai' && (
              <div className="mt-3 flex gap-2">
                <button onClick={() => setForm(k)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold">Ubah</button>
                <button onClick={() => batalkan(k)} className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-bahaya">Batalkan kelas</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarisProgram({ p, onUbah }) {
  const [harga, setHarga] = useState(String(p.harga));
  const [durasi, setDurasi] = useState(p.durasi_hari ?? '');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const berubah = Number(harga) !== p.harga || String(durasi) !== String(p.durasi_hari ?? '');

  async function simpan(body) {
    setSibuk(true);
    setGalat('');
    try {
      await api.adminUbahProgram(p.kode, body);
      await onUbah();
    } catch (e) {
      setGalat(e.details?.length ? e.details.join('; ') : e.message);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <li className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold">{p.nama}</p>
          <p className="text-xs text-redup">kode: {p.kode} · {p.peserta_aktif} peserta aktif{p.harga > 0 ? ` · ${rupiah(p.harga)}` : ' · harga belum diisi'}</p>
        </div>
        <button disabled={sibuk} onClick={() => simpan({ is_active: !p.aktif })} className={`rounded-full px-3 py-1 text-[11px] font-bold ${p.aktif ? 'bg-lime/15 text-lime' : 'bg-card-2 text-redup'}`}>
          {p.aktif ? 'Aktif' : 'Nonaktif'}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Label t="Harga (Rp)"><input inputMode="numeric" value={harga} onChange={(e) => setHarga(e.target.value.replace(/\D/g, ''))} className={input} /></Label>
        <Label t="Durasi (hari, kosong = tanpa batas)"><input inputMode="numeric" value={durasi} onChange={(e) => setDurasi(e.target.value.replace(/\D/g, ''))} className={input} /></Label>
      </div>
      {berubah && (
        <button disabled={sibuk} onClick={() => simpan({ harga_rupiah: Number(harga || 0), durasi_hari: durasi === '' ? null : Number(durasi) })} className="mt-3 w-full rounded-xl bg-lime py-2.5 text-sm font-bold text-bg disabled:opacity-40">
          Simpan perubahan
        </button>
      )}
      {galat && <p className="mt-2 text-sm text-bahaya">{galat}</p>}
    </li>
  );
}

function ProgramBaru({ onSimpan, onBatal }) {
  const [f, setF] = useState({ kode: '', nama: '', harga_rupiah: '', durasi_hari: '' });
  const [galat, setGalat] = useState('');
  const ubah = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function simpan(e) {
    e.preventDefault();
    setGalat('');
    try {
      await api.adminBuatProgram({ kode: f.kode, nama: f.nama, harga_rupiah: Number(f.harga_rupiah || 0), durasi_hari: f.durasi_hari === '' ? null : Number(f.durasi_hari) });
      await onSimpan();
    } catch (er) {
      setGalat(er.details?.length ? er.details.join('; ') : er.message);
    }
  }
  return (
    <form onSubmit={simpan} className="mb-4 space-y-3 rounded-2xl border border-lime/50 bg-card p-4">
      <p className="font-bold">Program baru</p>
      <Label t="Kode (huruf kecil, angka, tanda hubung)"><input value={f.kode} onChange={ubah('kode')} className={input} placeholder="kelas-snbt" /></Label>
      <Label t="Nama"><input value={f.nama} onChange={ubah('nama')} className={input} placeholder="Kelas SNBT Online" /></Label>
      <div className="grid grid-cols-2 gap-2">
        <Label t="Harga (Rp)"><input inputMode="numeric" value={f.harga_rupiah} onChange={ubah('harga_rupiah')} className={input} /></Label>
        <Label t="Durasi (hari)"><input inputMode="numeric" value={f.durasi_hari} onChange={ubah('durasi_hari')} className={input} /></Label>
      </div>
      {galat && <p className="text-sm text-bahaya">{galat}</p>}
      <div className="flex gap-2">
        <button className="flex-1 rounded-xl bg-lime py-2.5 text-sm font-bold text-bg">Buat program</button>
        <button type="button" onClick={onBatal} className="rounded-xl border border-line px-4 py-2.5 text-sm font-bold">Batal</button>
      </div>
    </form>
  );
}

function BeriAkses({ program, onSelesai }) {
  const [email, setEmail] = useState('');
  const [kode, setKode] = useState(program[0]?.kode || '');
  const [hari, setHari] = useState('');
  const [hasil, setHasil] = useState('');
  const [galat, setGalat] = useState('');
  async function kirim(e) {
    e.preventDefault();
    setGalat('');
    setHasil('');
    try {
      const r = await api.adminBeriAkses({ email, program_kode: kode, hari: hari === '' ? undefined : Number(hari) });
      setHasil(`Akses ${r.program.nama} untuk ${r.email} aktif${r.berlaku_sampai ? ` sampai ${new Date(r.berlaku_sampai).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}` : ' tanpa batas'}.`);
      setEmail('');
      await onSelesai();
    } catch (er) {
      setGalat(er.details?.length ? er.details.join('; ') : er.message);
    }
  }
  return (
    <form onSubmit={kirim} className="space-y-3 rounded-2xl border border-line bg-card p-4">
      <p className="font-bold">Beri akses manual</p>
      <p className="text-xs text-redup">Untuk siswa yang bayar di luar aplikasi. Siswa harus sudah pernah masuk ke aplikasi.</p>
      <Label t="Email siswa"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} /></Label>
      <div className="grid grid-cols-2 gap-2">
        <Label t="Program">
          <select value={kode} onChange={(e) => setKode(e.target.value)} className={input}>
            {program.map((p) => <option key={p.kode} value={p.kode}>{p.nama}</option>)}
          </select>
        </Label>
        <Label t="Hari (kosong = ikut program)"><input inputMode="numeric" value={hari} onChange={(e) => setHari(e.target.value.replace(/\D/g, ''))} className={input} /></Label>
      </div>
      {hasil && <p className="text-sm text-lime">{hasil}</p>}
      {galat && <p className="text-sm text-bahaya">{galat}</p>}
      <button disabled={!email || !kode} className="w-full rounded-xl bg-lime py-2.5 text-sm font-bold text-bg disabled:opacity-40">Beri akses</button>
    </form>
  );
}

function DaftarProgram() {
  const [baru, setBaru] = useState(false);
  const { data, galat, muat } = useMuat(() => api.adminProgram(), []);
  if (galat) return <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />;
  if (!data) return <Memuat />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setBaru(true)} className="rounded-xl bg-lime px-4 py-2.5 text-sm font-bold text-bg">+ Program</button>
      </div>
      {baru && <ProgramBaru onSimpan={async () => { setBaru(false); await muat(); }} onBatal={() => setBaru(false)} />}
      <ul className="space-y-3">{data.map((p) => <BarisProgram key={p.kode} p={p} onUbah={muat} />)}</ul>
      <BeriAkses program={data.filter((p) => p.aktif)} onSelesai={muat} />
    </div>
  );
}

export default function AdminKelas() {
  const [bagian, setBagian] = useState('jadwal');
  return (
    <div>
      <div className="mb-4 flex gap-2">
        {[['jadwal', 'Jadwal kelas'], ['program', 'Program & akses']].map(([k, n]) => (
          <button key={k} onClick={() => setBagian(k)} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${bagian === k ? 'bg-card-2 text-aksen' : 'border border-line text-redup'}`}>{n}</button>
        ))}
      </div>
      {bagian === 'jadwal' ? <Jadwal /> : <DaftarProgram />}
    </div>
  );
}
