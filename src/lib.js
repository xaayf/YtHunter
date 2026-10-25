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
