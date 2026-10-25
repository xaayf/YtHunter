// YT Hunter — Worker: /api/* (Workers AI). Aset statis dilayani langsung oleh Cloudflare Assets.
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const hits = new Map(); // rate limit sederhana per-isolate
const LIMIT = 40, WINDOW = 10 * 60 * 1000;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const clip = (s, n) => String(s ?? '').slice(0, n);
function cleanText(t) {
  return String(t || '').replace(/^\s*("{3}|`{3}[a-z]*)\s*\n?/, '').replace(/\n?\s*("{3}|`{3})\s*$/, '').replace(/^"{3}.*$/gm, '')
    .replace(/(^|[.!?]\s+|\n)Anda\b/g, '$1Kamu').replace(/\bAnda\b/g, 'kamu').replace(/\bkepada Kamu\b/g, 'kepada kamu').trim();
}

const SYS = `Kamu asisten penulis & editor konten YouTube berbahasa Indonesia. Gaya bahasa santai tapi tetap menghargai penonton, tidak kaku, tidak terlalu gaul. Prioritaskan orisinalitas, sudut pandang kritis, dan kejujuran: jangan pernah mengarang fakta, angka, tahun, kutipan, atau nama sumber.
Sapa penonton dengan "kamu" (JANGAN "Anda"). Nada analitis dan kritis, bukan promosi: dilarang memuja atau mempromosikan merek, produk, atau tokoh (hindari kata/kesan seperti "ikonik", "legendaris", "daya tarik yang kuat", "luar biasa", ajakan membeli). Fokus pada proses, kerja keras di balik layar, keputusan, biaya, risiko, dan trade-off, termasuk sisi gelap atau kritiknya.`;

const TASKS = {
  ideas: {
    json: true, max: 3200, temp: 0.9,
    build: (b) => ({
      user: `Topik: ${clip(b.topic, 200)}${b.notes ? `\nCatatan tambahan: ${clip(b.notes, 400)}` : ''}

Buat TEPAT 15 ide video YouTube yang berbeda sudut pandang untuk topik di atas. Syarat:
- Orisinal dan transformatif (analisis, opini, cek fakta, perbandingan, konteks) — bukan rangkuman generik atau daftar "10 fakta".
- Judul menarik tapi TIDAK boleh menyatakan fakta spesifik yang tidak pasti (angka, tahun, "laporan rahasia", dll.).
- Hindari framing promosi / pemujaan merek atau tokoh; utamakan bedah proses, kerja keras, keputusan, trade-off, dan kritik.
- "desc": 1-2 kalimat berisi apa yang dibahas dan nilai tambah / opini pembuatnya.
- "type": 2-3 kata (mis. "Cek Fakta", "Psikologi Massa").
- "badge": satu dari ["Transformatif","Data-driven","Storytelling","Kritis","Edukasi","Unik","High Retention"].
- "angle": satu dari ["psychology","science","debunk","human","compare","timeline"].
Balas HANYA JSON valid: {"ideas":[{"title":"","desc":"","type":"","badge":"","angle":""}]}`
    })
  },
  script: {
    json: false, max: 3800, temp: 0.85,
    build: (b) => {
      const mins = Math.min(10, Math.max(2, +b.minutes || 4));
      return { user: `Tulis naskah voice-over YouTube berbahasa Indonesia.
Topik: ${clip(b.topic, 200)}
Judul video: ${clip(b.title || b.topic, 200)}
Sudut pandang: ${clip(b.angle, 120)}
Gaya tutur: ${clip(b.tone, 80)}
Target durasi: ${mins} menit (± ${mins * 130} kata narasi).${b.notes ? `\nArahan tambahan dari penulis: ${clip(b.notes, 500)}` : ''}

Aturan wajib:
1. Format: tiap bagian diawali tag di baris sendiri dalam kurung siku, contoh: [Hook: 0-10s], [Konflik], [Bukti & Sumber], [Jeda 1.5s], [Opini Kritis & Analisis], [Sanggahan], [Penutup & Ajak Diskusi]. Narasi ditulis di bawah tag. Hanya tulis kalimat yang dibacakan; tanpa catatan sutradara di luar tag.
2. Hook 10 detik pertama berupa pertanyaan atau klaim kontras. DILARANG pembuka klise: "Tahukah kamu", "Di video kali ini", "Halo guys", "Jangan lupa like/subscribe".
3. Sisipkan minimal 2 opini pribadi (mis. "Menurut analisis saya...") dan 1-2 jeda napas "[Jeda 1.5s]".
4. JANGAN mengarang fakta. Setiap data spesifik (angka, tahun, nama dokumen/studi/sumber, kutipan) ditulis sebagai placeholder {{isi: data apa yang harus dicari penulis}}. Pernyataan umum yang pasti benar boleh ditulis langsung.
5. Variasikan panjang dan awalan kalimat.
6. Tentukan SATU tesis / pesan inti video di awal, lalu semua bagian harus mendukungnya. Sertakan minimal satu sanggahan atau sisi kritis (biaya, risiko, kontroversi, atau kelemahan argumenmu sendiri).
7. Penutup: rangkum temuan inti dalam 1-2 kalimat yang spesifik pada tesis (bukan pujian umum terhadap topik atau merek), lalu ajukan SATU pertanyaan diskusi yang tajam dan spesifik (mis. soal dilema, trade-off, atau pelajaran yang bisa dipakai penonton). DILARANG penutup ala iklan: tanpa kata "daya tarik", "ikonik", "kita bisa memahami lebih baik", dan tanpa pertanyaan generik "apa yang membuatmu tertarik".
8. Jangan memakai tanda kutip tiga (\"\"\") atau blok kode.
Balas HANYA naskahnya, tanpa pembuka atau penutup dari kamu.` };
    }
  },
  scenes: {
    json: true, max: 2500, temp: 0.7,
    build: (b) => ({
      user: `Berikut bagian-bagian naskah video (urut):
${(Array.isArray(b.scenes) ? b.scenes : []).slice(0, 14).map((s, i) => `${i + 1}. [${clip(s.title, 60)}] ${clip(s.text, 300)}`).join('\n')}

Untuk TIAP bagian, rancang storyboard praktis. Visual harus memakai footage buatan sendiri, stok berlisensi, public domain, atau grafik/animasi buatan sendiri — JANGAN menyarankan klip pihak ketiga yang berhak cipta. Tiap field singkat (maks 1 kalimat).
Balas HANYA JSON valid dengan jumlah elemen sama persis: {"scenes":[{"visual":"","audio":"","motion":""}]}`
    })
  },
  review: {
    json: true, max: 2200, temp: 0.4,
    build: (b) => ({
      user: `Review naskah YouTube berikut sebagai editor kritis. Nilai orisinalitas, kekuatan hook, kedalaman analisis, kejelasan bukti, repetisi/klise bot, ajakan diskusi, dan apakah nadanya terdengar seperti iklan / pemujaan (jika ya, jadikan issue dengan fix yang lebih kritis).
Metrik otomatis: ${clip(b.metrics, 400)}

NASKAH:
"""
${clip(b.script, 9000)}
"""

Balas HANYA JSON valid:
{"summary":"2 kalimat penilaian jujur","strengths":["maks 3 poin"],"issues":[{"quote":"kutipan PERSIS dari naskah (satu kalimat pendek, boleh kosong jika umum)","problem":"masalahnya","fix":"kalimat pengganti siap pakai bila quote tidak kosong; jika tidak, saran singkat"}],"hook_alternatives":["2 alternatif hook 10 detik pertama"]}
Maksimal 5 issues. Jangan mengarang fakta pada perbaikan.`
    })
  },
  style: {
    json: false, max: 700, temp: 0.7,
    build: (b) => ({
      user: `Buat "style bible" visual untuk video YouTube berikut, dipakai ulang di SEMUA prompt gambar/video agar konsisten.
Topik: ${clip(b.topic, 200)}
Judul: ${clip(b.title || b.topic, 200)}
Gaya tutur: ${clip(b.tone, 80)}
Cuplikan naskah: ${clip(b.script, 1500)}

Tulis dalam BAHASA INGGRIS, satu paragraf padat 60-100 kata, mencakup: medium/look (mis. cinematic documentary photography), palet warna, pencahayaan, gaya lensa / film grain, era dan lokasi, motif visual berulang, rasio 16:9, dan daftar "avoid" (no logos, no brand names, no readable text, no real people's likeness, no copyrighted characters).
Balas HANYA paragraf style bible.`
    })
  },
  shots: {
    json: true, max: 3500, temp: 0.8,
    build: (b) => {
      const n = Math.min(12, Math.max(1, Math.round(+b.count || 1)));
      const en = b.lang !== 'id';
      return { user: `Kamu prompt engineer untuk generator visual Google: Nano Banana (gambar) dan Flow / Veo (video).
STYLE BIBLE proyek (terapkan pada SETIAP prompt, pakai deskriptornya secara konsisten): ${clip(b.style, 900) || '(kosong: pilih gaya sinematik dokumenter yang konsisten)'}

SCENE: "${clip(b.title, 80)}" (tipe ${clip(b.type, 20)}), durasi ${Math.round(+b.duration || 0)} detik.
Narasi scene ini: """${clip(b.text, 1500)}"""

Pecah scene menjadi TEPAT ${n} shot berurutan (± ${Math.max(3, Math.round((+b.duration || 6) / n))} detik per shot) yang memvisualkan narasi, bervariasi sudut/jarak (wide, medium, close-up, detail) dan tidak repetitif.
Untuk tiap shot:
- "image": prompt gambar keyframe (${en ? 'bahasa Inggris' : 'bahasa Indonesia'}), satu paragraf natural: subjek, aksi/pose, latar, komposisi & jenis shot, pencahayaan, lensa, palet, 16:9.
- "video": prompt video ${en ? 'bahasa Inggris' : 'bahasa Indonesia'} untuk menganimasikan keyframe tadi (image-to-video): apa yang bergerak dari awal ke akhir klip ± 6 detik, gerak kamera (mis. slow dolly in, pan kiri, static), suasana, dan audio lingkungan. Tulis "No dialogue, no music" karena narasi dan musik ditambahkan terpisah.
- "overlay": teks layar singkat dalam bahasa Indonesia, atau "" jika tidak perlu.
- "sfx": cue efek suara / musik singkat dalam bahasa Indonesia.
Aturan: tanpa logo, nama merek, teks terbaca di dalam gambar, wajah orang nyata, atau karakter berhak cipta; gunakan deskripsi generik (mis. "a red Italian sports car with no badges", "an anonymous engineer"). Jangan mengarang fakta; visual bersifat ilustratif.
Balas HANYA JSON valid: {"shots":[{"image":"","video":"","overlay":"","sfx":""}]} dengan tepat ${n} elemen.` };
    }
  },
  rewrite: {
    json: false, max: 3800, temp: 0.6,
    build: (b) => ({
      user: `Poles naskah berikut: ganti frasa klise / generik ala bot ("Tahukah kamu", "Fakta menarik", "Di video kali ini", "Simak sampai habis", dst.) dan variasikan awalan kalimat yang berulang, supaya terdengar seperti manusia bercerita.
Aturan: pertahankan makna, urutan, dan SEMUA tag [..] persis apa adanya; pertahankan semua placeholder {{..}}; jangan menambah fakta baru; jangan memperpanjang lebih dari 10%.
Balas HANYA naskah hasil poles.

NASKAH:
"""
${clip(b.script, 12000)}
"""`
    })
  }
};

function extractJSON(t) {
  if (t && typeof t === 'object') return t;
  const s = String(t || '');
  const i = s.search(/[\[{]/); if (i < 0) throw new Error('no json');
  const open = s[i], close = open === '{' ? '}' : ']';
  const j = s.lastIndexOf(close); if (j <= i) throw new Error('no json');
  return JSON.parse(s.slice(i, j + 1));
}

class HttpErr extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function callGemini(env, system, user, t) {
  const model = env.GEMINI_MODEL || 'gemini-3.6-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: t.temp, maxOutputTokens: t.max * 2, ...(t.json ? { responseMimeType: 'application/json' } : {}) }
    })
  });
  if (!r.ok) {
    if (r.status === 429) throw new HttpErr(429, 'Kuota Gemini habis / terlalu sering. Coba lagi sebentar.');
    if (r.status === 404) throw new HttpErr(502, `Model "${model}" tidak tersedia. Ubah variabel GEMINI_MODEL.`);
    if (r.status === 400 || r.status === 401 || r.status === 403) throw new HttpErr(502, 'Kunci Gemini ditolak atau tidak valid (cek GEMINI_API_KEY & model).');
    throw new HttpErr(502, 'Gemini error ' + r.status);
  }
  const j = await r.json();
  if (j.promptFeedback && j.promptFeedback.blockReason) throw new HttpErr(422, 'Topik diblokir filter keamanan Gemini. Ubah arahan / topiknya.');
  const c = j.candidates && j.candidates[0];
  const txt = c && c.content && c.content.parts ? c.content.parts.map((p) => p.text || '').join('') : '';
  if (!txt) throw new HttpErr(c && c.finishReason === 'SAFETY' ? 422 : 502, c && c.finishReason === 'SAFETY' ? 'Hasil diblokir filter keamanan Gemini.' : 'Gemini tidak mengembalikan teks.');
  return txt;
}
async function callWorkersAI(env, system, user, t) {
  const out = await env.AI.run(MODEL, { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: t.max, temperature: t.temp });
  const raw = out && out.response;
  return typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
}
/** Gemini bila kunci ada; jika Gemini kena kuota/gangguan dan Workers AI tersedia → cadangan. */
async function runAI(env, t, body) {
  const { user } = t.build(body);
  if (env.GEMINI_API_KEY) {
    try { return { raw: await callGemini(env, SYS, user, t), via: 'gemini' }; }
    catch (e) {
      const retryable = e instanceof HttpErr ? (e.status === 429 || e.status >= 500 || e.status === 502) : true;
      if (!(env.AI && retryable)) throw e;
    }
  }
  if (!env.AI) throw new HttpErr(500, 'Belum ada penyedia AI (isi GEMINI_API_KEY atau aktifkan binding AI).');
  return { raw: await callWorkersAI(env, SYS, user, t), via: 'workers-ai' };
}
function safeEq(a, b) {
  a = String(a || ''); b = String(b || ''); let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    const provider = env.GEMINI_API_KEY ? 'gemini' : env.AI ? 'workers-ai' : null;
    if (url.pathname === '/api/health') return json({ ok: true, ai: !!provider, provider, model: provider === 'gemini' ? (env.GEMINI_MODEL || 'gemini-3.6-flash') : MODEL, pin: !!env.APP_PIN, fallback: !!(env.GEMINI_API_KEY && env.AI) });
    if (url.pathname !== '/api/ai') return json({ ok: false, error: 'Tidak ditemukan' }, 404);
    if (req.method !== 'POST') return json({ ok: false, error: 'Gunakan POST' }, 405);
    if (!provider) return json({ ok: false, error: 'Belum ada penyedia AI di Worker ini' }, 500);

    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== url.host) return json({ ok: false, error: 'Origin ditolak' }, 403);

    const ip = req.headers.get('cf-connecting-ip') || 'anon', now = Date.now();
    // PIN: gagal dibatasi ketat
    if (env.APP_PIN) {
      const failKey = 'f:' + ip;
      const fails = (hits.get(failKey) || []).filter((x) => now - x < WINDOW);
      if (fails.length >= 10) return json({ ok: false, error: 'Terlalu banyak PIN salah. Coba lagi nanti.', code: 'pin' }, 429);
      if (!safeEq(req.headers.get('x-app-pin'), env.APP_PIN)) { fails.push(now); hits.set(failKey, fails); return json({ ok: false, error: 'PIN diperlukan atau salah.', code: 'pin' }, 401); }
    }
    const arr = (hits.get(ip) || []).filter((x) => now - x < WINDOW);
    if (arr.length >= (env.APP_PIN ? 200 : LIMIT)) return json({ ok: false, error: 'Terlalu sering memanggil AI, coba lagi beberapa menit.' }, 429);
    arr.push(now); hits.set(ip, arr);
    if (hits.size > 500) for (const [k, v] of hits) if (!v.some((x) => now - x < WINDOW)) hits.delete(k);

    let body; try { body = await req.json(); } catch { return json({ ok: false, error: 'Body bukan JSON' }, 400); }
    if (body && body.task === 'ping') return json({ ok: true, data: { pong: true } });
    const t = TASKS[body && body.task];
    if (!t) return json({ ok: false, error: 'Task tidak dikenal' }, 400);
    if (JSON.stringify(body).length > 30000) return json({ ok: false, error: 'Input terlalu besar' }, 413);

    try {
      let { raw, via } = await runAI(env, t, body);
      if (!t.json) return json({ ok: true, via, data: { text: cleanText(raw) } });
      try { return json({ ok: true, via, data: extractJSON(raw) }); } catch {
        ({ raw, via } = await runAI(env, t, body)); // coba sekali lagi
        return json({ ok: true, via, data: extractJSON(raw) });
      }
    } catch (e) {
      if (e instanceof HttpErr) return json({ ok: false, error: e.message }, e.status);
      const m = String((e && e.message) || e);
      if (/quota|limit|neurons|capacity/i.test(m)) return json({ ok: false, error: 'Kuota AI harian habis. Coba lagi besok.' }, 429);
      if (/json/i.test(m)) return json({ ok: false, error: 'AI membalas format tidak valid, coba lagi.' }, 502);
      return json({ ok: false, error: 'AI gagal merespons: ' + m.slice(0, 120) }, 502);
    }
  }
};
