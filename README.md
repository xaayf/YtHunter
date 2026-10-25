# YT Hunter (PWA iPhone + Workers AI)

Launchpad → ide (AI) → naskah (AI) → storyboard (AI) → AI Guard (metrik + review AI) → audit aset.

## Arsitektur
- `public/` : PWA statis (HTML/CSS/JS, SW, manifest, ikon) — hasil `npm run build`, sudah di-commit.
- `worker/index.js` : Worker, hanya menangani `/api/*` (Workers AI, model Llama 3.3 70B). Prompt ada di server; tidak butuh API key.
- `wrangler.jsonc` : binding `AI` + `ASSETS`.

## Secret / variabel Worker (Cloudflare)
- `GEMINI_API_KEY` (secret): bila ada → Gemini; jika kosong → Workers AI. Gemini kena kuota → otomatis cadangan Workers AI.
- `APP_PIN` (secret): PIN akses endpoint AI (dikirim header `x-app-pin`).
- `GEMINI_MODEL` (variabel, opsional): default `gemini-3.6-flash`.

## Deploy
Push ke `main` → Cloudflare Workers Builds (build command kosong, deploy `npx wrangler deploy`).
Cek: `/api/health` harus `{"ok":true,"ai":true,...}`.

## Edit
`npm i && npm run build`
