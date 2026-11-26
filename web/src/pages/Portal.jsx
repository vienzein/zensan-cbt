import { supabase } from '../lib/supabase.js';
import { Logo } from '../components/Dasar.jsx';
import { Ikon, TombolTema } from '../components/MenuBawah.jsx';
import { rupiah, sisaHari, tglPanjang } from '../lib/rupiah.js';

// Beranda utama Zensan Institute ("super app"): status akses siswa dan pintu ke semua modul.
// Modul baru cukup menambah satu kartu di MODUL dan satu baris di tabel programs.

function ChipAkses({ p }) {
  if (!p) return null;
  if (p.aktif) {
    const sisa = sisaHari(p.berlaku_sampai);
    return (
      <span className="rounded-full bg-lime/15 px-2.5 py-1 text-[11px] font-bold text-lime">
        {sisa === null ? 'Aktif' : `Aktif · ${sisa} hari lagi`}
      </span>
    );
  }
  if (p.terbatas) {
    return (
      <span className="rounded-full bg-emas/15 px-2.5 py-1 text-[11px] font-bold text-emas">
        {p.jatah ? `Gratis · ${p.jatah.sisa} soal tersisa hari ini` : 'Paket gratis'}
      </span>
    );
  }
  return <span className="rounded-full bg-card-2 px-2.5 py-1 text-[11px] font-bold text-redup">Belum aktif</span>;
}

function KartuModul({ ikon, judul, deskripsi, chip, onKlik, nonaktif }) {
  return (
    <button
      onClick={onKlik}
      disabled={nonaktif}
      className="flex w-full flex-col rounded-3xl border border-line bg-card p-5 text-left transition enabled:hover:border-lime disabled:opacity-60"
    >
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-card-2 text-lime">
        <Ikon nama={ikon} ukuran={24} />
      </span>
      <span className="mt-4 text-lg font-extrabold leading-tight">{judul}</span>
      <span className="mt-1 flex-1 text-sm text-redup">{deskripsi}</span>
      <span className="mt-4">{chip}</span>
    </button>
  );
}

export default function Portal({ me, akses, onBukaCbt, onBayar }) {
  const nama = me.nama || me.email.split('@')[0];
  const cbt = akses?.find((p) => p.kode === 'cbt');
  const gratis = Boolean(cbt?.terbatas);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pt-6 pb-10 lg:max-w-5xl lg:pt-8">
      <header className="flex items-center justify-between">
        <div className="rounded-xl bg-white px-3 py-1.5">
          <Logo className="h-8" />
        </div>
        <div className="flex items-center gap-2">
          <TombolTema />
          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-bold text-redup"
          >
            Keluar
          </button>
        </div>
      </header>

      <section className="mt-8">
        <p className="text-sm text-redup">Selamat datang kembali</p>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight lg:text-4xl">Halo, {nama}</h1>
        {me.lembaga && <p className="mt-1 text-sm text-redup">{me.lembaga.nama}</p>}
      </section>

      {gratis && (
        <section className="mt-6 rounded-3xl border border-emas/40 bg-card p-5">
          <p className="font-bold">Paket gratis: {cbt.jatah ? cbt.jatah.batas : ''} soal latihan per hari</p>
          <p className="mt-1 text-sm text-redup">
            {cbt.jatah ? `Terpakai ${cbt.jatah.terpakai} dari ${cbt.jatah.batas} hari ini. ` : ''}Berlangganan untuk latihan tanpa batas.
          </p>
          <button onClick={() => onBayar('cbt')} className="mt-3 rounded-2xl bg-lime px-5 py-3 font-bold text-bg">
            Berlangganan
          </button>
        </section>
      )}

      <h2 className="mt-8 mb-3 text-[19px] font-extrabold tracking-tight">Menu</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <KartuModul
          ikon="latihan"
          judul="Drill Soal"
          deskripsi="Latihan soal SNBT berjenjang. Naikkan level dan pantau pencapaianmu."
          chip={<ChipAkses p={cbt} />}
          onKlik={onBukaCbt}
        />
        <KartuModul
          ikon="kelas"
          judul="Kelas Mendatang"
          deskripsi="Jadwal kelas dan link Google Meet akan tampil di sini."
          chip={<span className="rounded-full bg-card-2 px-2.5 py-1 text-[11px] font-bold text-redup">Segera hadir</span>}
          nonaktif
        />
        <KartuModul
          ikon="bayar"
          judul="Pembayaran"
          deskripsi="Beli atau perpanjang program, lihat riwayat dan status pesanan."
          chip={null}
          onKlik={() => onBayar()}
        />
      </div>

      {akses && akses.length > 0 && (
        <>
          <h2 className="mt-8 mb-3 text-[19px] font-extrabold tracking-tight">Program saya</h2>
          <ul className="space-y-3">
            {akses.map((p) => (
              <li key={p.kode} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{p.nama}</p>
                  <p className="text-xs text-redup">
                    {p.aktif && p.berlaku_sampai
                      ? `Berlaku sampai ${tglPanjang(p.berlaku_sampai)}`
                      : p.aktif
                        ? 'Berlaku tanpa batas'
                        : p.harga > 0
                          ? `${rupiah(p.harga)}${p.durasi_hari ? ` / ${p.durasi_hari} hari` : ''}`
                          : 'Harga belum ditetapkan'}
                  </p>
                </div>
                <ChipAkses p={p} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
