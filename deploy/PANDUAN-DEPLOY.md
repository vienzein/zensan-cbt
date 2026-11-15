# Panduan deploy ke VPS (Ubuntu 24.04)

Gambaran: satu VPS menjalankan **Nginx** (melayani halaman web dan meneruskan `/api` ke server) dan **API Node** (port 5000, hanya terbuka di dalam server). Database dan login tetap di **Supabase** (tidak dipindah). HTTPS gratis dari Let's Encrypt.

> Panduan ini belum diuji di server sungguhan. Kerjakan pelan-pelan; kalau satu langkah menghasilkan error, berhenti dan kirim pesan error-nya (tanpa kata sandi atau kunci).

## 0. Yang perlu disiapkan
- VPS Ubuntu 24.04, minimal 1 vCPU dan **2 GB RAM**, dengan alamat IP publik.
- Nama domain, mis. `latihan.namadomain.com`.
- Nilai dari `.env` di Codespace: `DATABASE_URL`, `SUPABASE_URL`, kunci publishable (`VITE_SUPABASE_ANON_KEY`).

## 1. Arahkan domain ke VPS
Di panel DNS domain, buat **A record**: nama `latihan` (atau `@` bila domain utama) menuju **IP VPS**. Tunggu beberapa menit sampai aktif (cek: `ping latihan.namadomain.com` menampilkan IP VPS).

## 2. Masuk dan amankan server
```
ssh root@IP_VPS
adduser zensan                      # buat pengguna biasa, isi kata sandi kuat
usermod -aG sudo zensan
rsync --archive --chown=zensan:zensan ~/.ssh /home/zensan   # salin kunci SSH (jika masuk dengan kunci)
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
apt update && apt -y upgrade
```
Buka sesi baru dan pastikan `ssh zensan@IP_VPS` berhasil sebelum menutup sesi root. Selanjutnya semua perintah dijalankan sebagai `zensan`.

## 3. Pasang perangkat lunak
```
sudo apt -y install nginx certbot python3-certbot-nginx git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
node -v        # harus v22.x
```

## 4. Ambil kode
```
cd ~
git clone https://github.com/vienzein/zensan-cbt.git
cd zensan-cbt
```
(Jika repo privat, GitHub meminta login; pakai token akses pribadi sebagai kata sandi.)

## 5. Isi pengaturan rahasia
```
nano .env
```
Isi (tanpa spasi di sekitar tanda sama dengan):
```
PORT=5000
DATABASE_URL="postgresql://postgres.KODEPROJECT:SANDI@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
SUPABASE_URL="https://KODEPROJECT.supabase.co"
```
```
chmod 600 .env
printf 'VITE_SUPABASE_URL=https://KODEPROJECT.supabase.co\nVITE_SUPABASE_ANON_KEY=KUNCI_PUBLISHABLE\n' > web/.env
```
Jangan pernah memakai kunci `service_role` / `secret` di `web/.env`.

## 6. Bangun dan nyalakan
```
bash deploy/perbarui.sh      # pasang paket, bangun web (butuh beberapa menit)
sudo cp deploy/zensan-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now zensan-api
sudo systemctl status zensan-api        # harus "active (running)"; tekan q untuk keluar
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5000/api/me   # harus 401 (belum login), artinya API hidup
```

## 7. Nginx dan HTTPS
```
sudo cp deploy/nginx-zensan.conf /etc/nginx/sites-available/zensan
sudo sed -i 's/DOMAIN_ANDA/latihan.namadomain.com/' /etc/nginx/sites-available/zensan
sudo ln -sf /etc/nginx/sites-available/zensan /etc/nginx/sites-enabled/zensan
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d latihan.namadomain.com     # ikuti pertanyaan; pilih redirect HTTP ke HTTPS
```
Buka `https://latihan.namadomain.com` di HP. Layar Masuk harus tampil.

## 8. Atur Supabase untuk domain baru (penting)
Di dashboard Supabase: **Authentication → URL Configuration**. Isi **Site URL** dengan `https://latihan.namadomain.com`, dan tambahkan alamat yang sama ke **Redirect URLs**. Tanpa ini, tautan konfirmasi email mengarah ke alamat yang salah.

## Memperbarui aplikasi nanti
```
ssh zensan@IP_VPS
cd ~/zensan-cbt && bash deploy/perbarui.sh
```
Migrasi database baru (folder `migrations/`) tetap dijalankan manual di Supabase SQL Editor sebelum memperbarui.

## Cek kesehatan dan log
```
sudo systemctl status zensan-api
sudo journalctl -u zensan-api -n 50 --no-pager     # log API terakhir
sudo tail -n 30 /var/log/nginx/error.log
```

## Catatan keamanan
- Aplikasi tidak menyimpan data di VPS; database ada di Supabase (cadangan harian diatur di sana). VPS bisa dibuat ulang kapan saja dari langkah 2.
- Aktifkan cadangan/snapshot dari penyedia VPS bila tersedia.
- Pertimbangkan menonaktifkan login SSH dengan kata sandi (hanya kunci) setelah semuanya berjalan.
- Batasi `SUPABASE_URL` redirect hanya ke domain Anda (langkah 8).
