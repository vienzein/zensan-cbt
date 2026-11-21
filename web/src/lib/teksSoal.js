// Memecah teks soal menjadi blok: paragraf biasa atau tabel.
// Tabel = dua baris berurutan atau lebih yang memuat pemisah " | " dengan jumlah kolom sama (baris pertama = judul kolom).
// Baris lain tetap teks biasa (tanda | tunggal seperti |x − 2| tidak dianggap tabel karena tanpa spasi di kedua sisi).

const adalahBarisTabel = (l) => l.includes(' | ');
const pecahKolom = (l) => l.split(' | ').map((c) => c.trim().replace(/^\|\s*|\s*\|$/g, ''));

export function pecahTeksSoal(teks) {
  const baris = String(teks ?? '').split('\n');
  const blok = [];
  let teksBiasa = [];
  const keluarkanTeks = () => {
    if (teksBiasa.join('').trim()) blok.push({ jenis: 'teks', isi: teksBiasa.join('\n') });
    teksBiasa = [];
  };

  let i = 0;
  while (i < baris.length) {
    if (adalahBarisTabel(baris[i])) {
      const kolom = pecahKolom(baris[i]).length;
      let j = i;
      const rows = [];
      while (j < baris.length && adalahBarisTabel(baris[j]) && pecahKolom(baris[j]).length === kolom) {
        rows.push(pecahKolom(baris[j]));
        j += 1;
      }
      if (rows.length >= 2) {
        keluarkanTeks();
        blok.push({ jenis: 'tabel', judul: rows[0], baris: rows.slice(1) });
        i = j;
        continue;
      }
    }
    teksBiasa.push(baris[i]);
    i += 1;
  }
  keluarkanTeks();
  return blok;
}
