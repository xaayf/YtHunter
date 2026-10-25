# YT Hunter (PWA iPhone + Workers AI)

Launchpad → ide (AI) → naskah (AI) → storyboard (AI) → AI Guard (metrik + review AI) → audit aset.

## Arsitektur
- `public/` : PWA statis (HTML/CSS/JS, SW, manifest, ikon) — hasil `npm run build`, sudah di-commit.
- `worker/index.js` : Worker, hanya menangani `/api/*` (Workers AI, model Llama 3.3 70B). Prompt ada di server; tidak butuh API key.
- `wrangler.jsonc` : binding `AI` + `ASSETS`.

## Deploy
Push ke `main` → Cloudflare Workers Builds (build command kosong, deploy `npx wrangler deploy`).
Cek: `/api/health` harus `{"ok":true,"ai":true,...}`.

## Edit
`npm i && npm run build`
