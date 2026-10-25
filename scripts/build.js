const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const R = (...p) => path.join(root, ...p);

// 1. CSS
cp.execSync(`npx tailwindcss -c tailwind.config.js -i src/styles.css -o public/app.css --minify`, { cwd: root, stdio: 'inherit' });

// 2. JS
const js = '"use strict";\n' + fs.readFileSync(R('src/lib.js'), 'utf8') + '\n' + fs.readFileSync(R('src/app.js'), 'utf8');

// 3. Version = hash of semua sumber
const css = fs.readFileSync(R('public/app.css'), 'utf8');
const html0 = fs.readFileSync(R('src/index.html'), 'utf8');
const manifest = fs.readFileSync(R('src/manifest.webmanifest'), 'utf8');
const ver = crypto.createHash('sha1').update(js + css + html0 + manifest).digest('hex').slice(0, 8);

// 4. Sprite ikon
const names = fs.readFileSync(R('scripts/icons.txt'), 'utf8').split(/\s+/).filter(Boolean);
const sym = names.map((n) => {
  const svg = fs.readFileSync(R('node_modules/lucide-static/icons', n + '.svg'), 'utf8');
  const inner = svg.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  return `<symbol id="i-${n}" viewBox="0 0 24 24">${inner}</symbol>`;
}).join('');
const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${sym}</svg>`;

fs.writeFileSync(R('public/app.js'), js.replace(/__VERSION__/g, ver));
fs.writeFileSync(R('public/index.html'), html0.replace('<!--SPRITE-->', sprite).replace(/__VERSION__/g, ver));
fs.writeFileSync(R('public/manifest.webmanifest'), manifest);

// 5. Service worker
const files = ['./', 'index.html', 'app.css?v=' + ver, 'app.js?v=' + ver, 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];
fs.writeFileSync(R('public/sw.js'), fs.readFileSync(R('src/sw.js'), 'utf8').replace('__VERSION__', ver).replace('__FILES__', JSON.stringify(files)));
console.log('build ok, versi', ver);
