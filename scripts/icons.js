const { chromium } = require('playwright');
const path = require('path');
const logo = (scale) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#171a28"/><stop offset="1" stop-color="#0b0d14"/></linearGradient>
    <linearGradient id="sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#4f46e5"/></linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 262) scale(${scale}) translate(-256 -256)">
    <path d="M256 70 L420 128 V256 C420 352 352 424 256 452 C160 424 92 352 92 256 V128 Z" fill="url(#sh)"/>
    <path d="M256 70 L420 128 V256 C420 352 352 424 256 452 C160 424 92 352 92 256 V128 Z" fill="none" stroke="#c4b5fd" stroke-opacity=".5" stroke-width="6"/>
    <path d="M222 190 L222 322 L336 256 Z" fill="#fff" stroke="#fff" stroke-width="22" stroke-linejoin="round"/>
  </g>
</svg>`;
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage();
  const out = (n) => path.join(__dirname, '..', 'public', 'icons', n);
  const jobs = [['icon-512.png', 512, 1], ['icon-192.png', 192, 1], ['apple-touch-icon.png', 180, 1], ['favicon-32.png', 32, 1], ['icon-maskable-512.png', 512, 0.72]];
  for (const [n, s, sc] of jobs) {
    await pg.setViewportSize({ width: s, height: s });
    await pg.setContent(`<body style="margin:0;background:#0b0d14">${logo(sc).replace('width="512" height="512"', `width="${s}" height="${s}"`)}</body>`);
    await pg.screenshot({ path: out(n) });
  }
  await b.close();
})();
