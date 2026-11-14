# zensan-cbt
## Aplikasi web (React)

Folder `web/`: React + Vite + Tailwind, mode gelap, mobile-first.

```
cd web
cp .env.example .env     # isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY (kunci anon/publishable)
npm install
npm run dev              # http://localhost:5173, /api diteruskan ke server port 5000
```
Server API harus berjalan (`npm start` di folder utama).
