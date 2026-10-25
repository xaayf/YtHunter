/* ===== YT Hunter — UI ===== */
const APP_VERSION = '__VERSION__';
const KEY = 'ythunter:v1';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, c = 'w-4 h-4') => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const spin = (c = 'w-4 h-4') => ic('refresh-cw', c + ' animate-spin');

/* ---------- State ---------- */
let S = null;
let mod = 1;              // launchpad dulu
let scriptTab = 'naskah';
let ideaFilter = 'all';
let memStore = null;
const busy = { ideas: false, review: false, scenes: false };

function blankProject(title = 'Proyek Baru', topic = '') {
  return { id: uid(), title, topic, script: '', ideas: [], scenes: [], assets: [], lastAudit: null, review: null, createdAt: Date.now(), updatedAt: Date.now() };
}
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { raw = memStore; }
  if (raw) {
    try {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.projects) && d.projects.length) {
        S = d; if (!S.wpm) S.wpm = 130;
        // buang proyek contoh bawaan versi lama (template) bila tak pernah disentuh
        S.projects = S.projects.filter((p) => !(p.title === 'Misteri Segitiga Bermuda' && p.assets && p.assets[0] && p.assets[0].name === 'Laut badai (footage stok)'));
        S.projects.forEach((p) => { p.ideas = (p.ideas || []).filter((i) => i.ai); p.review = p.review || null; (p.scenes || []).forEach((s) => { if (s.src === undefined) s.src = ''; }); });
        if (!S.projects.length) S.projects.push(blankProject());
        if (!S.projects.find((p) => p.id === S.activeId)) S.activeId = S.projects[0].id;
        return;
      }
    } catch (e) { /* korup → blank */ }
  }
  const p = blankProject('Proyek Pertama');
  S = { v: 2, activeId: p.id, projects: [p], wpm: 130 };
}
let saveTimer = null;
function save(now) {
  const run = () => {
    saveTimer = null;
    const p = P(); if (p) p.updatedAt = Date.now();
    const json = JSON.stringify(S);
    try { localStorage.setItem(KEY, json); } catch (e) { memStore = json; }
  };
  if (now) { clearTimeout(saveTimer); run(); } else { clearTimeout(saveTimer); saveTimer = setTimeout(run, 400); }
}
const P = () => S.projects.find((p) => p.id === S.activeId);

/* ---------- AI client ---------- */
async function ai(task, payload = {}) {
  if (!navigator.onLine) throw new Error('Fitur AI butuh internet.');
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 100000);
  let r;
  try { r = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task, ...payload }), signal: ctrl.signal }); }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'AI terlalu lama merespons, coba lagi.' : 'Tidak bisa terhubung ke AI.'); }
  finally { clearTimeout(to); }
  let j = null; try { j = await r.json(); } catch (e) { /* abaikan */ }
  if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || `AI error (${r.status})`);
  return j.data;
}
const metricsLine = (an) => `skor ${an.score}%, ${an.nWords} kata, opini ${an.opinions}, pertanyaan ${an.questions}, jeda ${an.pauses.n}, klise [${an.cliches.join('; ')}], placeholder ${an.placeholders}`;

/* ---------- UI helpers ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast'); $('#toastMsg').textContent = msg;
  t.classList.remove('opacity-0', 'translate-y-3');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('opacity-0', 'translate-y-3'), 2800);
}
function openSheet(title, body, buttons = [], opts = {}) {
  const root = $('#sheetRoot'), sh = $('#sheet');
  sh.innerHTML = `
    <div class="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10 shrink-0">
      <h3 class="text-sm font-bold text-white">${esc(title)}</h3>
      ${opts.locked ? '' : `<button data-sheet-close class="p-1.5 text-slate-400 active:text-white" aria-label="Tutup">${ic('x', 'w-5 h-5')}</button>`}
    </div>
    <div class="scroll px-4 py-3 text-xs space-y-3 flex-1 min-h-0">${body}</div>
    ${buttons.length ? `<div class="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2 shrink-0">${buttons.map((b, i) => `<button data-sheet-btn="${i}" class="${b.cls || 'btn-ghost'}">${esc(b.label)}</button>`).join('')}</div>` : ''}`;
  root.classList.remove('hidden');
  sh._btns = buttons; sh._onClose = opts.onClose; sh._locked = !!opts.locked;
  if (opts.focus) setTimeout(() => { const el = $(opts.focus, sh); el && el.focus(); }, 60);
}
function closeSheet() {
  const sh = $('#sheet'); $('#sheetRoot').classList.add('hidden'); sh._locked = false;
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
/** Layar tunggu untuk panggilan AI panjang */
async function withLoading(msg, fn) {
  openSheet('AI bekerja', `<div class="flex items-center gap-3 py-4 text-sm text-slate-200">${spin('w-5 h-5 text-brand-400')}<span>${esc(msg)}</span></div><p class="text-[11px] text-slate-500">Biasanya 15–45 detik. Jangan tutup aplikasi.</p>`, [], { locked: true });
  try { return await fn(); } finally { closeSheet(); }
}
async function withBtn(el, fn) {
  if (!el || el.disabled) return;
  const html = el.innerHTML; el.disabled = true; el.classList.add('opacity-70');
  el.innerHTML = `${spin('w-3.5 h-3.5')} Memproses…`;
  try { return await fn(); } finally { if (el.isConnected) { el.disabled = false; el.classList.remove('opacity-70'); el.innerHTML = html; } }
}
document.addEventListener('click', (e) => {
  const sh = $('#sheet');
  if (e.target.id === 'sheetRoot') { if (!sh._locked) closeSheet(); return; }
  if (e.target.closest('[data-sheet-close]')) return closeSheet();
  const b = e.target.closest('[data-sheet-btn]');
  if (b) {
    const btn = sh._btns[+b.dataset.sheetBtn];
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
    $('#tab-' + i).className = 'py-2.5 flex flex-col items-center gap-0.5 text-[10px] font-semibold ' + (i === n ? 'text-brand-400' : 'text-slate-500');
  }
  render();
  $('#view-' + n).scrollTop = 0;
}
function render() { [null, render1, render2, render3, render4][mod](); }
const projectBar = () => `<button data-act="projects" class="glass-btn w-full flex items-center justify-between gap-2 px-3.5 py-2 text-left"><span class="min-w-0"><span class="block text-[10px] uppercase tracking-wider text-slate-500 font-bold">Proyek</span><span class="block text-xs font-semibold text-white truncate">${esc(P().title || 'Tanpa judul')}</span></span>${ic('chevron-down', 'w-4 h-4 text-slate-400')}</button>`;

/* ---------- Modul 1: Launchpad ---------- */
function render1() {
  const p = P();
  const an = analyze(p.script, S.wpm);
  const risky = p.assets.filter((a) => assessAsset(a).lvl === 2).length;
  const tile = (act, extra, icon, label, val, sub, col) => `
    <button data-act="${act}" ${extra} class="card p-3.5 text-left active:scale-[.97] transition space-y-1.5">
      <span class="w-8 h-8 rounded-xl ${col} flex items-center justify-center">${ic(icon, 'w-4 h-4')}</span>
      <span class="block text-[11px] text-slate-400 font-semibold">${label}</span>
      <span class="block text-base font-bold text-white leading-tight">${val}</span>
      <span class="block text-[10px] text-slate-500">${sub}</span>
    </button>`;
  const ideas = p.ideas.filter((i) => ideaFilter === 'all' || i.fav);
  $('#view-1').innerHTML = `
  <div class="max-w-5xl mx-auto px-4 space-y-4">
    <div class="relative overflow-hidden rounded-3xl p-5 glass" style="background:linear-gradient(135deg,rgba(124,58,237,.38),rgba(79,70,229,.22) 55%,rgba(6,182,212,.14))">
      <div class="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-brand-500/30 blur-3xl"></div>
      <div class="relative space-y-3">
        <span class="chip bg-white/10 text-brand-300 border border-white/15">${ic('sparkles', 'w-3 h-3 mr-1')} Ditenagai AI</span>
        <h1 class="text-[22px] leading-tight font-extrabold text-white">Dari ide sampai audit,<br>konten YouTube yang orisinal.</h1>
        <p class="text-xs text-slate-300 leading-relaxed">Tulis topik, AI mencarikan 15 sudut pandang, menulis kerangka naskah, merancang storyboard, lalu mereview-nya.</p>
        <div class="space-y-2">
          <input id="topicIn" class="input" value="${esc(p.topic)}" placeholder="Mau bikin video tentang apa?" enterkeyhint="go" autocomplete="off">
          <button data-act="genIdeas" class="btn-primary w-full !py-3 !text-sm" ${busy.ideas ? 'disabled' : ''}>${busy.ideas ? spin() + ' AI mencari ide…' : ic('sparkles', 'w-4 h-4') + ' Cari 15 ide dengan AI'}</button>
        </div>
        <div class="pt-1">${projectBar()}</div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3">
      ${tile('mod', 'data-n="2"', 'file-pen-line', 'Naskah', p.script.trim() ? `${an.nWords} kata` : 'Kosong', p.script.trim() ? `Durasi ${fmtTime(an.totalSec)}` : 'Buat dengan AI', 'bg-brand-500/25 text-brand-300')}
      ${tile('toStoryTile', '', 'clapperboard', 'Storyboard', `${p.scenes.length} scene`, p.scenes.length ? `${p.scenes.filter((s) => s.visual).length} punya visual` : 'Dari naskah', 'bg-indigo-500/25 text-indigo-300')}
      ${tile('mod', 'data-n="3"', 'shield-alert', 'AI Guard', p.script.trim() ? an.score + '%' : '—', p.script.trim() ? `Risiko bot ${an.botRisk}%` : 'Skor orisinalitas', 'bg-emerald-500/25 text-emerald-300')}
      ${tile('mod', 'data-n="4"', 'layers', 'Aset', `${p.assets.length} aset`, risky ? `${risky} berisiko` : 'Audit lisensi', 'bg-amber-500/25 text-amber-300')}
    </div>

    ${(p.ideas.length || busy.ideas) ? `
    <div class="flex items-center gap-2">
      <button data-act="ideaFilter" data-f="all" class="chip ${ideaFilter === 'all' ? 'bg-brand-500/30 text-brand-300' : 'bg-white/5 text-slate-400'} !text-[11px] !px-3 !py-1">Semua ${p.ideas.length}</button>
      <button data-act="ideaFilter" data-f="fav" class="chip ${ideaFilter === 'fav' ? 'bg-amber-500/30 text-amber-300' : 'bg-white/5 text-slate-400'} !text-[11px] !px-3 !py-1">★ Favorit ${p.ideas.filter((i) => i.fav).length}</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      ${busy.ideas ? Array.from({ length: 6 }, () => '<div class="skel h-32"></div>').join('') : ideas.length ? ideas.map((i) => `
      <div class="card p-3.5 flex flex-col justify-between gap-2.5">
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="chip ${BADGE[i.c] || BADGE.brand}">${esc(i.badge)}</span>
            <button data-act="fav" data-id="${i.id}" class="p-1 ${i.fav ? 'text-amber-400' : 'text-slate-500'}" aria-label="Favorit">${ic('star', 'w-4 h-4')}</button>
          </div>
          <h4 class="text-[13px] font-bold text-white leading-snug">${esc(i.title)}</h4>
          <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">${esc(i.desc)}</p>
        </div>
        <div class="pt-2 border-t border-white/10 flex items-center justify-between">
          <span class="text-[10px] text-slate-500 font-medium">${esc(i.type)}</span>
          <button data-act="useIdea" data-id="${i.id}" class="btn-ghost !py-1 !min-h-0 !text-[11px]">${ic('sparkles', 'w-3 h-3')} Tulis naskah</button>
        </div>
      </div>`).join('') : `<p class="text-xs text-slate-500 col-span-full text-center py-8">Belum ada ide favorit. Tap bintang pada kartu ide.</p>`}
    </div>` : ''}
  </div>`;
  $('#topicIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('[data-act=genIdeas]').click(); } });
}

/* ---------- Modul 2: Skrip & Storyboard ---------- */
function render2() {
  const p = P();
  const seg = (k, l, i) => `<button data-act="stab" data-t="${k}" class="flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${scriptTab === k ? 'bg-brand-600/30 text-brand-300 border border-brand-500/40' : 'text-slate-400'}">${ic(i, 'w-3.5 h-3.5')} ${l}</button>`;
  $('#view-2').innerHTML = `
  <div class="max-w-5xl mx-auto px-4 space-y-3">
    ${projectBar()}
    <div class="glass rounded-2xl p-1 flex gap-1">${seg('naskah', 'Naskah', 'file-pen-line')}${seg('story', 'Storyboard', 'clapperboard')}</div>
    ${scriptTab === 'naskah' ? scriptPanel(p) : storyPanel(p)}
  </div>`;
  if (scriptTab === 'naskah') { const ta = $('#scriptInput'); ta.addEventListener('input', () => { P().script = ta.value; save(); updateScriptMeta(); }); updateScriptMeta(); }
}
function scriptPanel(p) {
  return `
    <div class="card p-3 space-y-2.5">
      <div class="flex items-center justify-between gap-2">
        <div>
          <div class="text-xs font-bold text-white">Editor Naskah</div>
          <div id="wc" class="text-[10px] text-slate-400 font-mono"></div>
        </div>
        <div class="flex items-center gap-1.5">
          <div class="flex items-center rounded-xl overflow-hidden" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12)">
            <button data-act="wpm" data-d="-5" class="px-2.5 py-1.5 text-slate-300 active:bg-white/10" aria-label="Pelan">−</button>
            <span id="wpmLbl" class="px-1 text-[11px] font-mono text-cyan-300 w-[58px] text-center">${S.wpm} WPM</span>
            <button data-act="wpm" data-d="5" class="px-2.5 py-1.5 text-slate-300 active:bg-white/10" aria-label="Cepat">+</button>
          </div>
          <button data-act="gen" class="btn-primary !px-3">${ic('sparkles', 'w-3.5 h-3.5')} Tulis AI</button>
        </div>
      </div>
      <div class="flex flex-wrap gap-1.5">
        ${['[Hook: 0-10s]|+Hook', '[Jeda 1.5s]|+Jeda', '[Opini Pribadi]|+Opini', '[Bukti & Sumber]|+Bukti', '[Penutup & Ajak Diskusi]|+Penutup'].map((x) => { const [t, l] = x.split('|'); return `<button data-act="tag" data-tag="${esc(t)}" class="px-2.5 py-1.5 rounded-lg text-[11px] font-mono text-slate-300 active:bg-white/10" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1)">${l}</button>`; }).join('')}
        <button data-act="clean" class="ml-auto px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] font-semibold text-amber-300 flex items-center gap-1">${ic('wand-sparkles', 'w-3 h-3')} Poles AI</button>
      </div>
      <textarea id="scriptInput" class="input min-h-[42dvh] leading-relaxed font-mono !text-[15px] md:!text-xs resize-y" spellcheck="false" placeholder="Ketik naskah di sini, atau tekan “Tulis AI” untuk membuat kerangka dari topik…">${esc(p.script)}</textarea>
      <div id="botWarn" class="rounded-xl p-2.5 text-[11px] flex items-start gap-2"></div>
      <div class="flex gap-2">
        <button data-act="copyScript" class="btn-ghost flex-1">${ic('copy', 'w-3.5 h-3.5')} Salin</button>
        <button data-act="toStory" class="btn-ghost flex-1">${ic('clapperboard', 'w-3.5 h-3.5')} Storyboard</button>
        <button data-act="mod" data-n="3" class="btn-primary flex-1">Guard ${ic('arrow-right', 'w-3.5 h-3.5')}</button>
      </div>
    </div>`;
}
function updateScriptMeta() {
  const an = analyze(P().script, S.wpm);
  const wc = $('#wc'); if (!wc) return;
  wc.textContent = `${an.nWords} kata • ${fmtTime(an.totalSec)} (jeda ${an.pauses.sec.toFixed(1)}s)`;
  $('#wpmLbl').textContent = S.wpm + ' WPM';
  const w = $('#botWarn');
  const bad = an.cliches.length || an.placeholders;
  w.className = 'rounded-xl p-2.5 text-[11px] flex items-start gap-2 ' + (bad ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20');
  w.innerHTML = `${ic(bad ? 'triangle-alert' : 'circle-check', 'w-4 h-4 mt-0.5 shrink-0')}<div>${
    an.cliches.length ? `<b>Frasa klise:</b> “${esc(an.cliches.join('”, “'))}”. ` : ''}${
    an.placeholders ? `<b>${an.placeholders} placeholder {{…}}</b> perlu diisi data / sumber nyata. ` : ''}${
    bad ? '' : (an.nWords ? 'Tidak ada frasa klise bot atau placeholder tersisa.' : 'Naskah kosong.')}</div>`;
}
const SCOL = { Hook: 'from-purple-600/60 to-indigo-700/60', Konflik: 'from-indigo-600/60 to-blue-800/60', Bukti: 'from-cyan-600/50 to-sky-800/60', Analisis: 'from-fuchsia-600/50 to-purple-800/60', Transisi: 'from-slate-600/60 to-slate-800/60', Penutup: 'from-emerald-600/50 to-teal-800/60', Isi: 'from-slate-600/60 to-slate-800/60' };
const SICN = { Hook: 'film', Konflik: 'activity', Bukti: 'file-text', Analisis: 'mic', Transisi: 'clock', Penutup: 'check', Isi: 'image' };
function storyPanel(p) {
  const an = analyze(p.script, S.wpm);
  const end = p.scenes.length ? Math.max(...p.scenes.map((s) => s.end)) : 0;
  const missing = p.scenes.filter((s) => !s.visual).length;
  return `
    <div class="flex items-center justify-between gap-2">
      <div>
        <div class="text-xs font-bold text-white">Timeline & Storyboard</div>
        <div class="text-[10px] text-slate-400 font-mono">${p.scenes.length} scene • ${fmtTime(end)} / naskah ${fmtTime(an.totalSec)}</div>
      </div>
      <div class="flex gap-1.5">
        <button data-act="scenesFromScript" class="btn-ghost !px-2.5">${ic('refresh-cw', 'w-3.5 h-3.5')} Dari naskah</button>
        <button data-act="sceneAdd" class="btn-ghost !px-2.5">${ic('plus', 'w-3.5 h-3.5')}</button>
      </div>
    </div>
    ${p.scenes.length ? `<button data-act="sceneAI" class="btn-primary w-full">${busy.scenes ? spin('w-3.5 h-3.5') + ' AI merancang visual…' : ic('sparkles', 'w-3.5 h-3.5') + (missing ? ` Saran visual AI (${missing} scene kosong)` : ' Buat ulang semua visual dengan AI')}</button>` : ''}
    <div class="space-y-2.5">
      ${p.scenes.length ? p.scenes.map((s, i) => `
      <div class="card p-3 flex gap-3">
        <div class="w-20 h-[72px] rounded-xl bg-gradient-to-br ${SCOL[s.type] || SCOL.Isi} flex flex-col items-center justify-center shrink-0 text-white/90 ring-1 ring-white/10">
          ${ic(SICN[s.type] || 'image', 'w-5 h-5')}
          <span class="mt-1 text-[9px] font-mono bg-black/50 rounded px-1">${fmtTime(s.start)}–${fmtTime(s.end)}</span>
        </div>
        <div class="flex-1 min-w-0 space-y-1">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-bold text-white truncate">${i + 1}. ${esc(s.title)}</span>
            <span class="chip bg-brand-500/20 text-brand-300 shrink-0">${esc(s.type)}</span>
          </div>
          <p class="text-[11px] ${s.visual ? 'text-slate-400' : 'text-slate-600 italic'} leading-snug">${esc(s.visual || 'Visual belum diisi — pakai Saran visual AI atau edit manual.')}</p>
          ${s.audio || s.motion ? `<div class="text-[10px] text-cyan-400 truncate">${ic('volume-2', 'w-3 h-3 inline -mt-0.5')} ${esc(s.audio)}${s.audio && s.motion ? ' • ' : ''}${esc(s.motion)}</div>` : ''}
          <div class="flex items-center gap-1 pt-1">
            <button data-act="sceneMove" data-id="${s.id}" data-d="-1" class="p-1.5 rounded-lg bg-black/25 text-slate-400 ${i === 0 ? 'opacity-30' : ''}" aria-label="Naik">${ic('arrow-up', 'w-3.5 h-3.5')}</button>
            <button data-act="sceneMove" data-id="${s.id}" data-d="1" class="p-1.5 rounded-lg bg-black/25 text-slate-400 ${i === p.scenes.length - 1 ? 'opacity-30' : ''}" aria-label="Turun">${ic('arrow-down', 'w-3.5 h-3.5')}</button>
            <button data-act="sceneEdit" data-id="${s.id}" class="p-1.5 rounded-lg bg-black/25 text-slate-300 ml-auto" aria-label="Edit">${ic('pencil', 'w-3.5 h-3.5')}</button>
            <button data-act="sceneDel" data-id="${s.id}" class="p-1.5 rounded-lg bg-black/25 text-rose-400" aria-label="Hapus">${ic('trash-2', 'w-3.5 h-3.5')}</button>
          </div>
        </div>
      </div>`).join('') : `<div class="card p-6 text-center text-xs text-slate-500">Storyboard kosong. Tekan <b class="text-slate-300">Dari naskah</b> untuk membuat scene dengan durasi hitungan nyata, lalu minta AI merancang visualnya.</div>`}
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
  const bar = (l, v, col, extra = '') => `<div><div class="flex justify-between text-slate-400 mb-1 text-xs"><span>${l}</span><span class="text-white font-mono font-bold">${v}%${extra}</span></div><div class="w-full bg-black/30 h-2 rounded-full overflow-hidden"><div class="${col} h-2 rounded-full transition-all duration-700" style="width:${v}%"></div></div></div>`;
  const risk = an.botRisk < 25 ? ['Rendah', 'bg-emerald-400'] : an.botRisk < 45 ? ['Sedang', 'bg-amber-400'] : ['Tinggi', 'bg-rose-500'];
  const TIPC = { ok: ['text-emerald-400', '✓'], warn: ['text-amber-400', '•'], bad: ['text-rose-400', '!'] };
  pacing.bars = pacingSegments(p.script);
  const maxW = Math.max(1, ...pacing.bars.map((b) => b.w || 0));
  const rv = p.review && p.review.data;
  $('#view-3').innerHTML = `
  <div class="max-w-5xl mx-auto px-4 space-y-3">
    ${projectBar()}
    <div>
      <h2 class="text-base font-bold text-white flex items-center gap-2">${ic('shield-alert', 'w-5 h-5 text-brand-400')} AI Guard & Pacing</h2>
      <p class="text-xs text-slate-400 mt-0.5">Metrik dihitung di perangkat; review kualitatif oleh AI. <span class="text-slate-500">Ini estimasi internal, bukan hasil deteksi resmi YouTube.</span></p>
    </div>
    ${!an.nWords ? `<div class="card p-6 text-center text-xs text-slate-500">Naskah masih kosong. Buat naskah di tab Skrip dulu.</div>` : ''}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div class="card p-4">
        <div class="flex items-center justify-between"><span class="text-xs font-bold text-white uppercase tracking-wider">Skor Orisinalitas</span><span class="text-[10px] text-slate-500">${an.nWords} kata</span></div>
        <div class="my-3 flex items-center justify-center relative">
          <svg viewBox="0 0 128 128" class="w-32 h-32 -rotate-90"><circle cx="64" cy="64" r="52" stroke="rgba(255,255,255,.08)" stroke-width="10" fill="none"/><circle cx="64" cy="64" r="52" stroke="${tone[0]}" stroke-width="10" fill="none" stroke-dasharray="${C}" stroke-dashoffset="${off}" stroke-linecap="round"/></svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center"><span class="text-3xl font-black text-white">${an.score}%</span><span class="text-[10px] font-bold uppercase tracking-wider ${tone[2]}">${tone[1]}</span></div>
        </div>
        <div class="text-[11px] text-slate-400 bg-black/20 p-2.5 rounded-xl border border-white/10 grid grid-cols-3 gap-2 text-center">
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

    <div class="card p-4 space-y-2.5">
      <div class="flex items-center justify-between gap-2">
        <div><h3 class="text-xs font-bold text-white flex items-center gap-1.5">${ic('sparkles', 'w-4 h-4 text-brand-400')} Review Editor AI</h3><p class="text-[11px] text-slate-400">Penilaian kritis atas hook, analisis, bukti, dan klise.</p></div>
        <button data-act="review" class="btn-primary shrink-0" ${busy.review ? 'disabled' : ''}>${busy.review ? spin('w-3.5 h-3.5') + ' Menilai…' : ic('sparkles', 'w-3.5 h-3.5') + (rv ? ' Ulangi' : ' Review')}</button>
      </div>
      ${rv ? `
        <p class="text-[12px] text-slate-200 leading-relaxed">${esc(rv.summary)}</p>
        ${(rv.strengths || []).length ? `<ul class="text-[11px] text-emerald-300 space-y-0.5">${rv.strengths.map((x) => `<li>✓ ${esc(x)}</li>`).join('')}</ul>` : ''}
        ${(rv.issues || []).map((it, n) => `<div class="p-2.5 rounded-xl bg-black/20 border border-white/10 space-y-1">
            ${it.quote ? `<p class="text-[11px] text-slate-400 italic">“${esc(it.quote)}”</p>` : ''}
            <p class="text-[12px] text-amber-300 font-medium">${esc(it.problem)}</p>
            <p class="text-[11px] text-slate-300">${esc(it.fix)}</p>
            ${it.quote && it.fix && P().script.includes(it.quote) ? `<button data-act="applyFix" data-n="${n}" class="btn-ghost !py-1 !min-h-0 !text-[11px]">${ic('check', 'w-3 h-3')} Terapkan perbaikan</button>` : ''}
          </div>`).join('')}
        ${(rv.hook_alternatives || []).length ? `<div class="space-y-1.5"><p class="text-[11px] font-bold text-white">Alternatif hook</p>${rv.hook_alternatives.map((h, n) => `<div class="p-2.5 rounded-xl bg-black/20 border border-white/10 flex items-start gap-2"><p class="flex-1 text-[11px] text-slate-200">${esc(h)}</p><button data-act="useHook" data-n="${n}" class="btn-ghost !py-1 !min-h-0 !text-[11px] shrink-0">Pakai</button></div>`).join('')}</div>` : ''}
        <p class="text-[10px] text-slate-600">Review dibuat ${new Date(p.review.at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}. Verifikasi sendiri sebelum dipakai.</p>` : `<p class="text-[11px] text-slate-500">Belum direview.</p>`}
    </div>

    <div class="card p-4 space-y-2">
      <div class="flex items-center justify-between"><span class="text-xs font-bold text-white uppercase tracking-wider">Tindakan Cepat</span><span class="chip bg-amber-500/20 text-amber-300">${an.tips.filter((t) => t.k !== 'ok').length} saran</span></div>
      ${an.tips.map((t) => `<div class="p-2.5 rounded-xl bg-black/20 border border-white/10 flex items-start gap-2.5"><span class="${TIPC[t.k][0]} font-bold w-3 text-center mt-px">${TIPC[t.k][1]}</span><div class="flex-1 min-w-0"><p class="font-medium text-white text-[12px]">${esc(t.t)}</p><p class="text-[11px] text-slate-400">${esc(t.d)}</p></div>${t.act ? `<button data-act="tipAct" data-a="${esc(t.act)}" class="btn-ghost !py-1 !min-h-0 !text-[11px] shrink-0">Terapkan</button>` : ''}</div>`).join('')}
    </div>

    <div class="card p-4 space-y-3">
      <div class="flex items-center justify-between gap-2">
        <div><h3 class="text-xs font-bold text-white flex items-center gap-1.5">${ic('activity', 'w-4 h-4 text-cyan-400')} Visualizer Ritme Bicara</h3><p class="text-[11px] text-slate-400">Satu batang = satu kalimat; tinggi = panjang kalimat.</p></div>
        <span class="chip bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 !text-[11px]">${S.wpm} WPM</span>
      </div>
      <div id="wave" class="h-24 bg-black/25 rounded-xl p-3 flex items-center gap-[3px] overflow-x-auto border border-white/10">
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
    <div class="flex justify-between"><button data-act="mod" data-n="2" class="btn-ghost">${ic('arrow-left', 'w-3.5 h-3.5')} Skrip</button><button data-act="mod" data-n="4" class="btn-primary">Aset ${ic('arrow-right', 'w-3.5 h-3.5')}</button></div>
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
  <div class="max-w-5xl mx-auto px-4 space-y-3">
    ${projectBar()}
    <div class="flex items-start justify-between gap-2">
      <div>
        <h2 class="text-base font-bold text-white flex items-center gap-2">${ic('layers', 'w-5 h-5 text-brand-400')} Audit Aset</h2>
        <p class="text-xs text-slate-400 mt-0.5">Status dihitung dari sumber, transformasi, durasi, dan riwayat pemakaian.</p>
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
        <div class="flex gap-1.5 pt-1 border-t border-white/10">
          <button data-act="assetEdit" data-id="${a.id}" class="btn-ghost !py-1 !min-h-0 !text-[11px]">${ic('pencil', 'w-3 h-3')} Edit</button>
          <button data-act="assetDel" data-id="${a.id}" class="btn-danger !py-1 !min-h-0 !text-[11px] ml-auto">${ic('trash-2', 'w-3 h-3')}</button>
        </div>
      </div>`; }).join('') : `<div class="card p-6 text-center text-xs text-slate-500 md:col-span-2">Belum ada aset. Tambahkan klip, gambar, atau audio yang akan dipakai.</div>`}
    </div>
    <div class="card p-4 space-y-3" style="border-color:rgba(139,92,246,.4)">
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
  const s = sc || { title: '', type: 'Isi', start: 0, end: 10, visual: '', audio: '', motion: '', src: '' };
  const types = ['Hook', 'Konflik', 'Bukti', 'Analisis', 'Transisi', 'Penutup', 'Isi'];
  openSheet(isNew ? 'Scene baru' : 'Edit scene', `
    <div><label class="label">Judul</label><input id="f_title" class="input" value="${esc(s.title)}" placeholder="Mis. Studi kasus utama"></div>
    <div class="grid grid-cols-3 gap-2">
      <div><label class="label">Tipe</label><select id="f_type" class="input">${types.map((t) => `<option ${t === s.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
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
      if (isNew) p.scenes.push({ id: uid(), src: '', ...data }); else Object.assign(sc, data);
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

/** Tulis naskah via AI; idea (opsional) memberi judul & sudut pandang */
async function writeScript({ topic, title, angle, tone, minutes, notes }) {
  const p = P();
  const d = await withLoading('AI menulis naskah…', () => ai('script', { topic, title, angle, tone, minutes, notes }));
  if (!d || !d.text || d.text.length < 40) throw new Error('AI tidak mengembalikan naskah, coba lagi.');
  p.topic = topic; p.title = title || topic; p.script = d.text; p.review = null;
  p.scenes = scenesFromScript(p.script, S.wpm);
  save(true); scriptTab = 'naskah'; switchModule(2);
  toast('Naskah siap — isi bagian {{…}} dengan data nyata');
  fillScenes(p, false); // visual storyboard menyusul di latar belakang
}
async function fillScenes(p, all) {
  const targets = p.scenes.filter((s) => all || !s.visual);
  if (!targets.length || busy.scenes) return;
  busy.scenes = true; if (mod === 2 && scriptTab === 'story') render();
  try {
    const d = await ai('scenes', { scenes: targets.map((s) => ({ title: s.title, text: s.src })) });
    const arr = Array.isArray(d && d.scenes) ? d.scenes : [];
    targets.forEach((s, i) => { const r = arr[i]; if (r) { s.visual = String(r.visual || '').slice(0, 280); s.audio = String(r.audio || '').slice(0, 100); s.motion = String(r.motion || '').slice(0, 100); } });
    save(true); toast(`Visual AI terisi (${Math.min(arr.length, targets.length)} scene)`);
  } catch (e) { toast('Visual AI gagal: ' + e.message); }
  finally { busy.scenes = false; if (mod === 2 || mod === 1) render(); }
}
function genSheet(preset = {}) {
  const p = P();
  openSheet('Tulis Naskah dengan AI', `
    <p class="text-slate-400 leading-relaxed">AI membuat naskah dari topikmu. Data spesifik sengaja ditandai <code class="text-brand-300 font-mono">{{isi: …}}</code> agar kamu isi dengan sumber nyata, bukan karangan.</p>
    <div><label class="label">Topik</label><input id="g_topic" class="input" value="${esc(preset.topic || p.topic)}" placeholder="Mis. Sejarah Kerajaan Majapahit"></div>
    <div><label class="label">Judul video (opsional)</label><input id="g_title" class="input" value="${esc(preset.title || '')}"></div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div><label class="label">Sudut pandang</label><select id="g_angle" class="input">${opt(ANGLES, preset.angle || 'psychology')}</select></div>
      <div><label class="label">Gaya tutur</label><select id="g_tone" class="input">${opt(TONES, 'investigative')}</select></div>
    </div>
    <div><label class="label">Durasi target</label><select id="g_min" class="input"><option value="3">±3 menit</option><option value="5" selected>±5 menit</option><option value="8">±8 menit</option></select></div>
    <div><label class="label">Arahan tambahan (opsional)</label><textarea id="g_notes" rows="2" class="input" placeholder="Mis. bedah proses & kerja keras di baliknya, bukan promosi; sertakan sisi kritisnya"></textarea></div>`, [
    { label: 'Batal' },
    { label: 'Tulis Naskah', cls: 'btn-primary', fn: () => {
      const topic = val('g_topic').trim(); if (!topic) { toast('Isi topik dulu'); return false; }
      const args = { topic, title: val('g_title').trim(), angle: ANGLES[val('g_angle')], tone: TONES[val('g_tone')], minutes: +val('g_min'), notes: val('g_notes').trim() };
      setTimeout(async () => {
        if (P().script.trim().length > 40 && !(await confirmSheet('Timpa naskah?', 'Naskah dan storyboard saat ini akan diganti.', 'Timpa', true))) return;
        try { await writeScript(args); } catch (e) { toast(e.message); }
      }, 30);
    } }
  ], { focus: '#g_topic' });
}
function projectsSheet() {
  const body = `
    <div class="space-y-1.5">${S.projects.map((p) => `<button data-act="openProject" data-id="${p.id}" class="w-full text-left p-3 rounded-xl border ${p.id === S.activeId ? 'border-brand-500/60 bg-brand-600/15' : 'border-white/10 bg-black/20'} flex items-center justify-between gap-2"><div class="min-w-0"><div class="text-sm font-semibold text-white truncate">${esc(p.title || 'Tanpa judul')}</div><div class="text-[10px] text-slate-500">${wordCount(p.script)} kata • diubah ${new Date(p.updatedAt).toLocaleDateString('id-ID')}</div></div>${p.id === S.activeId ? ic('check', 'w-4 h-4 text-brand-400') : ''}</button>`).join('')}</div>
    <div class="pt-2 border-t border-white/10 space-y-2"><label class="label" for="np_topic">Proyek baru</label><div class="flex gap-2"><input id="np_topic" class="input" placeholder="Topik / judul proyek"><button data-act="newProject" class="btn-primary shrink-0">${ic('plus')} Buat</button></div></div>`;
  openSheet('Proyek', body, []);
}
function menuSheet() {
  const it = (act, icon, label, sub = '') => `<button data-act="${act}" class="w-full flex items-center gap-3 p-3 rounded-xl bg-black/20 border border-white/10 text-left active:bg-white/10"><span class="text-brand-400">${ic(icon, 'w-5 h-5')}</span><span><span class="block text-sm text-white font-medium">${label}</span>${sub ? `<span class="block text-[11px] text-slate-500">${sub}</span>` : ''}</span></button>`;
  openSheet('Menu', `<div class="space-y-1.5">
    ${it('projects', 'folder', 'Proyek', `${S.projects.length} proyek • aktif: ${esc(P().title)}`)}
    ${it('exportAll', 'download', 'Cadangkan semua data', 'File JSON — simpan ke Files / iCloud')}
    ${it('importAll', 'upload', 'Pulihkan dari cadangan', 'Gabungkan proyek dari file JSON')}
    ${it('dlScript', 'file-text', 'Unduh naskah (.txt)')}
    ${it('copyScript', 'copy', 'Salin naskah')}
    ${it('dlAssets', 'layers', 'Ekspor daftar aset (CSV)')}
    ${it('aiStatus', 'sparkles', 'Status AI', 'Cek koneksi Workers AI')}
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
  toStoryTile: () => { scriptTab = 'story'; switchModule(2); },
  projects: () => projectsSheet(),
  menu: () => menuSheet(),
  openProject: (d) => { S.activeId = d.id; save(true); closeSheet(); render(); },
  newProject: () => {
    const t = (val('np_topic') || '').trim(); if (!t) return toast('Isi topik proyek');
    const p = blankProject(t, t); S.projects.unshift(p); S.activeId = p.id; save(true); closeSheet(); switchModule(1); toast('Proyek dibuat');
  },
  genIdeas: async () => {
    const t = (val('topicIn') || '').trim(); if (!t) return toast('Isi topik dulu');
    if (busy.ideas) return;
    const p = P(); p.topic = t; if (!p.script.trim()) p.title = t; save();
    busy.ideas = true; render();
    try {
      const d = await ai('ideas', { topic: t });
      const ideas = normalizeIdeas(d && d.ideas);
      if (!ideas.length) throw new Error('AI tidak mengembalikan ide, coba lagi.');
      p.ideas = ideas; ideaFilter = 'all'; save(); toast(ideas.length + ' ide siap');
    } catch (e) { toast(e.message); }
    finally { busy.ideas = false; if (mod === 1) render(); }
  },
  ideaFilter: (d) => { ideaFilter = d.f; render(); },
  fav: (d) => { const i = P().ideas.find((x) => x.id === d.id); if (i) { i.fav = !i.fav; save(); render(); } },
  useIdea: (d) => {
    const p = P(); const i = p.ideas.find((x) => x.id === d.id); if (!i) return;
    genSheet({ topic: p.topic, title: i.title, angle: i.angle });
  },
  stab: (d) => { scriptTab = d.t; render(); },
  wpm: (d) => { S.wpm = clamp(S.wpm + +d.d, 100, 180); save(); updateScriptMeta(); },
  tag: (d) => {
    const ta = $('#scriptInput'); const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    const pre = s > 0 && v[s - 1] !== '\n' ? '\n' : '';
    ta.value = v.slice(0, s) + pre + d.tag + '\n' + v.slice(e); const pos = s + pre.length + d.tag.length + 1;
    ta.focus(); ta.setSelectionRange(pos, pos); P().script = ta.value; save(); updateScriptMeta(); toast('Tag ' + d.tag + ' disisipkan');
  },
  clean: async (d, el) => {
    const p = P(); if (p.script.trim().length < 30) return toast('Naskah masih terlalu pendek');
    await withBtn(el, async () => {
      try {
        const r = await ai('rewrite', { script: p.script });
        if (!r.text || r.text.length < p.script.length * 0.5) throw new Error('Hasil AI terlalu pendek, naskah tidak diubah.');
        p.script = r.text; p.review = null; save(true);
        if (mod === 2) { const ta = $('#scriptInput'); if (ta) ta.value = r.text; updateScriptMeta(); } else render();
        toast('Naskah dipoles AI');
      } catch (e) { toast(e.message); }
    });
  },
  tipAct: (d, el) => {
    if (d.a === 'clean') return ACT.clean(d, el);
    if (d.a.startsWith('tag:')) { const p = P(); p.script = p.script.replace(/\s*$/, '') + '\n\n' + d.a.slice(4) + '\n'; save(); render(); toast('Tag ditambahkan di akhir naskah — pindahkan ke posisi yang pas'); }
  },
  review: async () => {
    const p = P(); if (p.script.trim().length < 60) return toast('Naskah terlalu pendek untuk direview');
    if (busy.review) return;
    busy.review = true; render();
    try {
      const an = analyze(p.script, S.wpm);
      const data = await ai('review', { script: p.script, metrics: metricsLine(an) });
      if (!data || typeof data.summary !== 'string') throw new Error('Format review tidak valid, coba lagi.');
      p.review = { at: Date.now(), data: { summary: data.summary, strengths: (data.strengths || []).map(String).slice(0, 3), issues: (data.issues || []).slice(0, 5).map((x) => ({ quote: String(x.quote || ''), problem: String(x.problem || ''), fix: String(x.fix || '') })), hook_alternatives: (data.hook_alternatives || []).map(String).slice(0, 3) } };
      save(true); toast('Review selesai');
    } catch (e) { toast(e.message); }
    finally { busy.review = false; if (mod === 3) render(); }
  },
  applyFix: (d) => {
    const p = P(); const it = p.review && p.review.data.issues[+d.n]; if (!it || !it.quote || !p.script.includes(it.quote)) return toast('Kutipan tidak ditemukan di naskah');
    p.script = p.script.replace(it.quote, it.fix); it.quote = ''; save(true); render(); toast('Perbaikan diterapkan');
  },
  useHook: (d) => {
    const p = P(); const h = p.review && p.review.data.hook_alternatives[+d.n]; if (!h) return;
    p.script = replaceHookLine(p.script, h); save(true); render(); toast('Hook diganti');
  },
  gen: () => genSheet(),
  copyScript: async () => { closeSheet(); toast((await copyText(P().script)) ? 'Naskah disalin' : 'Gagal menyalin'); },
  toStory: () => { scriptTab = 'story'; render(); },
  scenesFromScript: async () => {
    const p = P(); if (!p.script.trim()) return toast('Naskah masih kosong');
    if (p.scenes.length && !(await confirmSheet('Buat ulang storyboard?', 'Scene yang ada akan diganti dengan hasil dari naskah.', 'Buat ulang', true))) return;
    p.scenes = scenesFromScript(p.script, S.wpm); save(true); render(); toast(p.scenes.length + ' scene dibuat — minta AI merancang visualnya');
  },
  sceneAI: async () => {
    const p = P(); const missing = p.scenes.some((s) => !s.visual);
    if (!missing && !(await confirmSheet('Buat ulang visual?', 'Semua visual, audio, dan gerak kamera akan ditulis ulang oleh AI.', 'Buat ulang', true))) return;
    fillScenes(p, !missing);
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
  aiStatus: async () => {
    closeSheet();
    try { const r = await fetch('/api/health', { cache: 'no-store' }); const j = await r.json(); toast(j.ai ? 'AI aktif ✓ (Workers AI)' : 'Binding AI belum aktif di Worker'); } catch (e) { toast('Endpoint AI tidak terjangkau'); }
  },
  exportAll: async () => { closeSheet(); await saveFile(`yt-hunter-backup-${new Date().toISOString().slice(0, 10)}.json`, 'application/json', JSON.stringify({ app: 'yt-hunter', v: 2, exportedAt: new Date().toISOString(), data: S }, null, 2)); },
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
    d.projects.forEach((p) => { p.ideas = (p.ideas || []).filter((i) => i.ai); const i = S.projects.findIndex((x) => x.id === p.id); if (i >= 0) S.projects[i] = p; else S.projects.push(p); });
    save(true); render(); toast('Cadangan dipulihkan');
  } catch (err) { toast('File cadangan tidak valid'); }
});

/* ---------- PWA ---------- */
function showUpdate(worker) {
  const bar = $('#updateBar'); bar.classList.remove('hidden'); bar.classList.add('flex');
  $('#btnUpdate').onclick = () => { save(true); worker.postMessage({ type: 'SKIP_WAITING' }); $('#btnUpdate').textContent = 'Memperbarui…'; };
}
function initPWA() {
  addEventListener('online', () => toast('Kembali online')); addEventListener('offline', () => toast('Offline — fitur AI dinonaktifkan sementara'));
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => { const nw = reg.installing; if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(nw); }); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch((e) => { window._swErr = String((e && e.message) || e); });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadController || reloading) return; reloading = true; location.reload(); });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(true); stopPacing(); } });
addEventListener('pagehide', () => save(true));

/* ---------- Init ---------- */
load();
initPWA();
switchModule(1);
