# Impor stage dan soal tes diagnostik Domain 0

Tes diagnostik Domain 0 terdiri dari **stage** (satu stage = satu indikator, biasanya 3 soal). Daftar stage ada di
`seed/stage-diagnostik-d0.md` (100 stage, 13 topik D0-01 sampai D0-14). Soal tiap stage diambil **acak** dari kumpulan
soal stage itu, jadi satu stage sebaiknya punya jauh lebih banyak soal daripada yang ditampilkan.

Bagian ini baru mengurus **data**: daftar stage dan soalnya. Aturan lulus, ulang, jeda, dan tampilan stage di aplikasi
siswa dikerjakan terpisah.

## Langkah satu kali

1. **Migrasi 009** (membuat tabel `d0_stages` dan `d0_stage_questions`): buka SQL Editor Supabase, tempel **isi**
   berkas `migrations/009_d0_stages.sql` (bukan namanya), lalu Run.
2. **Impor daftar stage** (simulasi dulu, lalu simpan):
   ```
   npm run impor:stage -- seed/stage-diagnostik-d0.md
   npm run impor:stage -- seed/stage-diagnostik-d0.md --tulis
   ```
   Perintah ini juga membuat topik dan subtopik **tersembunyi** (tidak aktif) tempat soal stage disimpan, supaya soal stage
   tidak muncul di drill, tryout, atau beranda. Aman diulang; bila berkas stage direvisi (target, batas, indikator),
   jalankan lagi dan stage yang berubah diperbarui.

## Menulis soal stage (Word)

Sama seperti soal biasa, tetapi **tidak perlu** menulis Subtes, Topik, Subtopik, dan Level. Cukup `Tes:` dan `Stage:`.
Soal berikutnya yang tidak menulis `Stage:` ikut stage sebelumnya.

```
Tes: SNBT
Stage: D0-01-01.S1
Soal: Hasil dari 245 + 178 adalah ...
A. 413
B. 423
C. 433
D. 523
E. 323
Kunci: B
Pembahasan: 245 + 178 = 423.
---
Soal: Hasil dari 504 − 267 adalah ...
(dst.)
---
Stage: D0-01-01.S2
Soal: ...
```

- Level dan waktu soal mengikuti stage (waktu = target per soal di tabel stage). Menulis `Level:` boleh, tetapi harus sama
  dengan level stage, kalau tidak impor ditolak.
- Gambar, persamaan, dan `Pembahasan:` bekerja seperti soal biasa (lihat `PETUNJUK-IMPOR-WORD.md`).
- Soal biasa (bukan stage) dalam berkas yang sama: tulis `Topik:` sendiri, maka tidak ikut mewarisi `Stage:`.
- CSV: pakai kolom `tes` dan `stage` (kolom subtes, topik, subtopik, level tidak wajib).

Impor soalnya sama seperti biasa:

```
npm run impor:soal -- soal-stage.docx            # simulasi
npm run impor:soal -- soal-stage.docx --tulis    # simpan
```

Kalau stage belum diimpor, pesannya: `stage "..." belum ada di database`.

## Berapa soal per stage

Satu stage menampilkan 3 soal. Supaya acakan tidak cepat berulang, sediakan **9 sampai 15 soal per stage**
(3 sampai 5 kali jumlah tampil). Total sasaran: 100 stage x 9 = 900 soal sebagai batas bawah. Mulailah dari stage yang
paling dulu dipakai siswa (D0-01 sampai D0-04 Level 1).

Cek isi kumpulan soal kapan saja (hanya membaca):

```
npm run laporan:stage
npm run laporan:stage -- --topik=D0-01
```

Status: KOSONG (0 soal), KURANG (kurang dari 3, belum bisa dilayani), TIPIS (3 sampai 8 soal), OK (9 atau lebih).

## Meminta AI membuat soal stage

Pakai Prompt A di `PROMPT-AI-BUAT-SOAL.md` dengan perubahan ini pada bagian PARAMETER:

- Ganti Subtes/Topik/Subtopik/Level dengan satu baris: `Stage: D0-01-01.S1 (Operasi Bilangan Bulat: tambah dan kurang
  bilangan cacah 1–3 digit), level L1, target 20 detik per soal`.
- Jumlah soal: `12 soal` untuk stage itu (semuanya satu stage; tulis `Stage:` sekali di soal pertama).
- Tambahkan catatan: "Soal harus bisa dijawab dalam waktu target, satu jawaban pasti benar, tanpa konteks panjang.
  Stage gabungan (kode berakhiran .G) boleh berupa soal cerita atau campuran indikator topik itu."

## Mengaktifkan gerbang stage

1. Jalankan migrasi `migrations/010_d0_stage_progress.sql` di SQL Editor Supabase (tempel ISI berkas).
2. Selama soal stage belum cukup, biarkan `DOMAIN0_MODE` kosong (gerbang memakai Domain 0 lama).
3. Cek `npm run laporan:stage`; bila stage D0-01 sampai D0-05 sudah berstatus OK, tambahkan `DOMAIN0_MODE=stage` di `.env` server lalu mulai ulang server.
4. Dalam mode stage, gerbang PK/PM terbuka setelah semua stage D0-01 sampai D0-05 lulus.
