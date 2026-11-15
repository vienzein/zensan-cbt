# Petunjuk mengisi bank soal (untuk tim akademik)

> Lebih suka mengetik di Word? Lihat `PETUNJUK-IMPOR-WORD.md` dan `templat-soal.docx`. Aturan isinya sama.

1. Buka `templat-soal.csv` di Excel atau Google Sheets. Satu baris = satu soal.
2. Hapus 3 baris contoh (bertanda `[Contoh-hapus]`), isi soal sendiri.
3. Simpan sebagai **CSV (UTF-8)**. Excel Indonesia memakai titik koma sebagai pemisah, dan itu tidak masalah (koma dan tab juga dikenali).
4. Kirim berkasnya ke pengembang untuk dimasukkan. Pengembang menjalankan **simulasi** dulu, jadi kesalahan dilaporkan lengkap dengan nomor baris sebelum apa pun disimpan.

## Kolom

| Kolom | Wajib | Isi |
|---|---|---|
| `tes` | ya | Kode tes: `SNBT` atau `CPNS` |
| `subtes` | ya | Kode subtes: SNBT = `PU` `PPU` `PBM` `PK` `LBI` `LBE` `PM`; CPNS = `TWK` `TIU` `TKP` |
| `topik` | ya | Nama topik, mis. `Aljabar dan Fungsi`. Topik baru dibuat otomatis. Tulis persis sama agar tidak terbuat dobel. |
| `subtopik` | ya | Nama subtopik. Beberapa subtopik dipisah tanda `\|`, mis. `Persamaan kuadrat\|Fungsi komposisi`. |
| `level` | ya | `1` sampai `4` |
| `soal` | ya | Teks soal |
| `opsi_a`, `opsi_b` | ya | Pilihan jawaban |
| `opsi_c`, `opsi_d`, `opsi_e` | tidak | Pilihan tambahan, harus berurutan tanpa celah |
| `kunci` | ya | Huruf jawaban benar (`A` sampai `E`) |
| `waktu_detik` | tidak | Waktu mengerjakan. Kosong = otomatis menurut subtes dan level (lihat di bawah) |
| `poin` | tidak | Poin RR jika benar. Kosong = 10 |
| `domain0` | tidak | `ya` bila soal ini bagian dari Ujian Kelayakan Dasar (prasyarat matematika). Kosong = tidak |
| `butuh_domain0_topik` | tidak | Hanya berlaku bila topik baru dibuat: `ya` jika topik ini terkunci sampai lulus Domain 0. Kosong = ya untuk subtes PK dan PM, tidak untuk lainnya |
| `gambar_url` | tidak | Alamat gambar soal |
| `pembahasan` | tidak | Penjelasan jawaban. Tampil di layar hasil **setelah** sesi selesai |
| `pembahasan_gambar_url` | tidak | Alamat gambar untuk pembahasan |

## Aturan ikatan subtopik (dijaga database)
- **Level 1 dan 2:** terikat **tepat 1** subtopik.
- **Level 3 dan 4:** terikat **minimal 2** subtopik dalam topik yang sama (soal tidak boleh lintas topik).

## Waktu bawaan per soal (detik)

Level 3 dan 4 memakai waktu asli SNBT per soal. Level 1 dan 2 lebih pendek karena soalnya lebih sederhana.

| Subtes | L1 | L2 | L3 | L4 |
|---|---|---|---|---|
| PPU | 25 | 35 | 45 | 45 |
| PU, PK | 35 | 50 | 60 | 60 |
| PBM | 45 | 60 | 75 | 75 |
| LBI, LBE, PM | 55 | 70 | 90 | 90 |
| subtes lain (CPNS) | 35 | 50 | 60 | 60 |

Soal Level 1-2 harus benar-benar bisa diselesaikan siswa pemula dalam waktu itu. Kalau terasa mepet, isi `waktu_detik` atau minta faktor levelnya dilonggarkan.

## Catatan
- Menjalankan ulang berkas yang sama aman: soal yang sama (topik + teks soal) dilewati.
- Pembahasan tidak pernah ditampilkan saat siswa masih mengerjakan; hanya di layar hasil.
