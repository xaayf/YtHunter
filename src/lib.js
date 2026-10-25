/* ===== YT Hunter — logika murni (tanpa DOM) ===== */
const TAG_RE = /\[[^\]]*\]/g;
const PH_RE = /\{\{[^}]*\}\}/g;

const CLICHES = [
  'tahukah kamu bahwa', 'tahukah kamu', 'tahukah anda', 'fakta menarik yang sering', 'fakta menariknya', 'fakta menarik',
  'fakta nomor', 'di video kali ini kita akan membahas', 'di video kali ini', 'simak ulasannya sampai habis',
  'simak sampai habis', 'tanpa berlama-lama lagi', 'tanpa basa-basi lagi', 'jangan lupa like', 'jangan lupa subscribe',
  'halo guys', 'hai guys', 'yuk langsung saja', 'langsung saja kita mulai'
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtTime = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function spokenText(t) { return String(t || '').replace(TAG_RE, ' ').replace(PH_RE, ' '); }
function wordList(t) { return spokenText(t).match(/[\p{L}\p{N}'’-]+/gu) || []; }
function pauseInfo(t) {
  let sec = 0, n = 0;
  for (const m of String(t || '').matchAll(/\[\s*jeda\s*([\d.,]+)?\s*(?:s|detik)?/gi)) {
    n++; sec += parseFloat((m[1] || '1.5').replace(',', '.')) || 1.5;
  }
  return { sec, n };
}
function splitSentences(t) {
  return spokenText(t).split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter((s) => wordCount(s) > 1);
}
function wordCount(t) { return wordList(t).length; }

/** Pecah naskah jadi seksi berdasar baris yang diawali [Tag] */
function parseSections(text) {
  const lines = String(text || '').split('\n');
  const out = []; let cur = null;
  for (const raw of lines) {
    const m = raw.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
    if (m) {
      cur = { name: m[1].trim(), body: m[2] ? m[2] + '\n' : '' };
      out.push(cur);
    } else if (cur) cur.body += raw + '\n';
    else if (raw.trim()) { cur = { name: 'Pembuka', body: raw + '\n' }; out.push(cur); }
  }
  return out.map((s) => ({ ...s, body: s.body.trim() }));
}
function cleanSectionName(n) {
  return n.replace(/\d+:\d{2}\s*-\s*\d+:\d{2}/g, '').replace(/\d+\s*-\s*\d+\s*(s|detik)\b/gi, '')
    .replace(/jeda\s*[\d.,]+\s*s?/gi, 'Jeda').replace(/\s{2,}/g, ' ').replace(/^[\s:–\-]+|[\s:–\-]+$/g, '').replace(/:\s*[–-]\s*/g, ': ') || 'Bagian';
}
function sectionType(n) {
  const s = n.toLowerCase();
  if (/hook|pembuka/.test(s)) return 'Hook';
  if (/konflik|paradoks|masalah|pemaparan/.test(s)) return 'Konflik';
  if (/bukti|data|fakta|studi kasus/.test(s)) return 'Bukti';
  if (/opini|analisis|refleksi/.test(s)) return 'Analisis';
  if (/jeda|transisi/.test(s)) return 'Transisi';
  if (/penutup|kesimpulan|cta|outro/.test(s)) return 'Penutup';
  return 'Isi';
}
/** Buat scene dengan durasi nyata dari naskah */
function scenesFromScript(text, wpm) {
  const secs = parseSections(text);
  const scenes = []; let t = 0;
  for (const s of secs) {
    const w = wordCount(s.body);
    const p = pauseInfo('[' + s.name + ']').sec;
    const dur = (w / wpm) * 60 + p;
    const type = sectionType(s.name);
    if (w === 0 && type === 'Transisi' && scenes.length) { scenes[scenes.length - 1].end += dur; t += dur; continue; }
    if (w === 0 && dur === 0) continue;
    const dMin = Math.max(dur, 3);
    scenes.push({ id: uid(), title: cleanSectionName(s.name), type, start: t, end: t + dMin, visual: '', audio: '', motion: '', src: s.body.slice(0, 320) });
    t += dMin;
  }
  return scenes;
}

/** Analisis heuristik naskah */
function analyze(text, wpm) {
  text = String(text || '');
  const words = wordList(text);
  const nWords = words.length;
  const pz = pauseInfo(text);
  const spokenSec = (nWords / wpm) * 60;
  const totalSec = spokenSec + pz.sec;
  const lower = text.toLowerCase();
  const sents = splitSentences(text);
  const nS = Math.max(1, sents.length);

  const cliches = [...new Set(CLICHES.filter((c) => lower.includes(c)))]
    .filter((c, _, arr) => !arr.some((o) => o !== c && o.includes(c)));
  const placeholders = (text.match(PH_RE) || []).length;

  const OP = /(menurut (saya|analisis saya|pengamatan saya)|analisis saya|pendapat saya|opini saya|saya (menilai|percaya|curiga|berpendapat|melihat|rasa|yakin|menduga)|\[opini)/gi;
  const opinions = (text.match(OP) || []).length;
  const questions = (text.match(/\?/g) || []).length;
  const ANALYTIC = /\b(menurut|analisis|opini|kenapa|mengapa|karena itu|artinya|berarti|alasannya|kesimpulan|bukan|melainkan|sebaliknya|namun|padahal)\b/i;
  const EVID = /(\b\d{3,4}\b|\d+\s?%|persen|\bdata\b|dokumen|arsip|laporan|studi|riset|penelitian|sumber|statistik|catatan|jurnal|\bangka\b)/i;
  const analyticRatio = sents.filter((s) => ANALYTIC.test(s)).length / nS;
  const evidRatio = sents.filter((s) => EVID.test(s)).length / nS;

  // TTR berjendela 100 kata
  const lw = words.map((w) => w.toLowerCase());
  let ttr = 1;
  if (lw.length >= 20) {
    const wins = []; for (let i = 0; i < lw.length; i += 100) { const sl = lw.slice(i, i + 100); if (sl.length >= 20) wins.push(new Set(sl).size / sl.length); }
    ttr = wins.reduce((a, b) => a + b, 0) / wins.length;
  }
  const vocab = clamp((ttr - 0.5) / 0.3, 0, 1);

  // burstiness (variasi panjang kalimat)
  const lens = sents.map(wordCount);
  const mean = lens.reduce((a, b) => a + b, 0) / nS;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / nS);
  const cv = mean ? sd / mean : 0;

  // awalan kalimat berulang (3 kata pertama)
  const starts = {}; sents.forEach((s) => { const k = s.toLowerCase().split(/\s+/).slice(0, 3).join(' '); if (k.split(' ').length === 3) starts[k] = (starts[k] || 0) + 1; });
  const repeated = Object.entries(starts).filter(([, c]) => c >= 2).map(([k]) => k);

  const secs = parseSections(text);
  const hasHook = /\[\s*hook/i.test(text) || (secs[0] && /\?\s*$/.test(secs[0].body.split('\n')[0] || ''));
  const lastBody = secs.length ? secs[secs.length - 1].body : text;
  const hasClosingQ = /\?\s*$/.test(lastBody.trim()) || /(komentar|menurutmu|pendapatmu|bagaimana menurut)/i.test(lastBody);

  let score = 50;
  score += Math.min(opinions, 4) * 5;
  score += Math.min(evidRatio * 100 / 8, 1) * 15;
  score += Math.min(questions, 3) * 3;
  score += Math.min(pz.n, 3) * 2;
  score += hasHook ? 5 : 0;
  score += vocab * 10;
  score += clamp(cv / 0.6, 0, 1) * 5;
  score -= Math.min(cliches.length * 10, 40);
  score -= Math.min(repeated.length * 4, 16);
  score -= Math.min(placeholders * 5, 35);
  if (nWords < 60) score -= 15;
  score = Math.round(clamp(score, 5, 97));

  let botRisk = 6 + cliches.length * 18 + repeated.length * 10 + Math.min(placeholders * 4, 16) + (cv < 0.35 && nS > 3 ? 15 : 0) + (opinions === 0 ? 10 : 0);
  botRisk = Math.round(clamp(botRisk, 5, 95));

  const tips = [];
  if (cliches.length) tips.push({ k: 'bad', t: `Ganti frasa klise: “${cliches.slice(0, 3).join('”, “')}”`, d: 'Pakai tombol Bersihkan Klise.', act: 'clean' });
  if (placeholders) tips.push({ k: 'bad', t: `${placeholders} placeholder {{…}} belum diisi`, d: 'Isi dengan data / sumber nyata sebelum rekaman.' });
  if (!opinions) tips.push({ k: 'warn', t: 'Belum ada opini pribadi', d: 'Tambahkan sudut pandangmu (tombol +Opini).', act: 'tag:[Opini Pribadi]' });
  if (evidRatio < 0.15 && nWords >= 60) tips.push({ k: 'warn', t: 'Bukti / sumber masih tipis', d: 'Sebut angka, tahun, dokumen, atau nama sumber nyata.' });
  if (!pz.n && totalSec > 60) tips.push({ k: 'warn', t: 'Belum ada jeda napas', d: 'Sisipkan [Jeda 1.5s] sebelum transisi topik.', act: 'tag:[Jeda 1.5s]' });
  if (!hasHook && nWords > 0) tips.push({ k: 'warn', t: 'Hook 10 detik pertama belum jelas', d: 'Mulai dengan pertanyaan / klaim kontras.', act: 'tag:[Hook: 0-10s]' });
  if (!hasClosingQ && nWords > 0) tips.push({ k: 'warn', t: 'Penutup belum mengajak diskusi', d: 'Akhiri dengan pertanyaan ke penonton.' });
  if (repeated.length) tips.push({ k: 'warn', t: 'Awalan kalimat berulang', d: `Variasikan: “${repeated[0]} …”` });
  if (mean > 28) tips.push({ k: 'warn', t: 'Kalimat terlalu panjang', d: `Rata-rata ${mean.toFixed(0)} kata/kalimat; pecah agar mudah dibaca.` });
  if (nWords < 60) tips.push({ k: 'warn', t: 'Naskah terlalu pendek untuk dinilai', d: 'Skor baru bermakna di atas ±60 kata.' });
  if (!tips.length) tips.push({ k: 'ok', t: 'Struktur naskah terlihat organik', d: 'Opini, bukti, dan jeda sudah ada.' });
  else if (opinions && !cliches.length) tips.push({ k: 'ok', t: 'Sudut pandang pribadi ada', d: `${opinions} penanda opini terdeteksi.` });

  return {
    nWords, spokenSec, totalSec, pauses: pz, cliches, placeholders, opinions, questions, hasHook, hasClosingQ,
    score, botRisk, repeated, avgSent: mean, tips,
    ratios: { opini: Math.round(clamp(analyticRatio * 140, 0, 100)), bukti: Math.round(clamp(evidRatio * 180, 0, 100)), vocab: Math.round(vocab * 100) }
  };
}

/* ===== Aset ===== */
const SOURCES = { own: 'Buatan sendiri', stock: 'Stok berlisensi', pd: 'Public domain', cc: 'Creative Commons', third: 'Klip pihak ketiga' };
const KINDS = { video: 'Footage', image: 'Gambar', doc: 'Arsip / Dokumen', music: 'Musik', sfx: 'SFX' };
const TRANSFORMS = { none: 'Tidak ada', zoom: 'Zoom / Ken Burns', grade: 'Color grade', info: 'Infografis / anotasi', narr: 'Narasi di atas klip', crop: 'Crop / komposit' };

function assessAsset(a) {
  const issues = []; let lvl = 0; // 0 ok,1 warn,2 bad
  const add = (l, m) => { issues.push({ l, m }); lvl = Math.max(lvl, l); };
  const transformed = (a.transform && a.transform !== 'none') || a.overlay;
  if (a.source === 'third') {
    if (a.kind === 'music' || a.kind === 'sfx') add(2, 'Audio pihak ketiga rawan klaim Content ID.');
    else if (!transformed) add(2, 'Klip pihak ketiga tanpa transformasi / komentar.');
    else if ((+a.dur || 0) > 10) add(2, 'Klip pihak ketiga >10 detik; potong atau ganti.');
    else add(1, 'Fair-use bergantung konteks hukum; tidak ada jaminan.');
  }
  if (a.source === 'cc' && !String(a.note || '').trim()) add(1, 'Catat lisensi & atribusi CC di kolom catatan.');
  if (a.source === 'stock') issues.push({ l: 0, m: 'Simpan bukti lisensi stok.' });
  if ((+a.usedBefore || 0) >= 2) add(2, `Dipakai di ${a.usedBefore} video lain — risiko repetitif.`);
  else if ((+a.usedBefore || 0) === 1) add(1, 'Pernah dipakai di 1 video lain.');
  if (!issues.length) issues.push({ l: 0, m: 'Tidak ada masalah terdeteksi.' });
  return { lvl, label: ['Aman', 'Perlu Cek', 'Berisiko'][lvl], issues };
}

/* ===== Audit akhir ===== */
function finalAudit(project, wpm) {
  const an = analyze(project.script, wpm);
  const checks = [];
  const c = (lvl, t, d) => checks.push({ lvl, t, d });
  c(an.score >= 75 ? 0 : an.score >= 55 ? 1 : 2, `Skor orisinalitas naskah ${an.score}%`, 'Estimasi heuristik internal, bukan penilaian YouTube.');
  c(an.cliches.length ? 2 : 0, an.cliches.length ? `Ada frasa klise (${an.cliches.length})` : 'Tidak ada frasa klise bot', an.cliches.join(', '));
  c(an.placeholders ? 2 : 0, an.placeholders ? `${an.placeholders} placeholder belum diisi` : 'Tidak ada placeholder tersisa', '');
  c(an.hasHook ? 0 : 1, an.hasHook ? 'Hook tersedia' : 'Hook belum jelas', '');
  c(an.opinions >= 2 ? 0 : an.opinions === 1 ? 1 : 2, `Opini pribadi: ${an.opinions} penanda`, 'Minimal 2 kali disarankan.');
  c(an.pauses.n || an.totalSec <= 60 ? 0 : 1, an.pauses.n ? `${an.pauses.n} jeda napas terjadwal` : 'Belum ada jeda napas', '');
  c(an.hasClosingQ ? 0 : 1, an.hasClosingQ ? 'Penutup mengajak diskusi' : 'Penutup belum mengajak diskusi', '');
  const sc = project.scenes || [];
  if (!sc.length) c(1, 'Storyboard kosong', 'Buat scene dari naskah di tab Skrip.');
  else {
    const end = Math.max(...sc.map((s) => s.end));
    const diff = an.totalSec ? Math.abs(end - an.totalSec) / an.totalSec : 0;
    c(diff > 0.25 ? 1 : 0, diff > 0.25 ? `Durasi storyboard (${fmtTime(end)}) beda jauh dari naskah (${fmtTime(an.totalSec)})` : 'Durasi storyboard selaras dengan naskah', '');
  }
  const as = (project.assets || []).map((a) => ({ a, r: assessAsset(a) }));
  if (!as.length) c(1, 'Belum ada aset yang diaudit', 'Tambahkan klip / gambar / audio yang dipakai.');
  else {
    const bad = as.filter((x) => x.r.lvl === 2), warn = as.filter((x) => x.r.lvl === 1);
    c(bad.length ? 2 : warn.length ? 1 : 0, bad.length ? `${bad.length} aset berisiko` : warn.length ? `${warn.length} aset perlu dicek` : `${as.length} aset lolos cek`, bad.concat(warn).map((x) => x.a.name).join(', '));
  }
  const f = checks.filter((x) => x.lvl === 2).length, w = checks.filter((x) => x.lvl === 1).length;
  return { at: Date.now(), checks, fails: f, warns: w, status: f ? 'Belum siap' : w ? 'Hampir siap' : 'Siap produksi', score: an.score };
}

/* ===== Opsi & helper AI (konten dibuat server-side oleh AI, bukan template) ===== */
const BADGE = { emerald: 'bg-emerald-500/20 text-emerald-300', indigo: 'bg-indigo-500/20 text-indigo-300', purple: 'bg-purple-500/20 text-purple-300', amber: 'bg-amber-500/20 text-amber-300', cyan: 'bg-cyan-500/20 text-cyan-300', brand: 'bg-brand-500/20 text-brand-300', rose: 'bg-rose-500/20 text-rose-300' };
const BADGE_KEYS = Object.keys(BADGE);
const ANGLES = {
  psychology: 'Psikologi: kenapa publik tertarik',
  science: 'Sains & data: apa kata angka',
  debunk: 'Cek fakta: uji klaim populer',
  human: 'Human interest: sisi manusia',
  compare: 'Komparasi: bandingkan dengan pembanding',
  timeline: 'Linimasa: titik balik kejadian'
};
const TONES = { investigative: 'Dokumenter investigatif', reflective: 'Obrolan reflektif & akrab', critical: 'Debat kritis berbasis data' };
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h).toString(36); }
function normalizeIdeas(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter((x) => x && typeof x.title === 'string' && x.title.trim()).slice(0, 15).map((x, i) => ({
    id: 'i' + i + '-' + hash(x.title), title: x.title.trim().slice(0, 140), desc: String(x.desc || '').slice(0, 300),
    type: String(x.type || 'Ide').slice(0, 30), badge: String(x.badge || 'Ide').slice(0, 24),
    c: BADGE_KEYS[parseInt(hash(String(x.badge || x.type || i)), 36) % BADGE_KEYS.length],
    angle: ANGLES[x.angle] ? x.angle : 'science', ai: true, fav: false
  }));
}
function replaceHookLine(text, newHook) {
  const lines = text.split('\n'); let seenTag = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim(); if (!l) continue;
    if (/^\[/.test(l)) { seenTag = true; continue; }
    if (seenTag || i === 0) { lines[i] = newHook; return lines.join('\n'); }
  }
  return newHook + '\n' + text;
}

function csvEscape(v) { v = String(v ?? ''); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
