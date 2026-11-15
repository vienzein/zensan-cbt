#!/usr/bin/env bash
# Perbarui aplikasi di server ke versi terbaru dari GitHub (jalankan sebagai pengguna "zensan").
#   cd ~/zensan-cbt && bash deploy/perbarui.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Mengambil kode terbaru (cabang main)"
git fetch origin
git checkout main
git pull --ff-only origin main

echo "==> Memasang paket server"
npm ci --omit=dev

echo "==> Membangun aplikasi web"
( cd web && { [ -f package-lock.json ] && npm ci || npm install; } && npm run build )

echo "==> Memulai ulang API"
sudo systemctl restart zensan-api
sleep 2
sudo systemctl --no-pager --lines=5 status zensan-api || true

echo "Selesai. Jangan lupa: migrasi database baru (folder migrations/) dijalankan manual di Supabase SQL Editor."
