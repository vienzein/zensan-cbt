import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Layar, Memuat, Galat } from '../components/Dasar.jsx';
import { TombolTema } from '../components/MenuBawah.jsx';
import { NAMA_STATUS_PESANAN, rupiah, tglPanjang } from '../lib/rupiah.js';
import { kecilkanFoto } from '../lib/gambar.js';

// Halaman pembayaran (transfer manual): dibuka dari Beranda, atau otomatis saat siswa belum punya akses ke modul berbayar.

const WARNA_STATUS = {
  menunggu_transfer: 'bg-card-2 text-aksen',
  menunggu_verifikasi: 'bg-emas/15 text-emas',
  lunas: 'bg-lime/15 text-lime',
  ditolak: 'bg-bahaya/15 text-bahaya',
  dibatalkan: 'bg-card-2 text-redup',
};

function Lencana({ status }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${WARNA_STATUS[status] || ''}`}>
      {NAMA_STATUS_PESANAN[status] || status}
    </span>
  );
}

function Pesanan({ p, rekening, onUbah }) {
  const [nama, setNama] = useState('');
  const [catatan, setCatatan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const [mengunggah, setMengunggah] = useState(false);

  async function pilihBukti(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // boleh memilih berkas yang sama lagi
    if (!file) return;
    setMengunggah(true);
    setGalat('');
    try {
      await api.unggahBukti(p.id, await kecilkanFoto(file));
      await onUbah();
    } catch (err) {
      setGalat(err.message);
    } finally {
      setMengunggah(false);
    }
  }

  async function aksi(fn) {
    setSibuk(true);
    setGalat('');
    try {
      await fn();
      await onUbah();
    } catch (e) {
      setGalat(e.message);
    } finally {
      setSibuk(false);
    }
  }

  return (
    <section className="rounded-3xl border border-line bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-redup">Pesanan</p>
          <p className="font-extrabold">{p.program.nama}</p>
        </div>
        <Lencana status={p.status} />
      </div>

      {(p.status === 'menunggu_transfer' || p.status === 'menunggu_verifikasi') && (
        <>
          <div className="mt-4 rounded-2xl bg-card-2 p-4">
            <p className="text-xs text-redup">Transfer tepat sebesar</p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight text-lime">{rupiah(p.nominal)}</p>
            <p className="mt-1 text-xs text-redup">
              Termasuk kode unik {p.kode_unik}. Nominal harus persis agar pembayaranmu mudah dikenali.
            </p>
          </div>
          <div className="mt-3 rounded-2xl border border-line p-4">
            <p className="text-xs text-redup">Ke rekening</p>
            <p className="mt-1 text-sm font-semibold whitespace-pre-line">
              {rekening || 'Nomor rekening belum diatur. Hubungi admin.'}
            </p>
          </div>
        </>
      )}

      {p.status === 'menunggu_transfer' && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-bold">Sudah transfer?</p>
          <div className="rounded-2xl border border-dashed border-line p-4">
            <p className="text-sm font-semibold">Foto bukti transfer</p>
            <p className="mt-0.5 text-xs text-redup">Tangkapan layar atau foto struk dari aplikasi bank. Wajib diunggah.</p>
            <label
              className={`mt-3 inline-block cursor-pointer rounded-xl border px-4 py-2.5 text-sm font-bold ${
                p.ada_bukti ? 'border-lime/40 text-lime' : 'border-line text-teks'
              } ${mengunggah ? 'opacity-50' : ''}`}
            >
              {mengunggah ? 'Mengunggah…' : p.ada_bukti ? '✓ Bukti terunggah · Ganti foto' : 'Pilih foto bukti'}
              <input type="file" accept="image/*" onChange={pilihBukti} disabled={mengunggah} className="sr-only" />
            </label>
          </div>
          <input
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            maxLength={120}
            placeholder="Nama pemilik rekening pengirim"
            className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm outline-none focus:border-lime"
          />
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Catatan (opsional), misalnya bank pengirim atau waktu transfer"
            className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm outline-none focus:border-lime"
          />
          {galat && <p className="text-sm text-bahaya">{galat}</p>}
          <button
            onClick={() => aksi(() => api.konfirmasiPesanan(p.id, { nama_pengirim: nama, catatan }))}
            disabled={sibuk || mengunggah || !p.ada_bukti || nama.trim().length < 2}
            className="w-full rounded-2xl bg-lime py-3.5 font-bold text-bg disabled:opacity-40"
          >
            {sibuk ? 'Mengirim…' : 'Saya sudah transfer'}
          </button>
          <button
            onClick={() => aksi(() => api.batalPesanan(p.id))}
            disabled={sibuk}
            className="w-full py-2 text-sm font-semibold text-redup underline disabled:opacity-40"
          >
            Batalkan pesanan
          </button>
        </div>
      )}

      {p.status === 'menunggu_verifikasi' && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-redup">
            Laporan transfer dari <b className="text-teks">{p.nama_pengirim}</b> dan bukti transfernya sudah diterima. Admin
            akan mengecek mutasi rekening, lalu akses aktif otomatis.
          </p>
          <button onClick={() => aksi(async () => {})} disabled={sibuk} className="rounded-xl border border-line px-4 py-2.5 text-sm font-bold">
            {sibuk ? 'Memeriksa…' : 'Cek status'}
          </button>
        </div>
      )}
      {p.status === 'ditolak' && p.catatan_admin && (
        <p className="mt-3 text-sm text-bahaya">Alasan: {p.catatan_admin}</p>
      )}
    </section>
  );
}

export default function Bayar({ programAwal, dariModul, alasan, onKembali, onBukaCbt }) {
  const [data, setData] = useState(null); // { rekening, pesanan[] }
  const [akses, setAkses] = useState(null);
  const [galat, setGalat] = useState('');
  const [sibukBeli, setSibukBeli] = useState('');
  const [galatBeli, setGalatBeli] = useState('');

  const muat = useCallback(async () => {
    setGalat('');
    try {
      const [d, a] = await Promise.all([api.pembayaran(), api.akses()]);
      setData(d);
      setAkses(a);
    } catch (e) {
      setGalat(e.message);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  async function beli(kode) {
    setSibukBeli(kode);
    setGalatBeli('');
    try {
      await api.buatPesanan(kode);
      await muat();
    } catch (e) {
      setGalatBeli(e.message);
    } finally {
      setSibukBeli('');
    }
  }

  if (galat) {
    return (
      <Layar>
        <Galat pesan={galat} aksi="Coba lagi" onAksi={muat} />
        <button onClick={onKembali} className="mt-4 text-sm text-redup underline">Kembali ke Home</button>
      </Layar>
    );
  }
  if (!data || !akses) return <Memuat />;

  const terbuka = data.pesanan.filter((p) => p.status === 'menunggu_transfer' || p.status === 'menunggu_verifikasi');
  const riwayat = data.pesanan.filter((p) => !terbuka.includes(p));
  const cbt = akses.find((p) => p.kode === 'cbt');

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md px-5 pt-6 pb-10 lg:max-w-3xl">
      <header className="flex items-center justify-between">
        <button onClick={onKembali} className="rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-bold">
          ← Home
        </button>
        <TombolTema />
      </header>
      <h1 className="mt-6 text-[26px] font-extrabold tracking-tight">Pembayaran</h1>

      {dariModul === 'cbt' && cbt && !cbt.aktif && (
        <p className="mt-3 rounded-2xl border border-emas/40 bg-card p-4 text-sm">
          {alasan === 'jatah_habis'
            ? `Jatah gratis hari ini (${cbt.jatah?.batas ?? ''} soal) sudah habis. Berlangganan untuk lanjut berlatih tanpa batas.`
            : 'Berlangganan untuk latihan tanpa batas. Selesaikan pembayaran di bawah, lalu kamu bisa langsung berlatih.'}
        </p>
      )}
      {cbt?.aktif && dariModul === 'cbt' && (
        <div className="mt-3 rounded-2xl border border-lime/40 bg-card p-4">
          <p className="text-sm font-bold text-lime">Akses Drill Soal sudah aktif.</p>
          <button onClick={onBukaCbt} className="mt-2 rounded-xl bg-lime px-4 py-2.5 text-sm font-bold text-bg">
            Mulai berlatih
          </button>
        </div>
      )}

      {terbuka.length > 0 && (
        <div className="mt-6 space-y-4">
          {terbuka.map((p) => (
            <Pesanan key={p.id} p={p} rekening={data.rekening} onUbah={muat} />
          ))}
        </div>
      )}

      <h2 className="mt-8 mb-3 text-[19px] font-extrabold tracking-tight">Program</h2>
      {galatBeli && <p className="mb-3 text-sm text-bahaya">{galatBeli}</p>}
      <ul className="space-y-3">
        {akses.map((p) => {
          const adaPesanan = terbuka.some((t) => t.program.kode === p.kode);
          return (
            <li
              key={p.kode}
              className={`rounded-2xl border bg-card p-4 ${p.kode === programAwal ? 'border-lime' : 'border-line'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">{p.nama}</p>
                  <p className="mt-0.5 text-sm text-redup">{p.deskripsi}</p>
                </div>
                <p className="shrink-0 text-right font-extrabold">
                  {p.harga > 0 ? rupiah(p.harga) : <span className="text-sm text-redup">Belum ada harga</span>}
                  {p.durasi_hari && p.harga > 0 && <span className="block text-[11px] font-normal text-redup">/ {p.durasi_hari} hari</span>}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-xs text-redup">
                  {p.aktif
                    ? p.berlaku_sampai
                      ? `Aktif sampai ${tglPanjang(p.berlaku_sampai)}`
                      : 'Aktif tanpa batas'
                    : p.pernah_punya
                      ? 'Masa aktif habis'
                      : 'Belum aktif'}
                </span>
                {!adaPesanan && (
                  <button
                    onClick={() => beli(p.kode)}
                    disabled={Boolean(sibukBeli) || p.harga <= 0}
                    className="ml-auto rounded-xl bg-lime px-5 py-2.5 text-sm font-bold text-bg disabled:opacity-40"
                  >
                    {sibukBeli === p.kode ? 'Membuat pesanan…' : p.aktif ? 'Perpanjang' : 'Beli'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {riwayat.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-[19px] font-extrabold tracking-tight">Riwayat</h2>
          <ul className="space-y-2">
            {riwayat.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.program.nama}</p>
                  <p className="text-xs text-redup">
                    {rupiah(p.nominal)} · {tglPanjang(p.dibuat)}
                  </p>
                </div>
                <Lencana status={p.status} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
