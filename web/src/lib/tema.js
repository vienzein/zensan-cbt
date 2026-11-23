// Tema gelap/terang. Pilihan disimpan di peramban (localStorage) dan diterapkan lewat kelas "light" pada <html>.

const KUNCI = 'zq-tema';

export function ambilTema() {
  try {
    return localStorage.getItem(KUNCI) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function terapkanTema(tema) {
  const el = document.documentElement;
  el.classList.toggle('light', tema === 'light');
  el.classList.toggle('dark', tema !== 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', tema === 'light' ? '#eef5f2' : '#091a20');
}

/** Balik tema, simpan, lalu kembalikan tema baru. */
export function gantiTema() {
  const baru = ambilTema() === 'light' ? 'dark' : 'light';
  try {
    localStorage.setItem(KUNCI, baru);
  } catch {
    /* penyimpanan tidak tersedia: tema berlaku sampai halaman dimuat ulang */
  }
  terapkanTema(baru);
  return baru;
}
