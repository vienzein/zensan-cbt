// Teks ringkasan laporan yang disusun otomatis dari angka (bukan tulisan guru).

const bulat = (x) => Math.round(x);

/** Ringkasan satu paragraf untuk laporan per siswa; `data` = respons profil siswa. */
export function ringkasanSiswa(data) {
  const nama = (data.siswa.nama || 'Siswa').split(' ')[0];
  const { ringkasan: r, streak, subtes } = data;
  if (!r.jawaban) return `${nama} belum mengerjakan latihan.`;
  const bagian = [`${nama} berlatih ${r.sesi_selesai} sesi dengan akurasi ${r.akurasi}%`];
  if (streak.saat_ini >= 2) bagian[0] += ` dan sudah berlatih ${streak.saat_ini} hari berturut-turut`;
  bagian[0] += '.';
  const dilatih = subtes.filter((s) => s.subtopik_dilatih > 0);
  if (dilatih.length >= 2) {
    const urut = [...dilatih].sort((a, b) => b.rr_rata - a.rr_rata);
    const kuat = urut[0];
    const lemah = urut[urut.length - 1];
    bagian.push(`Subtes terkuat adalah ${kuat.kode} (RR ${bulat(kuat.rr_rata)}).`);
    bagian.push(`Subtes yang paling perlu diperkuat adalah ${lemah.kode} (RR ${bulat(lemah.rr_rata)}).`);
  } else if (dilatih.length === 1) {
    bagian.push(`Baru berlatih di subtes ${dilatih[0].kode} (RR ${bulat(dilatih[0].rr_rata)}).`);
  }
  return bagian.join(' ');
}

export const tanggalPanjang = (d = new Date()) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
