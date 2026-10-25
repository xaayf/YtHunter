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

async function runAI(env, t, body) {
  const { user } = t.build(body);
  const out = await env.AI.run(MODEL, { messages: [{ role: 'system', content: SYS }, { role: 'user', content: user }], max_tokens: t.max, temperature: t.temp });
  const raw = out && out.response;
  return typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);

    if (url.pathname === '/api/health') return json({ ok: true, ai: !!env.AI, model: MODEL });
    if (url.pathname !== '/api/ai') return json({ ok: false, error: 'Tidak ditemukan' }, 404);
    if (req.method !== 'POST') return json({ ok: false, error: 'Gunakan POST' }, 405);
    if (!env.AI) return json({ ok: false, error: 'Binding AI belum aktif di Worker ini' }, 500);

    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== url.host) return json({ ok: false, error: 'Origin ditolak' }, 403);

    const ip = req.headers.get('cf-connecting-ip') || 'anon', now = Date.now();
    const arr = (hits.get(ip) || []).filter((x) => now - x < WINDOW);
    if (arr.length >= LIMIT) return json({ ok: false, error: 'Terlalu sering memanggil AI, coba lagi beberapa menit.' }, 429);
    arr.push(now); hits.set(ip, arr);
    if (hits.size > 500) for (const [k, v] of hits) if (!v.some((x) => now - x < WINDOW)) hits.delete(k);

    let body; try { body = await req.json(); } catch { return json({ ok: false, error: 'Body bukan JSON' }, 400); }
    const t = TASKS[body && body.task];
    if (!t) return json({ ok: false, error: 'Task tidak dikenal' }, 400);
    if (JSON.stringify(body).length > 30000) return json({ ok: false, error: 'Input terlalu besar' }, 413);

    try {
      let raw = await runAI(env, t, body);
      if (!t.json) return json({ ok: true, data: { text: cleanText(raw) } });
      try { return json({ ok: true, data: extractJSON(raw) }); } catch {
        raw = await runAI(env, t, body); // coba sekali lagi
        return json({ ok: true, data: extractJSON(raw) });
      }
    } catch (e) {
      const m = String((e && e.message) || e);
      if (/quota|limit|neurons|capacity/i.test(m)) return json({ ok: false, error: 'Kuota AI harian habis. Coba lagi besok.' }, 429);
      if (/json/i.test(m)) return json({ ok: false, error: 'AI membalas format tidak valid, coba lagi.' }, 502);
      return json({ ok: false, error: 'AI gagal merespons: ' + m.slice(0, 120) }, 502);
    }
  }
};
