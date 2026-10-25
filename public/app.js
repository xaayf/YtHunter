"use strict";
/* ===== YT Hunter — logika murni (tanpa DOM) ===== */
const TAG_RE = /\[[^\]]*\]/g;
const PH_RE = /\{\{[^}]*\}\}/g;

const CLICHES = [
  'tahukah kamu bahwa', 'tahukah kamu', 'tahukah anda', 'fakta menarik yang sering', 'fakta menariknya', 'fakta menarik',
  'fakta nomor', 'di video kali ini kita akan membahas', 'di video kali ini', 'simak ulasannya sampai habis',
  'simak sampai habis', 'tanpa berlama-lama lagi', 'tanpa basa-basi lagi', 'jangan lupa like', 'jangan lupa subscribe',
  'halo guys', 'hai guys', 'yuk langsung saja', 'langsung saja kita mulai'
];
const CLEAN_MAP = [
  [/Tahukah (kamu|anda) bahwa/gi, 'Pernahkah kamu menyadari kalau'],
  [/Tahukah (kamu|anda)/gi, 'Coba renungkan sejenak:'],
  [/Fakta menarik yang sering ditutupi adalah/gi, 'Temuan yang jarang dibahas menunjukkan bahwa'],
  [/Fakta menariknya/gi, 'Bukti penting selanjutnya'],
  [/Fakta menarik/gi, 'Temuan penting'],
  [/Di video kali ini kita akan membahas/gi, 'Hari ini kita bedah tuntas'],
  [/Di video kali ini/gi, 'Hari ini'],
  [/Simak (ulasannya )?sampai habis/gi, 'Mari kita uji buktinya bersama-sama'],
  [/Tanpa (berlama-lama|basa-basi) lagi/gi, 'Kita mulai dari bukti pertama'],
  [/Langsung saja kita mulai|Yuk langsung saja/gi, 'Kita mulai dari bukti pertama'],
  [/(Halo|Hai) guys/gi, 'Halo semuanya'],
  [/Jangan lupa (like|subscribe)[^.!?\n]*[.!?]?/gi, 'Kalau kamu punya pendapat sendiri, tulis di kolom komentar.']
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
const SCENE_PRESET = {
  Hook:     { visual: 'Teks pertanyaan retoris besar di atas footage atmosferik buatan sendiri / stok berlisensi.', audio: 'SFX ambience halus', motion: 'Zoom in 1.2x' },
  Konflik:  { visual: 'Sorot dokumen / data pembanding, highlight angka kunci.', audio: 'BGM investigatif', motion: 'Pan kiri ke kanan' },
  Bukti:    { visual: 'Tampilkan sumber asli (arsip, laporan, grafik) dengan anotasi sendiri.', audio: 'BGM rendah, narasi dominan', motion: 'Push-in pelan' },
  Analisis: { visual: 'Diagram / grafik buatan sendiri + teks kata kunci opini.', audio: 'Opini narator', motion: 'Cut tiap 4–6 detik' },
  Transisi: { visual: 'Layar jeda singkat / transisi ke bahan riset berikutnya.', audio: 'Jeda napas', motion: 'Fade' },
  Penutup:  { visual: 'Ringkasan 3 poin + pertanyaan diskusi di layar.', audio: 'BGM resolusi', motion: 'Zoom out' },
  Isi:      { visual: 'Visual pendukung sesuai isi narasi.', audio: 'BGM netral', motion: 'Statis / zoom ringan' }
};

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
    scenes.push({ id: uid(), title: cleanSectionName(s.name), type, start: t, end: t + dMin, ...SCENE_PRESET[type] });
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

/* ===== Generator ide & naskah (offline, tanpa API) ===== */
const IDEA_DEFS = [
  { a: 'science', type: 'Investigasi Data', badge: 'Sangat Aman', c: 'emerald', t: (T) => `Apa Kata Data Soal ${T}? Membedah Angka di Balik Ceritanya`, d: 'Kumpulkan data primer (statistik, arsip, laporan resmi) lalu bandingkan dengan narasi populer.' },
  { a: 'psychology', type: 'Psikologi Massa', badge: 'Transformatif', c: 'indigo', t: (T) => `Kenapa Otak Kita Mudah Percaya Cerita Tentang ${T}?`, d: 'Bias kognitif dan daya tarik cerita: mengapa narasi dramatis lebih mudah menyebar daripada fakta biasa.' },
  { a: 'debunk', type: 'Cek Fakta Dokumen', badge: 'Unik', c: 'purple', t: (T) => `Kita Cek Satu Per Satu Klaim Populer Tentang ${T}`, d: 'Ambil 3–5 klaim yang sering beredar, telusuri sumber aslinya, beri verdict per klaim.' },
  { a: 'human', type: 'Human Interest', badge: 'High Retention', c: 'amber', t: (T) => `Sisi Manusia dari ${T}: Cerita yang Jarang Diangkat`, d: 'Kisah orang-orang yang terlibat, dibingkai dengan konteks, bukan sekadar kronologi.' },
  { a: 'compare', type: 'Komparasi', badge: 'Edukasi Kritis', c: 'cyan', t: (T) => `${T} vs Pembanding yang Lebih Nyata: Mana yang Sebenarnya Lebih Besar?`, d: 'Bandingkan dengan kasus/angka serupa memakai grafik buatan sendiri.' },
  { a: 'debunk', type: 'Asal-usul Cerita', badge: 'Anti-Mainstream', c: 'brand', t: (T) => `Dari Mana Sebenarnya Cerita ${T} Berasal?`, d: 'Telusuri siapa yang pertama menyebarkan, kapan, dan kenapa cerita itu bertahan.' },
  { a: 'science', type: 'Penjelasan Sains', badge: 'Visual Rich', c: 'emerald', t: (T) => `Penjelasan Ilmiah di Balik ${T} dalam 5 Menit`, d: 'Jelaskan mekanisme dasar dengan animasi / diagram sederhana buatan sendiri.' },
  { a: 'timeline', type: 'Linimasa', badge: 'Storytelling', c: 'indigo', t: (T) => `Linimasa ${T}: Titik Balik yang Mengubah Segalanya`, d: 'Susun peristiwa kunci berurutan dan tandai momen yang mengubah pemahaman publik.' },
  { a: 'science', type: 'Sisi Teknis', badge: 'Dokumenter', c: 'rose', t: (T) => `Sisi Teknis ${T} yang Jarang Dijelaskan`, d: 'Telaah detail teknis / prosedural dengan bahasa yang mudah dipahami.' },
  { a: 'psychology', type: 'Budaya Pop', badge: 'Analisis Budaya', c: 'purple', t: (T) => `Bagaimana Media dan Budaya Pop Membentuk Citra ${T}`, d: 'Telaah peran film, berita, dan media sosial dalam membentuk persepsi massal.' },
  { a: 'science', type: 'Sumber Primer', badge: 'Data Baru', c: 'cyan', t: (T) => `Sumber Primer Terbaru Tentang ${T}: Apa yang Berubah?`, d: 'Rangkum riset / data terbaru dan jelaskan apa artinya bagi pemahaman umum.' },
  { a: 'compare', type: 'Sisi Ekonomi', badge: 'Unik', c: 'emerald', t: (T) => `Siapa yang Diuntungkan dari Ramainya Cerita ${T}?`, d: 'Telusuri aliran uang / perhatian: penerbit, media, atau produk yang ikut naik.' },
  { a: 'human', type: 'Suara Praktisi', badge: 'Opini Personal', c: 'amber', t: (T) => `Kata Praktisi Soal ${T}: Beda dengan yang Kamu Kira`, d: 'Hadirkan kesaksian / wawancara orang yang bekerja langsung di bidangnya (dengan izin).' },
  { a: 'debunk', type: 'Kesalahan Umum', badge: 'Edukasi', c: 'indigo', t: (T) => `5 Kesalahpahaman Umum Tentang ${T} dan Cara Mengoreksinya`, d: 'Format daftar tapi tiap poin wajib punya bukti dan analisis, bukan sekadar fakta singkat.' },
  { a: 'psychology', type: 'Refleksi Kritis', badge: 'High Engagement', c: 'brand', t: (T) => `Jika Cerita ${T} Ternyata Keliru, Kenapa Kita Masih Ingin Percaya?`, d: 'Pertanyaan reflektif yang memancing komentar bermakna.' }
];
const BADGE = { emerald: 'bg-emerald-500/20 text-emerald-300', indigo: 'bg-indigo-500/20 text-indigo-300', purple: 'bg-purple-500/20 text-purple-300', amber: 'bg-amber-500/20 text-amber-300', cyan: 'bg-cyan-500/20 text-cyan-300', brand: 'bg-brand-500/20 text-brand-300', rose: 'bg-rose-500/20 text-rose-300' };
function genIdeas(topic) {
  return IDEA_DEFS.map((d, i) => ({ id: 'i' + i + '-' + hash(topic + i), title: d.t(topic), desc: d.d, type: d.type, badge: d.badge, c: d.c, angle: d.a, fav: false }));
}
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h).toString(36); }

const ANGLES = {
  psychology: 'Psikologi: kenapa publik tertarik',
  science: 'Sains & data: apa kata angka',
  debunk: 'Cek fakta: uji klaim populer',
  human: 'Human interest: sisi manusia',
  compare: 'Komparasi: bandingkan dengan pembanding',
  timeline: 'Linimasa: titik balik kejadian'
};
const TONES = { investigative: 'Dokumenter investigatif', reflective: 'Obrolan reflektif & akrab', critical: 'Debat kritis berbasis data' };
const TONE_LINES = {
  investigative: { open: 'Mari kita bedah pelan-pelan.', turn: 'Sekarang perhatikan detail berikut.' },
  reflective: { open: 'Coba kita renungkan bersama.', turn: 'Bayangkan sebentar situasinya.' },
  critical: { open: 'Sekarang kita uji klaimnya satu per satu.', turn: 'Mari kita lihat apakah argumennya bertahan.' }
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function genScript({ topic, angle, tone, sections }) {
  const T = topic || 'topik ini';
  const tl = TONE_LINES[tone] || TONE_LINES.investigative;
  const ALL = {
    psychology: {
      hook: [`Kalau bukti menunjukkan ${T} tidak seaneh ceritanya, kenapa kita masih terus tertarik padanya?`, `Apa yang sebenarnya membuat cerita tentang ${T} begitu sulit dilupakan?`],
      conflict: `Banyak orang menganggap ${T} sudah jelas. Namun pembahasan yang beredar sering berhenti di permukaan, dan jarang bertanya kenapa cerita itu terasa meyakinkan. ${tl.open}`,
      analysis: `Menurut analisis saya, jawabannya ada pada cara otak manusia memperlakukan cerita: kita cenderung memilih penjelasan yang dramatis dibanding yang biasa saja. Ini bukan soal bodoh atau pintar, ini soal bias yang dimiliki semua orang.`,
      evid: `Untuk menguji itu, kita butuh bukti. Sebutkan satu studi, survei, atau catatan sejarah nyata tentang ${T} {{isi nama sumber + tahun}}. Lalu jelaskan apa temuannya {{isi angka atau temuan utama}}.`
    },
    science: {
      hook: [`Bagaimana kalau jawaban soal ${T} ternyata ada di angka, bukan di cerita?`, `Satu data sederhana bisa mengubah cara kita memandang ${T}. Datanya apa?`],
      conflict: `Cerita populer tentang ${T} sering terdengar meyakinkan, tetapi jarang disertai angka pembanding. ${tl.open}`,
      analysis: `Menurut saya, data yang tepat lebih jujur daripada narasi yang ramai. Kalau angkanya biasa saja, berarti ada hal lain yang membuat ${T} terasa istimewa.`,
      evid: `Sumber utama kita adalah {{isi sumber data resmi + tahun}}. Angka kuncinya {{isi angka}}, dibandingkan dengan {{isi pembanding}}. ${tl.turn}`
    },
    debunk: {
      hook: [`Ada klaim tentang ${T} yang sering kamu dengar. Hari ini kita cek apakah klaim itu bertahan.`, `Berapa banyak klaim tentang ${T} yang benar-benar punya sumber?`],
      conflict: `Setiap kali ${T} dibahas, beberapa klaim yang sama selalu muncul tanpa sumber. ${tl.open}`,
      analysis: `Analisis saya sederhana: klaim yang kuat harus bisa ditelusuri ke sumber primer. Kalau tidak, kita sedang mendengar kabar, bukan bukti.`,
      evid: `Klaim 1: {{isi klaim}} — sumber aslinya {{isi sumber primer}}, verdict {{benar/salah/sebagian}}. Klaim 2: {{isi klaim}} — verdict {{isi}}. ${tl.turn}`
    },
    human: {
      hook: [`Di balik ${T} ada manusia nyata yang jarang kita dengar ceritanya.`, `Bagaimana rasanya berada di tengah peristiwa ${T}?`],
      conflict: `Pembahasan tentang ${T} biasanya hanya berisi tanggal dan angka. Sisi manusianya hilang. ${tl.open}`,
      analysis: `Menurut saya, cerita personal membantu kita memahami konteks yang tidak muncul di statistik, asalkan dituturkan dengan jujur dan tidak dilebih-lebihkan.`,
      evid: `Kisah yang kita bahas berasal dari {{isi sumber: wawancara/arsip/memoar + tahun}}. Detail penting: {{isi detail yang bisa diverifikasi}}. ${tl.turn}`
    },
    compare: {
      hook: [`Seberapa besar sebenarnya ${T} kalau dibandingkan dengan hal serupa?`, `Kita sering menilai ${T} tanpa pembanding. Hari ini kita beri pembanding.`],
      conflict: `Angka tanpa pembanding mudah menyesatkan. Karena itu kita taruh ${T} berdampingan dengan kasus lain. ${tl.open}`,
      analysis: `Menurut analisis saya, perbandingan yang adil harus memakai ukuran yang sama. Kalau ukurannya beda, kesimpulannya ikut keliru.`,
      evid: `Ukuran yang kita pakai: {{isi metrik}}. Untuk ${T} nilainya {{isi angka}}, untuk pembanding {{isi angka}}, sumber {{isi sumber + tahun}}. ${tl.turn}`
    },
    timeline: {
      hook: [`Ada satu momen yang mengubah cara orang memandang ${T}. Kapan itu terjadi?`, `Mari mundur ke awal cerita ${T} dan lihat bagaimana semuanya berkembang.`],
      conflict: `Cerita ${T} sering disajikan loncat-loncat tanpa urutan. Kita susun ulang dari awal. ${tl.open}`,
      analysis: `Menurut saya, titik balik bukan selalu kejadian terbesar, melainkan momen ketika cara bercerita berubah.`,
      evid: `Tiga titik penting: {{isi tahun + peristiwa 1}}, {{isi tahun + peristiwa 2}}, {{isi tahun + peristiwa 3}}. Sumber untuk tiap titik: {{isi sumber}}. ${tl.turn}`
    }
  };
  const a = ALL[angle] || ALL.psychology;
  const n = clamp(+sections || 5, 4, 7);
  const parts = [];
  parts.push(`[Hook: 0-10s]\n${pick(a.hook)}`);
  parts.push(`[Konflik]\n${a.conflict}`);
  parts.push(`[Bukti & Sumber]\n${a.evid}`);
  parts.push(`[Jeda 1.5s]`);
  parts.push(`[Opini Kritis & Analisis]\n${a.analysis}`);
  if (n >= 6) parts.push(`[Studi Kasus]\nContoh paling jelas yang bisa kita ambil: {{isi satu kasus nyata tentang ${T} + sumbernya}}. Apa yang bisa kita pelajari darinya?`);
  if (n >= 7) parts.push(`[Jeda 1.5s]`);
  if (n >= 5) parts.push(`[Sanggahan]\nTentu ada yang tidak setuju. Argumen terkuat dari pihak lawan adalah {{isi argumen lawan}}. Menurut saya, argumen itu {{isi tanggapanmu}}.`);
  parts.push(`[Penutup & Ajak Diskusi]\nJadi, apa kesimpulannya tentang ${T}? Dari semua bukti tadi, bagian mana yang menurutmu paling masuk akal? Tulis pendapatmu di kolom komentar.`);
  return parts.join('\n\n');
}

function csvEscape(v) { v = String(v ?? ''); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }

/* ===== YT Hunter — UI ===== */
const APP_VERSION = 'b4417d52';
const KEY = 'ythunter:v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, c = 'w-4 h-4') => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

/* ---------- State ---------- */
let S = null;
let mod = 2;          // modul aktif
let scriptTab = 'naskah';
let ideaFilter = 'all';
let memStore = null;

function seedProject() {
  const script = `[Hook: 0-10s]
Tahukah kamu bahwa Segitiga Bermuda sebenarnya bukan tempat paling mematikan di lautan?

[Konflik: 0:10 - 0:45]
Fakta menarik yang sering ditutupi adalah data asuransi kapal Lloyd's of London yang mencatat jumlah kecelakaan di sana tidak lebih tinggi dari perairan sibuk lainnya. Jadi kenapa kita begitu terobsesi dengan mitos monster atau portal dimensi?

[Opini Kritis & Studi Kasus: 0:45 - 2:00]
Menurut analisis saya, jawabannya bukan di dasar samudra, melainkan di psikologi ketakutan manusia sendiri. Saat kapal USS Cyclops hilang di tahun 1918 tanpa jejak radio, publik lebih memilih dongeng misterius daripada menerima bahwa badai bisa menenggelamkan kapal dalam hitungan menit.

[Jeda 1.5s]

[Penutup]
Menurutmu, teori mana yang paling masuk akal? Tulis di kolom komentar.`;
  const p = {
    id: uid(), title: 'Misteri Segitiga Bermuda', topic: 'Misteri Segitiga Bermuda', script, ideas: [], scenes: [], lastAudit: null,
    assets: [
      { id: uid(), name: 'Laut badai (footage stok)', kind: 'video', source: 'stock', dur: 4, usedBefore: 0, transform: 'zoom', overlay: true, start: '0:00', note: '' },
      { id: uid(), name: 'Globe Bumi 3D standar', kind: 'image', source: 'stock', dur: 9, usedBefore: 2, transform: 'none', overlay: false, start: '0:15', note: 'Sering dipakai di video lain' },
      { id: uid(), name: 'Arsip USS Cyclops (US Navy)', kind: 'doc', source: 'pd', dur: 27, usedBefore: 0, transform: 'info', overlay: true, start: '0:45', note: 'Tambah sorotan infografis' }
    ],
    createdAt: Date.now(), updatedAt: Date.now()
  };
  p.scenes = scenesFromScript(script, 130);
  p.ideas = genIdeas(p.topic);
  return p;
}

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { raw = memStore; }
  if (raw) { try { const d = JSON.parse(raw); if (d && Array.isArray(d.projects) && d.projects.length) { S = d; if (!S.wpm) S.wpm = 130; if (!S.projects.find((p) => p.id === S.activeId)) S.activeId = S.projects[0].id; return; } } catch (e) { /* korup → seed */ } }
  const p = seedProject();
  S = { v: 1, activeId: p.id, projects: [p], wpm: 130 };
}
let saveTimer = null;
function save(now) {
  const run = () => {
    saveTimer = null;
    const p = P(); if (p) p.updatedAt = Date.now();
    const json = JSON.stringify(S);
    try { localStorage.setItem(KEY, json); } catch (e) { memStore = json; }
    const b = $('#saveBadge'); if (b) b.textContent = 'Tersimpan ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };
  if (now) { clearTimeout(saveTimer); run(); } else { clearTimeout(saveTimer); saveTimer = setTimeout(run, 400); }
}
const P = () => S.projects.find((p) => p.id === S.activeId);

/* ---------- UI helpers ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast'); $('#toastMsg').textContent = msg;
  t.classList.remove('opacity-0', 'translate-y-3');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('opacity-0', 'translate-y-3'), 2300);
}
function openSheet(title, body, buttons = [], opts = {}) {
  const root = $('#sheetRoot'), sh = $('#sheet');
  sh.innerHTML = `
    <div class="flex items-center justify-between px-4 pt-4 pb-3 border-b border-surface-border shrink-0">
      <h3 class="text-sm font-bold text-white">${esc(title)}</h3>
      <button data-sheet-close class="p-1.5 text-slate-400 active:text-white" aria-label="Tutup">${ic('x', 'w-5 h-5')}</button>
    </div>
    <div class="scroll px-4 py-3 text-xs space-y-3 flex-1 min-h-0">${body}</div>
    ${buttons.length ? `<div class="px-4 py-3 border-t border-surface-border flex items-center justify-end gap-2 shrink-0">${buttons.map((b, i) => `<button data-sheet-btn="${i}" class="${b.cls || 'btn-ghost'}">${esc(b.label)}</button>`).join('')}</div>` : ''}`;
  root.classList.remove('hidden');
  sh._btns = buttons; sh._onClose = opts.onClose;
  if (opts.focus) setTimeout(() => { const el = $(opts.focus, sh); el && el.focus(); }, 60);
}
function closeSheet() {
  const sh = $('#sheet'); $('#sheetRoot').classList.add('hidden');
  if (sh._onClose) { const f = sh._onClose; sh._onClose = null; f(); }
}
function confirmSheet(title, msg, okLabel = 'Lanjut', danger = false) {
  return new Promise((res) => {
    openSheet(title, `<p class="text-slate-300 text-sm leading-relaxed">${msg}</p>`, [
      { label: 'Batal', fn: () => { res(false); } },
      { label: okLabel, cls: danger ? 'btn-danger' : 'btn-primary', fn: () => { res(true); } }
    ], { onClose: () => res(false) });
  });
}
document.addEventListener('click', (e) => {
  if (e.target.id === 'sheetRoot' || e.target.closest('[data-sheet-close]')) return closeSheet();
  const b = e.target.closest('[data-sheet-btn]');
  if (b) {
    const sh = $('#sheet'); const btn = sh._btns[+b.dataset.sheetBtn];
    const r = btn.fn ? btn.fn() : undefined;
    if (r !== false) { sh._onClose = null; closeSheet(); }
    return;
  }
  const a = e.target.closest('[data-act]');
  if (a && ACT[a.dataset.act]) ACT[a.dataset.act](a.dataset, a, e);
});

/* ---------- Navigasi ---------- */
function switchModule(n) {
  stopPacing();
  mod = n;
  for (let i = 1; i <= 4; i++) {
    $('#view-' + i).classList.toggle('hidden', i !== n);
    const t = $('#tab-' + i);
    t.className = 'py-2 flex flex-col items-center gap-0.5 text-[10px] font-semibold ' + (i === n ? 'text-brand-400' : 'text-slate-500');
  }
  render();
  $('#view-' + n).scrollTop = 0;
}
function render() {
  const p = P();
  $('#projectTitleHeader').textContent = p.title || 'Tanpa judul';
  [null, render1, render2, render3, render4][mod]();
}

/* ---------- Modul 1: Riset ---------- */
function render1() {
  const p = P();
  const ideas = p.ideas.filter((i) => ideaFilter === 'all' || i.fav);
  $('#view-1').innerHTML = `
  <div class="max-w-5xl mx-auto p-3 md:p-6 space-y-4">
    <div>
      <h2 class="text-base font-bold text-white flex items-center gap-2">${ic('compass', 'w-5 h-5 text-brand-400')} Riset Ide Konten</h2>
      <p class="text-xs text-slate-400 mt-0.5">Masukkan topik, dapatkan 15 sudut pandang berbeda. Semua dibuat di perangkat, tanpa API dan tanpa kuota.</p>
    </div>
    <div class="card p-3.5 space-y-2.5">
      <label class="label" for="topicIn">Topik / niche utama</label>
      <div class="flex gap-2">
        <input id="topicIn" class="input" value="${esc(p.topic)}" placeholder="Contoh: Sejarah Romawi, AI coding, Segitiga Bermuda…" enterkeyhint="search" autocomplete="off">
        <button data-act="genIdeas" class="btn-primary shrink-0">${ic('sparkles')} Cari</button>
      </div>
    </div>
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <button data-act="ideaFilter" data-f="all" class="chip ${ideaFilter === 'all' ? 'bg-brand-500/25 text-brand-300' : 'bg-surface-card text-slate-400'} !text-[11px] !px-3 !py-1">Semua ${p.ideas.length}</button>
        <button data-act="ideaFilter" data-f="fav" class="chip ${ideaFilter === 'fav' ? 'bg-amber-500/25 text-amber-300' : 'bg-surface-card text-slate-400'} !text-[11px] !px-3 !py-1">★ Favorit ${p.ideas.filter((i) => i.fav).length}</button>
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      ${ideas.length ? ideas.map((i, n) => `
      <div class="card p-3.5 flex flex-col justify-between gap-2.5">
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="chip ${BADGE[i.c] || BADGE.brand}">${esc(i.badge)}</span>
            <button data-act="fav" data-id="${i.id}" class="p-1 ${i.fav ? 'text-amber-400' : 'text-slate-500'}" aria-label="Favorit">${ic('star', 'w-4 h-4')}</button>
          </div>
          <h4 class="text-[13px] font-bold text-white leading-snug">${esc(i.title)}</h4>
          <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">${esc(i.desc)}</p>
        </div>
        <div class="pt-2 border-t border-surface-border/60 flex items-center justify-between">
          <span class="text-[10px] text-slate-500 font-medium">${esc(i.type)}</span>
          <button data-act="useIdea" data-id="${i.id}" class="btn-ghost !py-1 !min-h-0 !text-[11px]">Pakai ide ${ic('arrow-right', 'w-3 h-3')}</button>
        </div>
      </div>`).join('') : `<p class="text-xs text-slate-500 col-span-full text-center py-10">Belum ada ide favorit. Tap bintang pada kartu ide.</p>`}
    </div>
  </div>`;
  $('#topicIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ACT.genIdeas(); } });
}

/* ---------- Modul 2: Skrip & Storyboard ---------- */
function render2() {
  const p = P();
  const seg = (k, l, i) => `<button data-act="stab" data-t="${k}" class="flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${scriptTab === k ? 'bg-brand-600/25 text-brand-300 border border-brand-500/40' : 'text-slate-400'}">${ic(i, 'w-3.5 h-3.5')} ${l}</button>`;
  $('#view-2').innerHTML = `
  <div class="max-w-5xl mx-auto p-3 md:p-6 space-y-3">
    <div class="flex gap-1 p-1 rounded-xl bg-surface-dark border border-surface-border">${seg('naskah', 'Naskah', 'file-pen-line')}${seg('story', 'Storyboard', 'clapperboard')}</div>
    ${scriptTab === 'naskah' ? scriptPanel(p) : storyPanel(p)}
  </div>`;
  if (scriptTab === 'naskah') { const ta = $('#scriptInput'); ta.addEventListener('input', () => { P().script = ta.value; save(); updateScriptMeta(); }); updateScriptMeta(); }
}
function scriptPanel(p) {
  return `
    <div class="card p-3 space-y-2.5">
      <div class="flex items-center justify-between gap-2">
        <div>
          <div class="text-xs font-bold text-white">Editor Naskah & Pacing</div>
          <div id="wc" class="text-[10px] text-slate-400 font-mono"></div>
        </div>
        <div class="flex items-center gap-1.5">
          <div class="flex items-center rounded-xl border border-surface-border bg-surface-card overflow-hidden">
            <button data-act="wpm" data-d="-5" class="px-2.5 py-1.5 text-slate-300 active:bg-surface-highlight" aria-label="Pelan">−</button>
            <span id="wpmLbl" class="px-1 text-[11px] font-mono text-cyan-300 w-[58px] text-center">${S.wpm} WPM</span>
            <button data-act="wpm" data-d="5" class="px-2.5 py-1.5 text-slate-300 active:bg-surface-highlight" aria-label="Cepat">+</button>
          </div>
          <button data-act="gen" class="btn-primary !px-3">${ic('sparkles', 'w-3.5 h-3.5')} Generator</button>
        </div>
      </div>
      <div class="flex flex-wrap gap-1.5">
        ${['[Hook: 0-10s]|+Hook', '[Jeda 1.5s]|+Jeda', '[Opini Pribadi]|+Opini', '[Bukti & Sumber]|+Bukti', '[Penutup & Ajak Diskusi]|+Penutup'].map((x) => { const [t, l] = x.split('|'); return `<button data-act="tag" data-tag="${esc(t)}" class="px-2.5 py-1.5 rounded-lg bg-surface-card border border-surface-border text-[11px] font-mono text-slate-300 active:bg-surface-highlight">${l}</button>`; }).join('')}
        <button data-act="clean" class="ml-auto px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] font-semibold text-amber-300 flex items-center gap-1">${ic('wand-sparkles', 'w-3 h-3')} Bersihkan Klise</button>
      </div>
      <textarea id="scriptInput" class="input min-h-[42dvh] leading-relaxed font-mono !text-[15px] md:!text-xs resize-y" spellcheck="false" placeholder="Ketik atau generate naskah di sini…">${esc(p.script)}</textarea>
      <div id="botWarn" class="rounded-xl p-2.5 text-[11px] flex items-start gap-2"></div>
      <div class="flex gap-2">
        <button data-act="copyScript" class="btn-ghost flex-1">${ic('copy', 'w-3.5 h-3.5')} Salin</button>
        <button data-act="toStory" class="btn-ghost flex-1">${ic('clapperboard', 'w-3.5 h-3.5')} Ke Storyboard</button>
        <button data-act="mod" data-n="3" class="btn-primary flex-1">AI Guard ${ic('arrow-right', 'w-3.5 h-3.5')}</button>
      </div>
    </div>`;
}
function updateScriptMeta() {
  const an = analyze(P().script, S.wpm);
  $('#wc').textContent = `${an.nWords} kata • ${fmtTime(an.totalSec)} (termasuk jeda ${an.pauses.sec.toFixed(1)}s)`;
  $('#wpmLbl').textContent = S.wpm + ' WPM';
  const w = $('#botWarn');
  const bad = an.cliches.length || an.placeholders;
  w.className = 'rounded-xl p-2.5 text-[11px] flex items-start gap-2 ' + (bad ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20');
  w.innerHTML = `${ic(bad ? 'triangle-alert' : 'circle-check', 'w-4 h-4 mt-0.5')}<div>${
    an.cliches.length ? `<b>Frasa klise:</b> “${esc(an.cliches.join('”, “'))}”. ` : ''}${
    an.placeholders ? `<b>${an.placeholders} placeholder {{…}}</b> belum diisi. ` : ''}${
    bad ? '' : 'Tidak ada frasa klise bot atau placeholder tersisa.'}</div>`;
}
function storyPanel(p) {
  const an = analyze(p.script, S.wpm);
  const end = p.scenes.length ? Math.max(...p.scenes.map((s) => s.end)) : 0;
  const COL = { Hook: 'from-purple-600/60 to-indigo-700/60', Konflik: 'from-indigo-600/60 to-blue-800/60', Bukti: 'from-cyan-600/50 to-sky-800/60', Analisis: 'from-fuchsia-600/50 to-purple-800/60', Transisi: 'from-slate-600/60 to-slate-800/60', Penutup: 'from-emerald-600/50 to-teal-800/60', Isi: 'from-slate-600/60 to-slate-800/60' };
  const ICN = { Hook: 'film', Konflik: 'activity', Bukti: 'file-text', Analisis: 'mic', Transisi: 'clock', Penutup: 'check', Isi: 'image' };
  return `
    <div class="flex items-center justify-between gap-2">
      <div>
        <div class="text-xs font-bold text-white">Timeline & Storyboard</div>
        <div class="text-[10px] text-slate-400 font-mono">${p.scenes.length} scene • storyboard ${fmtTime(end)} / naskah ${fmtTime(an.totalSec)}</div>
      </div>
      <div class="flex gap-1.5">
        <button data-act="scenesFromScript" class="btn-ghost !px-2.5">${ic('refresh-cw', 'w-3.5 h-3.5')} Dari naskah</button>
        <button data-act="sceneAdd" class="btn-primary !px-2.5">${ic('plus', 'w-3.5 h-3.5')} Scene</button>
      </div>
    </div>
    <div class="space-y-2.5">
      ${p.scenes.length ? p.scenes.map((s, i) => `
      <div class="card p-3 flex gap-3">
        <div class="w-20 h-[72px] rounded-xl bg-gradient-to-br ${COL[s.type] || COL.Isi} flex flex-col items-center justify-center shrink-0 text-white/90">
          ${ic(ICN[s.type] || 'image', 'w-5 h-5')}
          <span class="mt-1 text-[9px] font-mono bg-black/50 rounded px-1">${fmtTime(s.start)}–${fmtTime(s.end)}</span>
        </div>
        <div class="flex-1 min-w-0 space-y-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-bold text-white truncate">${i + 1}. ${esc(s.title)}</span>
            <span class="chip bg-brand-500/20 text-brand-300 shrink-0">${esc(s.type)}</span>
          </div>
          <p class="text-[11px] text-slate-400 leading-snug">${esc(s.visual)}</p>
          <div class="text-[10px] text-cyan-400 truncate">${ic('volume-2', 'w-3 h-3 inline -mt-0.5')} ${esc(s.audio)} • ${esc(s.motion)}</div>
          <div class="flex items-center gap-1 pt-1">
            <button data-act="sceneMove" data-id="${s.id}" data-d="-1" class="p-1.5 rounded-lg bg-surface-darkest text-slate-400 ${i === 0 ? 'opacity-30' : ''}" aria-label="Naik">${ic('arrow-up', 'w-3.5 h-3.5')}</button>
            <button data-act="sceneMove" data-id="${s.id}" data-d="1" class="p-1.5 rounded-lg bg-surface-darkest text-slate-400 ${i === p.scenes.length - 1 ? 'opacity-30' : ''}" aria-label="Turun">${ic('arrow-down', 'w-3.5 h-3.5')}</button>
            <button data-act="sceneEdit" data-id="${s.id}" class="p-1.5 rounded-lg bg-surface-darkest text-slate-300 ml-auto" aria-label="Edit">${ic('pencil', 'w-3.5 h-3.5')}</button>
            <button data-act="sceneDel" data-id="${s.id}" class="p-1.5 rounded-lg bg-surface-darkest text-rose-400" aria-label="Hapus">${ic('trash-2', 'w-3.5 h-3.5')}</button>
          </div>
        </div>
      </div>`).join('') : `<div class="card p-6 text-center text-xs text-slate-500">Storyboard kosong. Tekan <b class="text-slate-300">Dari naskah</b> untuk membuat scene otomatis dengan durasi hitungan nyata.</div>`}
    </div>
    <div class="flex justify-between pt-1">
      <button data-act="stab" data-t="naskah" class="btn-ghost">${ic('arrow-left', 'w-3.5 h-3.5')} Naskah</button>
      <button data-act="mod" data-n="3" class="btn-primary">AI Guard ${ic('arrow-right', 'w-3.5 h-3.5')}</button>
    </div>`;
}

/* ---------- Modul 3: AI Guard ---------- */
let pacing = { bars: [], timer: null, playing: false, idx: -1 };
function pacingSegments(text) {
  const segs = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.trim(); if (!line) continue;
    const pj = line.match(/^\[\s*jeda\s*([\d.,]*)/i);
    if (pj) { segs.push({ pause: parseFloat((pj[1] || '1.5').replace(',', '.')) || 1.5 }); }
    const body = line.replace(TAG_RE, ' ').replace(PH_RE, ' ').trim();
    if (body) splitSentences(body).forEach((s) => segs.push({ text: s, w: wordCount(s), q: /\?\s*$/.test(s), op: /(menurut|analisis saya|saya )/i.test(s) }));
  }
  return segs;
}
function render3() {
  const p = P(); const an = analyze(p.script, S.wpm);
  const C = 326.7, off = C - (an.score / 100) * C;
  const tone = an.score >= 75 ? ['#8b5cf6', 'Kuat', 'text-emerald-400'] : an.score >= 55 ? ['#f59e0b', 'Perlu Opini Unik', 'text-amber-400'] : ['#f43f5e', 'Berisiko Repetitif', 'text-rose-400'];
  const bar = (l, v, col, extra = '') => `<div><div class="flex justify-between text-slate-400 mb-1 text-xs"><span>${l}</span><span class="text-white font-mono font-bold">${v}%${extra}</span></div><div class="w-full bg-surface-darkest h-2 rounded-full overflow-hidden"><div class="${col} h-2 rounded-full transition-all duration-700" style="width:${v}%"></div></div></div>`;
  const risk = an.botRisk < 25 ? ['Rendah', 'bg-emerald-400'] : an.botRisk < 45 ? ['Sedang', 'bg-amber-400'] : ['Tinggi', 'bg-rose-500'];
  const TIPC = { ok: ['text-emerald-400', '✓'], warn: ['text-amber-400', '•'], bad: ['text-rose-400', '!'] };
  pacing.bars = pacingSegments(p.script);
  const maxW = Math.max(1, ...pacing.bars.map((b) => b.w || 0));
  $('#view-3').innerHTML = `
  <div class="max-w-5xl mx-auto p-3 md:p-6 space-y-3">
    <div>
      <h2 class="text-base font-bold text-white flex items-center gap-2">${ic('shield-alert', 'w-5 h-5 text-brand-400')} AI Guard & Pacing</h2>
      <p class="text-xs text-slate-400 mt-0.5">Analisis heuristik di perangkat: pola repetitif, opini, bukti, dan ritme bicara. <span class="text-slate-500">Ini estimasi internal, bukan hasil deteksi resmi YouTube.</span></p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div class="card p-4">
        <div class="flex items-center justify-between"><span class="text-xs font-bold text-white uppercase tracking-wider">Skor Orisinalitas</span><span class="text-[10px] text-slate-500">${an.nWords} kata</span></div>
        <div class="my-3 flex items-center justify-center relative">
          <svg viewBox="0 0 128 128" class="w-32 h-32 -rotate-90"><circle cx="64" cy="64" r="52" stroke="#1f2335" stroke-width="10" fill="none"/><circle cx="64" cy="64" r="52" stroke="${tone[0]}" stroke-width="10" fill="none" stroke-dasharray="${C}" stroke-dashoffset="${off}" stroke-linecap="round"/></svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center"><span class="text-3xl font-black text-white">${an.score}%</span><span class="text-[10px] font-bold uppercase tracking-wider ${tone[2]}">${tone[1]}</span></div>
        </div>
        <div class="text-[11px] text-slate-400 bg-surface-card/60 p-2.5 rounded-xl border border-surface-border grid grid-cols-3 gap-2 text-center">
          <div><div class="text-white font-mono text-sm">${an.opinions}</div>opini</div>
          <div><div class="text-white font-mono text-sm">${an.questions}</div>pertanyaan</div>
          <div><div class="text-white font-mono text-sm">${an.pauses.n}</div>jeda</div>
        </div>
      </div>
      <div class="card p-4 space-y-3">
        <span class="text-xs font-bold text-white uppercase tracking-wider">Komponen</span>
        ${bar('Analisis / opini', an.ratios.opini, 'bg-indigo-500')}
        ${bar('Bukti & sumber', an.ratios.bukti, 'bg-cyan-500')}
        ${bar('Variasi kosakata', an.ratios.vocab, 'bg-purple-500')}
        ${bar('Risiko pola bot', an.botRisk, risk[1], ` (${risk[0]})`)}
      </div>
    </div>
    <div class="card p-4 space-y-2">
      <div class="flex items-center justify-between"><span class="text-xs font-bold text-white uppercase tracking-wider">Tindakan Penyempurnaan</span><span class="chip bg-amber-500/20 text-amber-300">${an.tips.filter((t) => t.k !== 'ok').length} saran</span></div>
      ${an.tips.map((t) => `<div class="p-2.5 rounded-xl bg-surface-card border border-surface-border flex items-start gap-2.5"><span class="${TIPC[t.k][0]} font-bold w-3 text-center mt-px">${TIPC[t.k][1]}</span><div class="flex-1 min-w-0"><p class="font-medium text-white text-[12px]">${esc(t.t)}</p><p class="text-[11px] text-slate-400">${esc(t.d)}</p></div>${t.act ? `<button data-act="tipAct" data-a="${esc(t.act)}" class="btn-ghost !py-1 !min-h-0 !text-[11px] shrink-0">Terapkan</button>` : ''}</div>`).join('')}
    </div>
    <div class="card p-4 space-y-3">
      <div class="flex items-center justify-between gap-2">
        <div><h3 class="text-xs font-bold text-white flex items-center gap-1.5">${ic('activity', 'w-4 h-4 text-cyan-400')} Visualizer Ritme Bicara</h3><p class="text-[11px] text-slate-400">Setiap batang = satu kalimat; tinggi = panjang kalimat.</p></div>
        <span class="chip bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 !text-[11px]">${S.wpm} WPM</span>
      </div>
      <div id="wave" class="h-24 bg-surface-darkest rounded-xl p-3 flex items-center gap-[3px] overflow-x-auto border border-surface-border">
        ${pacing.bars.length ? pacing.bars.map((b, i) => b.pause ? `<div data-i="${i}" class="w-1.5 shrink-0 rounded-full bg-amber-400 h-3" title="Jeda ${b.pause}s"></div>` : `<div data-i="${i}" class="w-1.5 shrink-0 rounded-full ${b.q ? 'bg-rose-400' : b.op ? 'bg-purple-400' : 'bg-cyan-400'} opacity-70" style="height:${Math.max(14, Math.round((b.w / maxW) * 100))}%" title="${b.w} kata"></div>`).join('') : `<span class="text-xs text-slate-500 mx-auto">Belum ada kalimat.</span>`}
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
        <span class="flex items-center gap-1.5"><i class="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block"></i>Kalimat</span>
        <span class="flex items-center gap-1.5"><i class="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block"></i>Opini</span>
        <span class="flex items-center gap-1.5"><i class="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block"></i>Pertanyaan</span>
        <span class="flex items-center gap-1.5"><i class="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></i>Jeda</span>
      </div>
      <button id="btnPlay" data-act="play" class="btn-ghost w-full text-cyan-300">${ic('play', 'w-3.5 h-3.5')} Putar simulasi suara (${S.wpm} WPM)</button>
    </div>
    <div class="flex justify-between"><button data-act="mod" data-n="2" class="btn-ghost">${ic('arrow-left', 'w-3.5 h-3.5')} Edit Skrip</button><button data-act="mod" data-n="4" class="btn-primary">Aset ${ic('arrow-right', 'w-3.5 h-3.5')}</button></div>
  </div>`;
}
function stopPacing() {
  clearTimeout(pacing.timer); pacing.playing = false; pacing.idx = -1;
  try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* abaikan */ }
  const b = $('#btnPlay'); if (b) b.innerHTML = `${ic('play', 'w-3.5 h-3.5')} Putar simulasi suara (${S.wpm} WPM)`;
  document.querySelectorAll('#wave [data-i]').forEach((el) => el.classList.remove('wave-on', '!opacity-100'));
}
function playPacing() {
  if (pacing.playing) return stopPacing();
  if (!pacing.bars.length) return toast('Naskah masih kosong');
  const synth = window.speechSynthesis;
  const hasVoice = !!synth && typeof SpeechSynthesisUtterance !== 'undefined';
  pacing.playing = true;
  $('#btnPlay').innerHTML = `${ic('square', 'w-3.5 h-3.5')} Berhenti`;
  if (!hasVoice) toast('Suara tidak didukung; mode visual saja');
  const step = (i) => {
    if (!pacing.playing) return;
    document.querySelectorAll('#wave [data-i]').forEach((el) => el.classList.remove('wave-on', '!opacity-100'));
    if (i >= pacing.bars.length) return stopPacing();
    pacing.idx = i; const seg = pacing.bars[i];
    const el = $(`#wave [data-i="${i}"]`); if (el) { el.classList.add('wave-on', '!opacity-100'); el.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    if (seg.pause) { pacing.timer = setTimeout(() => step(i + 1), seg.pause * 1000); return; }
    const dur = (seg.w / S.wpm) * 60 * 1000;
    if (hasVoice) {
      const u = new SpeechSynthesisUtterance(seg.text); u.lang = 'id-ID'; u.rate = Math.max(0.6, Math.min(1.4, S.wpm / 140));
      u.onend = () => step(i + 1); u.onerror = () => { pacing.timer = setTimeout(() => step(i + 1), dur); };
      synth.speak(u);
    } else pacing.timer = setTimeout(() => step(i + 1), dur);
  };
  step(0);
}

/* ---------- Modul 4: Aset & Audit ---------- */
function render4() {
  const p = P();
  const L = [['emerald', 'Aman'], ['amber', 'Perlu Cek'], ['rose', 'Berisiko']];
  const au = p.lastAudit;
  $('#view-4').innerHTML = `
  <div class="max-w-5xl mx-auto p-3 md:p-6 space-y-3">
    <div class="flex items-start justify-between gap-2">
      <div>
        <h2 class="text-base font-bold text-white flex items-center gap-2">${ic('layers', 'w-5 h-5 text-brand-400')} Audit Aset Visual & Audio</h2>
        <p class="text-xs text-slate-400 mt-0.5">Catat tiap aset; status dihitung dari sumber, transformasi, durasi, dan riwayat pemakaian.</p>
      </div>
      <button data-act="assetAdd" class="btn-primary shrink-0">${ic('plus', 'w-3.5 h-3.5')} Aset</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      ${p.assets.length ? p.assets.map((a) => { const r = assessAsset(a); const [c, l] = L[r.lvl]; return `
      <div class="card p-3.5 space-y-2 ${r.lvl === 2 ? '!border-rose-500/40' : r.lvl === 1 ? '!border-amber-500/40' : ''}">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0"><h4 class="text-xs font-bold text-white truncate">${esc(a.name)}</h4><p class="text-[10px] text-slate-500">${esc(KINDS[a.kind])} • ${esc(SOURCES[a.source])}${a.start ? ' • ' + esc(a.start) : ''}${a.dur ? ' • ' + a.dur + 's' : ''}</p></div>
          <span class="chip bg-${c}-500/20 text-${c}-300 shrink-0">${l}</span>
        </div>
        <ul class="text-[11px] space-y-0.5">${r.issues.map((i) => `<li class="${['text-slate-400', 'text-amber-300', 'text-rose-300'][i.l]}">${['✓', '•', '!'][i.l]} ${esc(i.m)}</li>`).join('')}</ul>
        <div class="text-[10px] text-slate-500 flex flex-wrap gap-x-3">
          <span>Transformasi: ${esc(TRANSFORMS[a.transform || 'none'])}</span><span>Overlay teks: ${a.overlay ? 'ya' : 'tidak'}</span><span>Dipakai sebelumnya: ${+a.usedBefore || 0}×</span>
        </div>
        ${a.note ? `<p class="text-[11px] text-slate-400 italic">${esc(a.note)}</p>` : ''}
        <div class="flex gap-1.5 pt-1 border-t border-surface-border/60">
          <button data-act="assetEdit" data-id="${a.id}" class="btn-ghost !py-1 !min-h-0 !text-[11px]">${ic('pencil', 'w-3 h-3')} Edit</button>
          <button data-act="assetDel" data-id="${a.id}" class="btn-danger !py-1 !min-h-0 !text-[11px] ml-auto">${ic('trash-2', 'w-3 h-3')}</button>
        </div>
      </div>`; }).join('') : `<div class="card p-6 text-center text-xs text-slate-500 md:col-span-2">Belum ada aset. Tambahkan klip, gambar, atau audio yang akan dipakai.</div>`}
    </div>
    <div class="card p-4 space-y-3 border-brand-500/40 bg-gradient-to-br from-surface-card to-brand-950/40">
      <div class="flex items-start gap-2">${ic('shield-check', 'w-5 h-5 text-emerald-400 mt-0.5')}<div><h3 class="text-xs font-bold text-white">Audit Kesiapan Produksi (YPP)</h3><p class="text-[11px] text-slate-400 leading-relaxed">Memeriksa naskah, storyboard, dan semua aset sekaligus. Hasilnya panduan kerja, bukan jaminan monetisasi.</p></div></div>
      <button data-act="audit" class="btn-primary w-full !py-2.5">${ic('list-checks', 'w-4 h-4')} Jalankan Audit Final</button>
      ${au ? auditHTML(au) : ''}
    </div>
    <div class="flex justify-start"><button data-act="mod" data-n="3" class="btn-ghost">${ic('arrow-left', 'w-3.5 h-3.5')} AI Guard</button></div>
  </div>`;
}
function auditHTML(au) {
  const col = au.fails ? 'rose' : au.warns ? 'amber' : 'emerald';
  return `<div class="space-y-2 pt-1">
    <div class="flex items-center justify-between rounded-xl p-2.5 bg-${col}-500/10 border border-${col}-500/30"><span class="text-sm font-bold text-${col}-300">${au.status}</span><span class="text-[10px] text-slate-400">${au.fails} gagal • ${au.warns} peringatan • ${new Date(au.at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
    ${au.checks.map((c) => `<div class="flex items-start gap-2 text-[11px]"><span class="${['text-emerald-400', 'text-amber-400', 'text-rose-400'][c.lvl]} font-bold w-3 text-center">${['✓', '•', '✕'][c.lvl]}</span><div class="flex-1"><span class="text-slate-200">${esc(c.t)}</span>${c.d ? `<span class="block text-slate-500">${esc(c.d)}</span>` : ''}</div></div>`).join('')}
  </div>`;
}

/* ---------- Form sheets ---------- */
const opt = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
const val = (id) => ($('#' + id) || {}).value;

function sceneSheet(sc) {
  const isNew = !sc;
  const s = sc || { title: '', type: 'Isi', start: 0, end: 10, ...SCENE_PRESET.Isi };
  openSheet(isNew ? 'Scene baru' : 'Edit scene', `
    <div><label class="label">Judul</label><input id="f_title" class="input" value="${esc(s.title)}" placeholder="Mis. Studi kasus utama"></div>
    <div class="grid grid-cols-3 gap-2">
      <div><label class="label">Tipe</label><select id="f_type" class="input">${Object.keys(SCENE_PRESET).map((t) => `<option ${t === s.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div><label class="label">Mulai (dtk)</label><input id="f_start" type="number" inputmode="decimal" min="0" class="input" value="${Math.round(s.start)}"></div>
      <div><label class="label">Selesai (dtk)</label><input id="f_end" type="number" inputmode="decimal" min="0" class="input" value="${Math.round(s.end)}"></div>
    </div>
    <div><label class="label">Visual</label><textarea id="f_visual" rows="3" class="input">${esc(s.visual)}</textarea></div>
    <div class="grid grid-cols-2 gap-2">
      <div><label class="label">Audio</label><input id="f_audio" class="input" value="${esc(s.audio)}"></div>
      <div><label class="label">Gerak kamera</label><input id="f_motion" class="input" value="${esc(s.motion)}"></div>
    </div>`, [
    { label: 'Batal' },
    { label: 'Simpan', cls: 'btn-primary', fn: () => {
      const title = val('f_title').trim(); if (!title) { toast('Judul wajib diisi'); return false; }
      const st = Math.max(0, +val('f_start') || 0), en = Math.max(st + 1, +val('f_end') || st + 10);
      const data = { title, type: val('f_type'), start: st, end: en, visual: val('f_visual'), audio: val('f_audio'), motion: val('f_motion') };
      const p = P();
      if (isNew) p.scenes.push({ id: uid(), ...data }); else Object.assign(sc, data);
      save(); render(); toast('Scene disimpan');
    } }
  ], { focus: '#f_title' });
}
function assetSheet(a) {
  const isNew = !a;
  const x = a || { name: '', kind: 'video', source: 'own', dur: 5, usedBefore: 0, transform: 'none', overlay: false, start: '', note: '' };
  openSheet(isNew ? 'Aset baru' : 'Edit aset', `
    <div><label class="label">Nama aset</label><input id="f_name" class="input" value="${esc(x.name)}" placeholder="Mis. Footage kapal tua"></div>
    <div class="grid grid-cols-2 gap-2">
      <div><label class="label">Jenis</label><select id="f_kind" class="input">${opt(KINDS, x.kind)}</select></div>
      <div><label class="label">Sumber / lisensi</label><select id="f_source" class="input">${opt(SOURCES, x.source)}</select></div>
    </div>
    <div class="grid grid-cols-3 gap-2">
      <div><label class="label">Durasi (dtk)</label><input id="f_dur" type="number" inputmode="decimal" min="0" class="input" value="${x.dur}"></div>
      <div><label class="label">Muncul di</label><input id="f_astart" class="input" value="${esc(x.start)}" placeholder="0:45"></div>
      <div><label class="label">Dipakai (×)</label><input id="f_used" type="number" inputmode="numeric" min="0" class="input" value="${x.usedBefore}"></div>
    </div>
    <div><label class="label">Transformasi</label><select id="f_transform" class="input">${opt(TRANSFORMS, x.transform || 'none')}</select></div>
    <label class="flex items-center gap-2 text-slate-300 text-sm"><input id="f_overlay" type="checkbox" class="w-5 h-5 accent-violet-500" ${x.overlay ? 'checked' : ''}> Ada overlay teks / komentar narasi</label>
    <div><label class="label">Catatan (atribusi, bukti lisensi, dll.)</label><textarea id="f_note" rows="2" class="input">${esc(x.note)}</textarea></div>`, [
    { label: 'Batal' },
    { label: 'Simpan', cls: 'btn-primary', fn: () => {
      const name = val('f_name').trim(); if (!name) { toast('Nama aset wajib diisi'); return false; }
      const data = { name, kind: val('f_kind'), source: val('f_source'), dur: Math.max(0, +val('f_dur') || 0), start: val('f_astart').trim(), usedBefore: Math.max(0, parseInt(val('f_used')) || 0), transform: val('f_transform'), overlay: $('#f_overlay').checked, note: val('f_note').trim() };
      if (isNew) P().assets.push({ id: uid(), ...data }); else Object.assign(a, data);
      save(); render(); toast('Aset disimpan');
    } }
  ], { focus: '#f_name' });
}
function genSheet() {
  const p = P();
  openSheet('Generator Naskah', `
    <p class="text-slate-400 leading-relaxed">Membuat kerangka naskah anti-generik. Bagian <code class="text-brand-300 font-mono">{{…}}</code> sengaja kosong: isi dengan data dan sumber nyata, jangan dikarang.</p>
    <div><label class="label">Topik</label><input id="g_topic" class="input" value="${esc(p.topic)}"></div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div><label class="label">Sudut pandang</label><select id="g_angle" class="input">${opt(ANGLES, 'psychology')}</select></div>
      <div><label class="label">Gaya tutur</label><select id="g_tone" class="input">${opt(TONES, 'investigative')}</select></div>
    </div>
    <div><label class="label">Jumlah bagian</label><select id="g_n" class="input"><option value="4">4 (ringkas)</option><option value="5" selected>5</option><option value="6">6</option><option value="7">7 (lengkap)</option></select></div>
    <div class="rounded-xl bg-brand-950/50 border border-brand-700/40 p-2.5 text-[11px] text-purple-200 space-y-0.5"><p class="font-semibold text-brand-300">Aturan bawaan:</p><p>• Tanpa pembuka klise bot</p><p>• Ada opini kritis, sanggahan, dan penutup ajak diskusi</p><p>• Jeda napas disisipkan otomatis</p></div>`, [
    { label: 'Batal' },
    { label: 'Buat Naskah', cls: 'btn-primary', fn: () => {
      const topic = val('g_topic').trim(); if (!topic) { toast('Isi topik dulu'); return false; }
      const apply = () => {
        const pr = P(); pr.topic = topic;
        pr.script = genScript({ topic, angle: val('g_angle') || 'psychology', tone: val('g_tone') || 'investigative', sections: val('g_n') });
        pr.scenes = scenesFromScript(pr.script, S.wpm);
        save(); scriptTab = 'naskah'; render(); toast('Naskah dibuat — isi bagian {{…}}');
      };
      const angle = val('g_angle'), tone = val('g_tone'), n = val('g_n');
      if (p.script.trim().length > 40) { // konfirmasi sebelum menimpa
        setTimeout(async () => { if (await confirmSheet('Timpa naskah?', 'Naskah dan storyboard saat ini akan diganti.', 'Timpa', true)) { const pr = P(); pr.topic = topic; pr.script = genScript({ topic, angle, tone, sections: n }); pr.scenes = scenesFromScript(pr.script, S.wpm); save(); scriptTab = 'naskah'; render(); toast('Naskah dibuat — isi bagian {{…}}'); } }, 30);
      } else apply();
    } }
  ]);
}
function projectsSheet() {
  const body = `
    <div class="space-y-1.5">${S.projects.map((p) => `<button data-act="openProject" data-id="${p.id}" class="w-full text-left p-3 rounded-xl border ${p.id === S.activeId ? 'border-brand-500/60 bg-brand-600/10' : 'border-surface-border bg-surface-darkest'} flex items-center justify-between gap-2"><div class="min-w-0"><div class="text-sm font-semibold text-white truncate">${esc(p.title || 'Tanpa judul')}</div><div class="text-[10px] text-slate-500">${wordCount(p.script)} kata • diubah ${new Date(p.updatedAt).toLocaleDateString('id-ID')}</div></div>${p.id === S.activeId ? ic('check', 'w-4 h-4 text-brand-400') : ''}</button>`).join('')}</div>
    <div class="pt-2 border-t border-surface-border space-y-2"><label class="label" for="np_topic">Proyek baru</label><div class="flex gap-2"><input id="np_topic" class="input" placeholder="Topik / judul proyek"><button data-act="newProject" class="btn-primary shrink-0">${ic('plus')} Buat</button></div></div>`;
  openSheet('Proyek', body, []);
}
function menuSheet() {
  const it = (act, icon, label, sub = '') => `<button data-act="${act}" class="w-full flex items-center gap-3 p-3 rounded-xl bg-surface-darkest border border-surface-border text-left active:bg-surface-highlight"><span class="text-brand-400">${ic(icon, 'w-5 h-5')}</span><span><span class="block text-sm text-white font-medium">${label}</span>${sub ? `<span class="block text-[11px] text-slate-500">${sub}</span>` : ''}</span></button>`;
  openSheet('Menu', `<div class="space-y-1.5">
    ${it('exportAll', 'download', 'Cadangkan semua data', 'File JSON — simpan ke Files / iCloud')}
    ${it('importAll', 'upload', 'Pulihkan dari cadangan', 'Gabungkan proyek dari file JSON')}
    ${it('dlScript', 'file-text', 'Unduh naskah (.txt)')}
    ${it('copyScript', 'copy', 'Salin naskah')}
    ${it('dlAssets', 'layers', 'Ekspor daftar aset (CSV)')}
    ${it('delProject', 'trash-2', 'Hapus proyek ini')}
    ${it('checkUpdate', 'refresh-cw', 'Cek pembaruan', 'Versi ' + APP_VERSION)}
  </div>`, []);
}

/* ---------- File helpers ---------- */
async function saveFile(name, mime, content) {
  const blob = new Blob([content], { type: mime });
  try {
    const f = new File([blob], name, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { /* abaikan */ } ta.remove(); return ok;
  }
}
const slug = (s) => String(s || 'proyek').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'proyek';

/* ---------- Aksi ---------- */
const ACT = {
  mod: (d) => { closeSheet(); switchModule(+d.n); },
  projects: () => projectsSheet(),
  menu: () => menuSheet(),
  openProject: (d) => { S.activeId = d.id; save(true); closeSheet(); render(); },
  newProject: () => {
    const t = (val('np_topic') || '').trim(); if (!t) return toast('Isi topik proyek');
    const p = { id: uid(), title: t, topic: t, script: '', ideas: genIdeas(t), scenes: [], assets: [], lastAudit: null, createdAt: Date.now(), updatedAt: Date.now() };
    S.projects.unshift(p); S.activeId = p.id; save(true); closeSheet(); switchModule(1); toast('Proyek dibuat');
  },
  genIdeas: () => {
    const t = (val('topicIn') || '').trim(); if (!t) return toast('Isi topik dulu');
    const p = P(); const favs = p.ideas.filter((i) => i.fav).map((i) => i.title);
    p.topic = t; if (!p.script.trim()) p.title = t;
    p.ideas = genIdeas(t); save(); render(); toast('15 ide siap'); void favs;
  },
  ideaFilter: (d) => { ideaFilter = d.f; render(); },
  fav: (d) => { const i = P().ideas.find((x) => x.id === d.id); if (i) { i.fav = !i.fav; save(); render(); } },
  useIdea: async (d) => {
    const p = P(); const i = p.ideas.find((x) => x.id === d.id); if (!i) return;
    if (p.script.trim().length > 40 && !(await confirmSheet('Pakai ide ini?', 'Naskah dan storyboard saat ini akan diganti dengan kerangka baru.', 'Pakai', true))) return;
    p.title = i.title;
    p.script = genScript({ topic: p.topic, angle: i.angle, tone: 'investigative', sections: 5 });
    p.scenes = scenesFromScript(p.script, S.wpm);
    save(true); scriptTab = 'naskah'; switchModule(2); toast('Ide diterapkan — isi bagian {{…}}');
  },
  stab: (d) => { scriptTab = d.t; render(); },
  wpm: (d) => { S.wpm = clamp(S.wpm + +d.d, 100, 180); save(); updateScriptMeta(); },
  tag: (d) => {
    const ta = $('#scriptInput'); const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    const pre = s > 0 && v[s - 1] !== '\n' ? '\n' : '';
    ta.value = v.slice(0, s) + pre + d.tag + '\n' + v.slice(e); const pos = s + pre.length + d.tag.length + 1;
    ta.focus(); ta.setSelectionRange(pos, pos); P().script = ta.value; save(); updateScriptMeta(); toast('Tag ' + d.tag + ' disisipkan');
  },
  clean: () => {
    const p = P(); let t = p.script; const before = t;
    CLEAN_MAP.forEach(([re, rep]) => { t = t.replace(re, rep); });
    if (t === before) return toast('Tidak ada frasa klise');
    p.script = t; save(); if (mod === 2) { const ta = $('#scriptInput'); if (ta) ta.value = t; updateScriptMeta(); } else render(); toast('Klise bot dibersihkan');
  },
  tipAct: (d) => {
    if (d.a === 'clean') return ACT.clean();
    if (d.a.startsWith('tag:')) { const p = P(); p.script = p.script.replace(/\s*$/, '') + '\n\n' + d.a.slice(4) + '\n'; save(); render(); toast('Tag ditambahkan di akhir naskah — pindahkan ke posisi yang pas'); }
  },
  gen: () => genSheet(),
  copyScript: async () => { closeSheet(); toast((await copyText(P().script)) ? 'Naskah disalin' : 'Gagal menyalin'); },
  toStory: () => { scriptTab = 'story'; render(); },
  scenesFromScript: async () => {
    const p = P(); if (!p.script.trim()) return toast('Naskah masih kosong');
    if (p.scenes.length && !(await confirmSheet('Buat ulang storyboard?', 'Scene yang ada akan diganti dengan hasil dari naskah.', 'Buat ulang', true))) return;
    p.scenes = scenesFromScript(p.script, S.wpm); save(); render(); toast(p.scenes.length + ' scene dibuat');
  },
  sceneAdd: () => sceneSheet(null),
  sceneEdit: (d) => sceneSheet(P().scenes.find((s) => s.id === d.id)),
  sceneDel: async (d) => { if (await confirmSheet('Hapus scene?', 'Scene ini akan dihapus.', 'Hapus', true)) { const p = P(); p.scenes = p.scenes.filter((s) => s.id !== d.id); save(); render(); } },
  sceneMove: (d) => { const a = P().scenes; const i = a.findIndex((s) => s.id === d.id), j = i + +d.d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; save(); render(); },
  play: () => playPacing(),
  assetAdd: () => assetSheet(null),
  assetEdit: (d) => assetSheet(P().assets.find((a) => a.id === d.id)),
  assetDel: async (d) => { if (await confirmSheet('Hapus aset?', 'Aset ini akan dihapus dari daftar audit.', 'Hapus', true)) { const p = P(); p.assets = p.assets.filter((a) => a.id !== d.id); save(); render(); } },
  audit: () => { const p = P(); p.lastAudit = finalAudit(p, S.wpm); save(); render4(); toast('Audit selesai: ' + p.lastAudit.status); },
  exportAll: async () => { closeSheet(); await saveFile(`yt-hunter-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', JSON.stringify({ app: 'yt-hunter', v: 1, exportedAt: new Date().toISOString(), data: S }, null, 2)); },
  importAll: () => { closeSheet(); $('#importFile').value = ''; $('#importFile').click(); },
  dlScript: async () => { closeSheet(); await saveFile(slug(P().title) + '.txt', 'text/plain', P().script); },
  dlAssets: async () => {
    closeSheet(); const rows = [['Nama', 'Jenis', 'Sumber', 'Durasi(s)', 'Muncul', 'Dipakai(x)', 'Transformasi', 'Overlay', 'Status', 'Catatan']];
    P().assets.forEach((a) => rows.push([a.name, KINDS[a.kind], SOURCES[a.source], a.dur, a.start, a.usedBefore, TRANSFORMS[a.transform || 'none'], a.overlay ? 'ya' : 'tidak', assessAsset(a).label, a.note]));
    await saveFile(slug(P().title) + '-aset.csv', 'text/csv', '﻿' + rows.map((r) => r.map(csvEscape).join(',')).join('\n'));
  },
  delProject: async () => {
    closeSheet();
    if (S.projects.length < 2) return toast('Minimal harus ada satu proyek');
    setTimeout(async () => { if (await confirmSheet('Hapus proyek?', `“${esc(P().title)}” akan dihapus permanen dari perangkat ini.`, 'Hapus', true)) { S.projects = S.projects.filter((p) => p.id !== S.activeId); S.activeId = S.projects[0].id; save(true); render(); toast('Proyek dihapus'); } }, 30);
  },
  checkUpdate: async () => {
    closeSheet();
    if (!('serviceWorker' in navigator)) return toast('Tidak didukung di browser ini');
    try { const reg = await navigator.serviceWorker.getRegistration(); if (!reg) return toast('SW gagal: ' + (window._swErr || 'sw.js tidak ditemukan / install gagal')); await reg.update(); toast(reg.waiting || reg.installing ? 'Pembaruan ditemukan' : 'Sudah versi terbaru'); } catch (e) { toast('Gagal cek pembaruan'); }
  }
};
$('#importFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text()); const d = j.data || j;
    if (!d || !Array.isArray(d.projects)) throw new Error('format');
    const ok = await confirmSheet('Pulihkan cadangan?', `${d.projects.length} proyek akan digabung. Proyek dengan ID sama akan ditimpa.`, 'Pulihkan');
    if (!ok) return;
    d.projects.forEach((p) => { const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = p; else S.projects.push(p); });
    save(true); render(); toast('Cadangan dipulihkan');
  } catch (err) { toast('File cadangan tidak valid'); }
});

/* ---------- PWA ---------- */
function showUpdate(worker) {
  const bar = $('#updateBar'); bar.classList.remove('hidden'); bar.classList.add('flex'); $('#appHeader').style.paddingTop = '.5rem';
  $('#btnUpdate').onclick = () => { save(true); worker.postMessage({ type: 'SKIP_WAITING' }); $('#btnUpdate').textContent = 'Memperbarui…'; };
}
function initPWA() {
  const online = () => $('#offlineBadge').classList.toggle('hidden', navigator.onLine);
  addEventListener('online', online); addEventListener('offline', online); online();
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => { const nw = reg.installing; if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(nw); }); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch((e) => { window._swErr = String(e && e.message || e); });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadController || reloading) return; reloading = true; location.reload(); });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(true); stopPacing(); } });
addEventListener('pagehide', () => save(true));

/* ---------- Init ---------- */
load();
initPWA();
switchModule(2);
