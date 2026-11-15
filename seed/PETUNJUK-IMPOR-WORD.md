# Mengisi bank soal lewat dokumen Word

Cocok bila soal lebih nyaman diketik di Word, atau dibuat dengan bantuan AI lalu dirapikan. Hasil akhirnya melewati pemeriksaan aturan yang sama dengan impor CSV.

## Alur

1. Buka `seed/templat-soal.docx`, simpan salinannya dengan nama sendiri (mis. `soal-pm-aljabar.docx`).
2. Isi soal mengikuti pola di bawah (atau tempel hasil AI, lihat bagian prompt).
3. **Tinjau** apa yang terbaca, tanpa database:
   `npm run docx:csv -- seed/soal-pm-aljabar.docx`
   Perintah ini menulis CSV (bisa dibuka di Excel/Google Sheets), menampilkan peringatan, dan melaporkan soal yang melanggar aturan, lengkap dengan nomor dan awal kalimat soalnya.
4. **Simulasi impor** (memeriksa semuanya termasuk aturan database, tidak menyimpan):
   `npm run impor:soal -- seed/soal-pm-aljabar.docx`
5. Bila bersih, simpan: tambahkan `--tulis`.
   `npm run impor:soal -- seed/soal-pm-aljabar.docx --tulis`
   Menjalankan ulang aman: soal yang sama (topik + teks soal) dilewati.

## Pola satu soal

```
Tes: SNBT
Subtes: PM
Topik: Aljabar dan Fungsi
Subtopik: Persamaan kuadrat
Level: 2
Soal: Jumlah akar-akar persamaan x² − 7x + 12 = 0 adalah ...
A. 3
B. 4
C. 7
D. 12
E. −7
Kunci: C
Pembahasan: Faktorkan menjadi (x−3)(x−4) = 0, akarnya 3 dan 4, jumlahnya 7.
---
```

- Garis `---` (tiga strip atau lebih) **menutup** satu soal. Wajib ada di antara dua soal.
- Tes, Subtes, Topik, Subtopik, dan Level **diwarisi** dari soal sebelumnya bila baris itu dihilangkan. Untuk 15 soal satu topik dan level, kelimanya cukup ditulis sekali; soal berikutnya langsung mulai dari `Soal:`. Ganti hanya baris yang berubah (mis. `Level: 3`).
- Level 1-2: tepat 1 subtopik. Level 3-4: minimal 2 subtopik, dipisah `|` (mis. `Persamaan kuadrat | Fungsi komposisi`).
- Opsi minimal A dan B, maksimal sampai E, berurutan tanpa lompat. Kunci satu huruf.
- Soal dan pembahasan boleh beberapa paragraf (baris yang tidak berlabel menyambung ke bagian di atasnya).
- Label tambahan (opsional): `Waktu:` (detik), `Poin:`, `Gambar:` (alamat gambar soal), `Pembahasan gambar:`. Kosong = waktu otomatis menurut tabel di `PETUNJUK-IMPOR-SOAL.md` dan poin 10.
- Bagian di awal dokumen yang tidak berlabel (judul, petunjuk) dilewati dengan peringatan. Contoh bertanda `[Contoh-hapus]` harus dihapus sebelum impor sungguhan.

## Yang ikut terbaca dari Word

| Ikut terbaca | Catatan |
|---|---|
| Teks biasa, tebal/miring | Format tebal/miring tidak disimpan, hanya teksnya |
| Pangkat dan indeks (format atas/bawah) | `x²`, `H₂O`. Bila tidak bisa jadi karakter Unicode, ditulis `^(...)` atau `_(...)` |
| Persamaan Word (Sisipkan, Persamaan) | Pecahan jadi `a/b`, akar jadi `√x`, pangkat jadi `x²`. Persamaan rumit (matriks, integral bertingkat) hanya didekati, jadi periksa hasil di langkah 3 |
| Daftar berhuruf otomatis (A. B. C. buatan Word) | Dibaca sebagai opsi A, B, C. Daftar bernomor di dalam soal dipertahankan sebagai `1. ...` |
| Gambar yang ditempel | Diunggah otomatis ke Supabase Storage saat `--tulis`. Lihat bagian "Gambar" di bawah |
| Tabel | Teks di dalam sel dibaca berurutan, tetapi kolom tidak dipertahankan. Untuk soal bertabel, jelaskan dalam kalimat atau jadikan gambar |

| Tidak ikut | Penanganannya |
|---|---|
| Bagan SmartArt, kotak teks, gambar di dalam opsi | Diabaikan dengan peringatan |
| Riwayat perubahan (track changes) | Teks yang dihapus diabaikan, teks yang disisipkan dibaca. **Terima atau tolak perubahan dulu** supaya jelas |

Format lama `.doc` tidak didukung. Simpan sebagai `.docx`.

## Gambar

**Pengaturan sekali saja** (tanpa ini, dokumen bergambar tidak bisa disimpan):

1. Supabase > **Storage** > **New bucket**. Nama `soal`, centang **Public bucket**, lalu Create.
2. Supabase > **Project Settings > API Keys** > salin **Secret key** (diawali `sb_secret_`).
3. Di file `.env` di folder proyek, tambahkan dua baris (tanpa tanda kutip):
   ```
   SUPABASE_SECRET_KEY=sb_secret_...isi_kunci_anda...
   SUPABASE_BUCKET_SOAL=soal
   ```
   Kunci ini melewati semua aturan keamanan database. **Jangan** ditempel di chat, jangan di-commit, jangan dimasukkan ke `web/.env`. Cukup ada di komputer atau server tempat Anda menjalankan impor.

**Memakai:**

- Tempel gambar langsung di Word, **tepat setelah teks `Soal:`** (sebelum opsi A) untuk gambar soal, atau **setelah teks `Pembahasan:`** untuk gambar pembahasan.
- Kalau gambar terlanjur ada di tempat lain (misalnya sesudah opsi), tulis satu baris `Gambar:` (atau `Pembahasan gambar:`) lalu tempel gambarnya di bawah baris itu. Gambar di bawah opsi A-E diabaikan dengan peringatan.
- Simulasi (`npm run impor:soal -- berkas.docx`) memeriksa kunci dan bucket, lalu menyebut berapa gambar yang akan diunggah. Pengunggahan terjadi saat `--tulis`. Gambar yang sama persis hanya terunggah sekali, jadi aman dijalankan ulang.
- Satu soal menampung **satu** gambar soal dan **satu** gambar pembahasan. Kalau ada lebih dari satu, yang pertama dipakai dan muncul peringatan. Gambar yang butuh beberapa panel sebaiknya digabung jadi satu gambar sebelum ditempel.
- Format: PNG, JPG, GIF, WEBP. Batas 2 MB per gambar (galat bila lebih), dan peringatan mulai 500 KB karena lambat di ponsel siswa. Di Word: klik gambar > Format Gambar > **Kompres Gambar**, atau potong (crop) bagian yang perlu saja.
- **Persamaan MathType atau gambar bawaan Windows (EMF/WMF) ditolak** dengan pesan jelas, karena browser tidak bisa menampilkannya. Pakai Persamaan bawaan Word (Sisipkan > Persamaan), atau tempel ulang sebagai PNG (Tempel Spesial > Gambar (PNG)).
- Gambar dari alamat luar (tertaut, bukan tertanam) tidak didukung; tempel gambarnya langsung. Alamat gambar yang diketik di baris `Gambar:` tetap boleh dan didahulukan.

## Prompt untuk AI

Prompt lengkap (bahan dilampirkan, AI menganalisis lalu membuat soal variasi) ada di `seed/PROMPT-AI-BUAT-SOAL.md`. Versi pendek di bawah cukup untuk soal sederhana (isi bagian dalam kurung):

> Buatkan **15 soal pilihan ganda** tipe UTBK-SNBT untuk subtes **(PM)**, topik **(Aljabar dan Fungsi)**, subtopik **(Persamaan kuadrat)**, **level (2)** dari skala 1 (dasar) sampai 4 (sangat sulit). Soal harus orisinal dan bukan salinan soal resmi.
>
> Tulis sebagai **teks polos tanpa markdown** (tanpa tanda **, #, atau tabel), memakai pola berikut persis untuk setiap soal, dan akhiri setiap soal dengan satu baris `---`:
>
> ```
> Tes: SNBT
> Subtes: ...
> Topik: ...
> Subtopik: ...
> Level: ...
> Soal: ...
> A. ...
> B. ...
> C. ...
> D. ...
> E. ...
> Kunci: (satu huruf)
> Pembahasan: (langkah demi langkah, singkat dan benar)
> ---
> ```
>
> Tulis pangkat dengan karakter Unicode (x², x³) dan akar dengan √. Pastikan hanya ada **satu** jawaban benar, kunci cocok dengan hitungan di pembahasan, dan distraktor masuk akal. Untuk level 3-4, tulis `Subtopik:` dengan dua subtopik atau lebih dipisah `|`.

Setelah AI selesai: salin hasilnya ke Word (tempel sebagai teks biasa, *Keep Text Only*), lalu **kerjakan ulang setiap soal sendiri** dan cocokkan dengan kunci dan pembahasan sebelum diimpor. AI bisa salah hitung, terutama untuk PM dan PK.

## Pesan galat yang mungkin muncul

| Pesan | Artinya |
|---|---|
| `label "soal" muncul dua kali dalam satu soal` | Garis `---` terlewat di antara dua soal |
| `opsi tidak berurutan: ditemukan C padahal yang diharapkan B` | Opsi B hilang atau salah ketik |
| `kunci "E" tidak cocok dengan opsi yang ada` | Kunci menunjuk opsi yang tidak ada |
| `soal Level 3 harus terikat minimal 2 subtopik` | Tulis dua subtopik dipisah `\|` |
| `Berkas ini bukan dokumen Word (.docx) yang valid` | File `.doc` lama atau rusak; simpan ulang sebagai `.docx` |
