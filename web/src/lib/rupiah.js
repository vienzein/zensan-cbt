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
