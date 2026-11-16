# Prompt AI: membuat soal variasi dari bahan, langsung dalam format Word

Dipakai di chat AI mana pun (Claude, ChatGPT, Gemini). Hasilnya mengikuti pola di `PETUNJUK-IMPOR-WORD.md`, jadi tinggal ditempel ke Word lalu diimpor.

## Cara pakai

1. Buka chat baru. **Lampirkan `seed/silabus-snbt.md`** (daftar subtopik beserta cakupannya) dan **bahan** (PDF/foto soal contoh, ringkasan materi, pembahasan).
2. Tempel Prompt A di bawah, lalu **isi bagian PARAMETER** (yang bertanda kurung siku).
3. Baca tabel verifikasi di akhir jawaban. Soal dengan catatan keraguan, atau yang hasil hitungnya berbeda dari kunci, diperiksa ulang atau dibuang.
4. Salin **isi blok kode** ke Word dengan **Tempel sebagai teks saja** (Keep Text Only). Tempel gambar (kalau ada) tepat di bawah teks Soal atau Pembahasan.
5. `npm run docx:csv -- berkas.docx` untuk meninjau, lalu `npm run impor:soal -- berkas.docx`, dan bila bersih tambahkan `--tulis`.

Nama topik dan subtopik **harus persis** seperti di silabus. Salah satu huruf saja membuat topik atau subtopik baru yang terpisah di database (itulah gunanya `npm run impor:silabus` dijalankan lebih dulu).

AI bisa salah hitung dan salah kunci, terutama PM dan PK. **Kerjakan ulang tiap soal sendiri (atau oleh tim akademik) sebelum diimpor.** Tabel verifikasi dari AI membantu mencari soal bermasalah, tetapi bukan pengganti pemeriksaan manusia.

## Prompt A: bahan -> analisis -> soal variasi

````
PERAN
Kamu penyusun soal ujian berpengalaman untuk UTBK-SNBT (dan CPNS bila diminta) di lembaga bimbel Zensan Institute. Soalmu dipakai di aplikasi latihan bertingkat (Level 1 sampai 4) dan dikerjakan siswa dengan timer per soal. Kebenaran kunci, kesesuaian level, dan mutu pembahasan lebih penting daripada jumlah soal.

BAHAN
1. Silabus terlampir (silabus-snbt.md): daftar subtes, topik, subtopik, dan cakupannya. Itu satu-satunya sumber nama topik/subtopik, dan kolom Cakupan menentukan isi soal setiap subtopik.
2. Bahan lain terlampir (soal contoh, materi, atau pembahasan). Perlakukan sebagai CONTOH POLA untuk dipelajari, bukan untuk disalin.

PARAMETER (saya isi)
- Tes: [SNBT]
- Subtes: [PK]   (SNBT: PU, PPU, PBM, PK, LBI, LBE, PM)
- Topik (nama persis dari silabus): [Aljabar dan Fungsi]
- Subtopik yang dipakai (nama persis dari silabus; boleh lebih dari satu dalam topik yang sama): [Persamaan dan Fungsi Kuadrat; Fungsi dan Operasi Fungsi]
- Jumlah soal per level: [Level 1: 5, Level 2: 5, Level 3: 5, Level 4: 0]   (untuk PM, mis. 3 / 8 / 7 / 0 dari 18 soal)
- Catatan tambahan (opsional): [mis. fokus pada soal cerita; hindari soal yang butuh gambar]

TUGAS (kerjakan berurutan)

1. ANALISIS BAHAN
   Pelajari bahan, lalu buat tabel ringkas: No | Pola/jenis soal | Subtopik | Perkiraan level (1-4) | Kemampuan yang diukur | Jebakan umum siswa. Tampilkan tabel ini lebih dulu.

2. RANCANG VARIASI
   Untuk setiap pola, rancang variasi yang mengukur kemampuan yang sama tetapi tampil berbeda: ubah angka, konteks/cerita, urutan langkah, dan bentuk pertanyaan (mis. dari "hitung nilai" menjadi "pilih pernyataan yang benar"). Jangan menyalin kalimat atau angka dari bahan. Jangan membuat dua soal yang hanya beda angka kecil.

3. TULIS SOAL sesuai definisi level di bawah, sebanyak jumlah di PARAMETER. Semua soal harus ORIGINAL (lihat ORIGINALITAS).

4. VERIFIKASI MANDIRI (wajib)
   Setelah semua soal ditulis, kerjakan setiap soal dari nol seolah-olah kunci belum ada, lalu bandingkan dengan kunci yang kamu tulis. Pastikan: tepat satu opsi benar; setiap pengecoh mewakili kesalahan yang masuk akal (salah tanda, salah rumus, lupa satu langkah); tidak ada dua opsi bernilai sama; pembahasan konsisten dengan kunci. Ganti soal yang bermasalah sebelum mengeluarkan jawaban akhir.

ORIGINALITAS (wajib)
- Soal yang kamu buat harus karya baru, bukan salinan atau terjemahan soal dari bahan, dari soal UTBK/SNBT/CPNS resmi, buku, atau bimbel lain, juga bukan soal yang kamu hafal dari sumber mana pun.
- Pertahankan hanya POLA PENALARAN (jenis kemampuan yang diukur). Konteks, tokoh, angka, struktur kalimat, urutan opsi, dan jebakan harus dirancang baru.
- Bila sebuah soal terasa mirip dengan soal yang kamu kenal, buang dan buat ulang dengan rancangan lain.
- Pembahasan ditulis dengan kalimatmu sendiri, bukan disalin dari bahan.

DEFINISI LEVEL
- Level 1 (dasar): mengukur PENGENALAN, bukan hitungan panjang. Siswa cukup tahu konsep/rumus yang dipakai, atau mampu menyusun model awal yang tepat, atau mengerjakan satu langkah. Bentuk soal paling langsung; hitungannya ringan.
- Level 2 (menengah): penerapan standar, dua sampai tiga langkah, mulai ada pengecoh dari kesalahan umum.
- Level 3 (lanjut): sering menggabungkan beberapa subtopik, perlu memilih strategi, ada jebakan.
- Level 4 (sangat sulit): setara soal tersulit SNBT, banyak konsep, penalaran berlapis, pengecoh kuat.

BENTUK SOAL LEVEL 1 (pilih yang paling cocok dengan subtopiknya)
- Satu langkah: substitusi, satu operasi, membaca satu nilai dari data/grafik.
- Pemodelan awal: opsi berisi persamaan/pertidaksamaan/fungsi; siswa memilih model yang benar tanpa harus menyelesaikannya. Pengecoh = salah tanda, salah tafsir kata ("paling banyak" vs "paling sedikit"), variabel tertukar.
- Pemilihan rumus/konsep: siswa menentukan rumus atau materi yang tepat untuk situasi itu (mis. luas atau keliling, mean atau median, peluang gabungan atau irisan), lalu menghitung dengan angka sederhana bila perlu.
- Tafsir sederhana: arti gradien, titik potong, atau nilai tertentu dalam konteks.

CATATAN KHUSUS PM (Penalaran Matematika)
- Soal PM berbasis konteks nyata. Pada kenyataannya soal PM jarang berada di Level 1, jadi bila saya tidak menulis jumlah per level, pakai komposisi kira-kira 15% Level 1, 45% Level 2, 40% Level 3.
- Level 2 PM: model sudah harus dibuat dan diselesaikan sendiri (dua sampai tiga langkah), dengan pengecoh dari tafsir konteks yang keliru.
- Level 3 PM: gabungan subtopik, konteks berlapis, atau perlu memilih strategi; boleh ada informasi berlebih.
- Untuk subtes lain, abaikan bagian ini.

TARGET WAKTU (siswa yang menguasai materi harus bisa selesai dalam waktu ini; jangan buat soal yang jelas lebih lama)
- PPU: L1 25 dtk, L2 35 dtk, L3 dan L4 45 dtk
- PU, PK: L1 35, L2 50, L3 dan L4 60
- PBM: L1 45, L2 60, L3 dan L4 75
- LBI, LBE, PM: L1 55, L2 70, L3 dan L4 90
- TWK, TIU: L1 35, L2 50, L3 dan L4 60

ATURAN SUBTOPIK
- Semua level: SATU subtopik atau lebih dari topik yang sama di silabus. Bila lebih dari satu, pisahkan dengan " | " (contoh: Persamaan dan Fungsi Kuadrat | Fungsi dan Operasi Fungsi), dan soalnya memang harus menuntut kedua subtopik itu.
- Level 1 dan 2 umumnya satu subtopik agar fokus. Level 3 dan 4 sebaiknya menggabungkan subtopik bila wajar, tetapi satu subtopik tetap boleh.

ATURAN PENULISAN
- Semua soal pilihan ganda, 5 opsi A sampai E (4 opsi A-D hanya bila pola bahan memang 4 opsi). Soal isian, benar/salah, atau pernyataan majemuk diubah menjadi pilihan ganda.
- Teks polos. Tanpa markdown (**, #, tabel) di dalam blok soal. Tanpa LaTeX ($...$, \frac, \sqrt).
- Simbol memakai karakter Unicode: x², x³, √, ×, ÷, ≤, ≥, ≠, ±, π, ∞, ∘, −. Pecahan ditulis (a+b)/(c+d). Pangkat rumit ditulis 2^(n+1). Indeks ditulis H₂O atau a_(n+1).
- Hindari soal yang membutuhkan gambar, grafik, atau tabel. Bila sebuah soal benar-benar butuh gambar, sisipkan di dalam teks Soal satu kalimat berbentuk [PERLU GAMBAR: deskripsi gambar yang harus dibuat] supaya saya buatkan sendiri.
- Bahasa Indonesia baku, jelas, tanpa ambigu. Jangan menyebut "berdasarkan bahan".
- Opsi numerik diurutkan naik. Panjang opsi relatif seragam. Hindari "semua benar" dan "semua salah" kecuali pola bahan memang memakainya.
- Sebaran kunci merata di A sampai E dan tidak membentuk pola.
- Pembahasan: langkah demi langkah, ringkas (maksimal sekitar 6 baris), menjelaskan mengapa kunci benar dan, bila relevan, jebakan utama yang membuat pengecoh salah. Tulisan harus enak dibaca siswa.

FORMAT KELUARAN (ikuti persis, urutannya tetap)

Bagian 1, di luar blok kode: tabel analisis dari Tugas 1.

Bagian 2, SATU blok kode berisi seluruh soal. Setiap soal memakai pola berikut, kelima baris awalnya diulang lengkap di tiap soal, dan setiap soal diakhiri satu baris ---

Tes: SNBT
Subtes: PK
Topik: Aljabar dan Fungsi
Subtopik: Persamaan dan Fungsi Kuadrat
Level: 2
Soal: (teks soal)
A. (opsi)
B. (opsi)
C. (opsi)
D. (opsi)
E. (opsi)
Kunci: (satu huruf)
Pembahasan: (langkah demi langkah)
---

Bagian 3, di luar blok kode: tabel verifikasi dengan kolom No | Level | Hasil hitungan ulang | Kunci | Cocok? (ya/tidak) | Catatan. Beri catatan bila ada keraguan sekecil apa pun.

Jika bahan tidak terbaca atau tidak cukup untuk menyusun soal bermutu, ajukan paling banyak 3 pertanyaan sebelum mulai. Selain itu jangan bertanya; langsung kerjakan.
````

## Prompt B: merapikan soal yang sudah ada ke format (tanpa mengubah isi)

Untuk soal yang sudah ditulis tim atau dipindai dari dokumen, bila tujuannya hanya mengubah bentuk.

````
Ubah soal-soal terlampir ke format di bawah TANPA mengubah isi, angka, atau kunci. Hanya rapikan bentuknya.

PARAMETER: Tes [SNBT], Subtes [PK], Topik [Aljabar dan Fungsi], subtopik (nama persis dari silabus terlampir) [Persamaan dan Fungsi Kuadrat; Fungsi dan Operasi Fungsi], Level [isi per soal bila tidak tertulis di bahan; kalau tidak yakin, tulis "?"].

ATURAN
- Teks polos tanpa markdown dan tanpa LaTeX. Simbol Unicode (x², √, ×, ÷, ≤, ≥, ≠, π, −). Pecahan ditulis (a+b)/(c+d).
- Satu subtopik atau lebih (dipisah " | ") dari topik yang sama.
- Bila kunci atau pembahasan tidak ada di bahan, tulis "Kunci: ?" dan "Pembahasan:" kosong. JANGAN mengarang.
- Bila ada bagian yang tidak terbaca, tulis [TIDAK TERBACA] di tempatnya.
- Soal yang membutuhkan gambar: tulis [PERLU GAMBAR: deskripsi] di dalam teks Soal.
- Setelah blok kode, tulis daftar soal yang butuh perhatian (kunci "?", tidak terbaca, level tidak jelas, lebih dari 5 opsi).

KELUARAN: SATU blok kode, setiap soal memakai pola berikut (lima baris awal diulang di tiap soal), diakhiri satu baris ---

Tes: SNBT
Subtes: PK
Topik: Aljabar dan Fungsi
Subtopik: Persamaan dan Fungsi Kuadrat
Level: 2
Soal: ...
A. ...
B. ...
Kunci: B
Pembahasan: ...
---
````

Sebelum diimpor, hapus semua penanda `[PERLU GAMBAR: ...]`, `[TIDAK TERBACA]`, dan `Kunci: ?` dari dokumen (isi atau buang soalnya). Program impor akan menolak kunci `?`, tetapi penanda lain bisa ikut tersimpan sebagai teks soal kalau terlewat.
