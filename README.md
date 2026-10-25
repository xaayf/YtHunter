# YT Hunter (PWA iPhone)

Studio riset ide → naskah → storyboard → audit orisinalitas YouTube. Offline, data tersimpan di perangkat.

## Deploy Cloudflare
- Direct upload: upload isi folder `public/` (atau `ythunter-dist.zip`).
- Workers Builds (GitHub): commit semua termasuk `public/`; tanpa build command, deploy command `npx wrangler deploy`.

## Edit & build
`npm i && npm run build` → hasil di `public/` (versi SW otomatis berganti → user lihat banner "Versi baru tersedia").

## Install di iPhone
Safari → buka URL → Share → Add to Home Screen.
