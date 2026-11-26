// Pembantu tampilan untuk halaman pembayaran dan portal.

export const rupiah = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;

export const tglPanjang = (iso) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

/** Sisa hari sampai batas akses (dibulatkan ke atas); null bila tanpa batas. */
export function sisaHari(iso, sekarang = new Date()) {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - sekarang.getTime()) / 86400000));
}

export const NAMA_STATUS_PESANAN = {
  menunggu_transfer: 'Menunggu transfer',
  menunggu_verifikasi: 'Menunggu verifikasi admin',
  lunas: 'Lunas',
  ditolak: 'Ditolak',
  dibatalkan: 'Dibatalkan',
};

// ---- Waktu kelas ----
const opsiHari = { weekday: 'long', day: 'numeric', month: 'long' };
const opsiJam = { hour: '2-digit', minute: '2-digit', hour12: false };

/** "Sabtu, 29 November · 15.00–17.00 WIB" (mengikuti zona waktu perangkat). */
export function jadwalKelas(mulai, selesai) {
  const m = new Date(mulai);
  const jam = (d) => d.toLocaleTimeString('id-ID', opsiJam).replace(':', '.');
  return `${m.toLocaleDateString('id-ID', opsiHari)} · ${jam(m)}–${jam(new Date(selesai))}`;
}

/** ISO -> nilai input datetime-local (waktu setempat). */
export function keInputWaktu(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** nilai input datetime-local -> ISO UTC. */
export const dariInputWaktu = (v) => new Date(v).toISOString();

export const NAMA_STATUS_KELAS = {
  berlangsung: 'Sedang berlangsung',
  segera: 'Segera mulai',
  akan_datang: 'Akan datang',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
};
