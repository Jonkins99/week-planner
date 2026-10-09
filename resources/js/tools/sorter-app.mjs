// Datei-Aussortierer: Alpine-Komponente `sorter`. Eigenständig neben der Haushalts-App:
// eigene Statistik (`wp-sort-v1`), gemerkte Ordner in IndexedDB `wp-tools`.
//
// Löschen geht nur dort, wo der Browser echten Ordnerzugriff erlaubt (File System Access,
// z. B. Chrome am Rechner und neuere Chrome-Versionen auf Android). Sonst läuft alles im
// Nur-Lese-Modus: die Wisch-Entscheidungen landen in einer Liste zum Nachlöschen.

import {
  CATEGORIES, categorize, skipDir, rankCandidates, keepKey, rankOf, pointsFor, comboFactor, emptyStats, fmtBytes, extOf,
} from './sorter.mjs';
import { idbGet, idbSet } from './idb.mjs';
import { readJson, writeJson } from '../storage.mjs';

const STATS = 'wp-sort-v1';
const KEPT = 'wp-sort-kept-v1';
const UNDO_MS = 20000;
const PRELOAD = 3;

// Dateigriffe, Dateien und Vorschau-URLs bleiben außerhalb von Alpine.
const handles = new Map();
const previews = new Map();
const pending = new Map();

const canPickDir = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
const TEXT_EXT = ['txt', 'md', 'csv', 'json', 'xml', 'html'];

let pdfjs = null;
async function pdfThumb(file) {
  if (!pdfjs) {
    const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    pdfjs = lib;
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await doc.getPage(1);
  const vp0 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.min(2, 640 / vp0.width) });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width);
  c.height = Math.round(vp.height);
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
  const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.82));
  doc.destroy?.();
  return { kind: 'pdf', url: URL.createObjectURL(blob), pages: doc.numPages };
}

async function makePreview(item) {
  if (previews.has(item.id)) return previews.get(item.id);
  const rec = handles.get(item.id);
  const job = (async () => {
    const file = rec.file || (await rec.handle.getFile());
    const ext = extOf(item.name);
    if (item.kind === 'image') {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      try { await img.decode(); } catch { /* manche Formate (HEIC) kann der Browser nicht */ return { kind: 'icon' }; }
      return { kind: 'image', url };
    }
    if (item.kind === 'video') return { kind: 'video', url: URL.createObjectURL(file) };
    if (ext === 'pdf') return pdfThumb(file);
    if (TEXT_EXT.includes(ext)) return { kind: 'text', text: (await file.slice(0, 900).text()).replace(/\s+\n/g, '\n') };
    return { kind: 'icon' };
  })().catch(() => ({ kind: 'icon' }));
  previews.set(item.id, job);
  return job;
}

function dropPreview(id) {
  const p = previews.get(id);
  previews.delete(id);
  p?.then((v) => { if (v?.url) URL.revokeObjectURL(v.url); });
}

const kindOf = (name, mime = '') => {
  const c = categorize(name, '', mime);
  if (c === 'photos' || /^image\//.test(mime) || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp'].includes(extOf(name))) return 'image';
  if (c === 'videos' || /^video\//.test(mime)) return 'video';
  return 'doc';
};

export function registerSorter(Alpine) {
  Alpine.data('sorter', () => ({
    SO_CATS: CATEGORIES,
    soView: 'home',
    soCats: Object.fromEntries(CATEGORIES.map((c) => [c.key, true])),
    soRoots: [],
    soReadonly: !canPickDir(),
    soScan: { files: 0, found: 0, bytes: 0, dir: '', started: 0 },
    soDeck: [],
    soIndex: 0,
    soCurrent: null,
    soNextPreviews: {},
    soStats: emptyStats(),
    soSession: null,
    soHistory: [],
    soPending: [],
    soNow: Date.now(),
    soDrag: null,
    soFloat: [],
    soLevelUp: null,
    soMarked: [],
    soFlying: null,
    soReturning: false,

    init() {
      this.soStats = { ...emptyStats(), ...(readJson(STATS, {}) || {}) };
      idbGet('kv', 'sorter-roots').then((r) => { if (Array.isArray(r)) this.soRoots = r.map((h) => ({ name: h.name, handle: h })); });
      setInterval(() => { if (this.soPending.length) this.soNow = Date.now(); }, 250);
      window.addEventListener('wp-layer-closed', (e) => { if (e.detail === 'sorter') this.soPause(); });
      window.addEventListener('keydown', (e) => {
        if (!this.isOpen('sorter') || this.soView !== 'swipe' || this.layers[this.layers.length - 1] !== 'sorter') return;
        if (e.key === 'ArrowLeft') this.soDecide('delete');
        if (e.key === 'ArrowRight') this.soDecide('keep');
        if (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) this.soUndo();
      });
    },

    soOpen() {
      if (!this.isOpen('sorter')) this.openLayer('sorter');
    },

    soBack() {
      if (this.soView === 'swipe') this.soEnd();
      else if (this.soView === 'scanning') this.soCancelScan();
      else if (this.soView === 'ready' || this.soView === 'done') this.soView = 'home';
      else this.closeLayer('sorter');
    },

    soPause() {
      for (const v of document.querySelectorAll('.so video')) v.pause();
    },

    get soRank() {
      return rankOf(this.soStats.xp);
    },

    get soCatsOn() {
      return CATEGORIES.filter((c) => this.soCats[c.key]).map((c) => c.key);
    },

    soBytes(n) {
      return fmtBytes(n);
    },

    soCatLabel(key) {
      return CATEGORIES.find((c) => c.key === key)?.label || 'Datei';
    },

    soDate(ts) {
      return ts ? new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '–';
    },

    // ---------------------------------------------------------------- Ordner & Scan

    async soAddRoot() {
      try {
        const h = await window.showDirectoryPicker({ id: 'wp-sorter', mode: 'readwrite' });
        if (this.soRoots.some((r) => r.name === h.name)) {
          const same = await Promise.all(this.soRoots.map((r) => r.handle.isSameEntry?.(h)));
          if (same.some(Boolean)) return;
        }
        this.soRoots.push({ name: h.name, handle: h });
        await idbSet('kv', 'sorter-roots', this.soRoots.map((r) => r.handle));
      } catch (e) {
        if (e?.name !== 'AbortError') this.notify('Der Ordner konnte nicht geöffnet werden.', { tone: 'error' });
      }
    },

    async soRemoveRoot(i) {
      this.soRoots.splice(i, 1);
      await idbSet('kv', 'sorter-roots', this.soRoots.map((r) => r.handle));
    },

    soToggleCat(key) {
      this.soCats[key] = !this.soCats[key];
      if (!this.soCatsOn.length) this.soCats[key] = true;
    },

    async soStart() {
      if (this.soReadonly) return;
      if (!this.soRoots.length) { await this.soAddRoot(); if (!this.soRoots.length) return; }
      // Zugriff bestätigen lassen, solange die Berührung noch frisch ist.
      for (const r of this.soRoots) {
        let st = await r.handle.queryPermission?.({ mode: 'readwrite' });
        if (st !== 'granted') st = await r.handle.requestPermission?.({ mode: 'readwrite' });
        if (st && st !== 'granted') { this.notify(`Kein Zugriff auf „${r.name}".`, { tone: 'error' }); return; }
      }
      this.soResetDeck();
      this.soView = 'scanning';
      this.soScan = { files: 0, found: 0, bytes: 0, dir: '', started: Date.now() };
      const cats = new Set(this.soCatsOn);
      const found = [];
      const queue = [];
      const work = async (entry) => {
        try {
          const file = await entry.handle.getFile();
          const category = categorize(entry.name, entry.path, file.type);
          if (!category || !cats.has(category)) return;
          const id = `${found.length}-${Math.random().toString(36).slice(2, 7)}`;
          handles.set(id, { handle: entry.handle, dir: entry.dir });
          found.push({ id, name: entry.name, path: entry.path, size: file.size, modified: file.lastModified, type: file.type, category, kind: kindOf(entry.name, file.type) });
          this.soScan.found = found.length;
          this.soScan.bytes += file.size;
        } catch { /* unlesbar, übergehen */ }
      };
      const walk = async (dir, path) => {
        this.soScan.dir = path;
        for await (const [name, h] of dir.entries()) {
          if (this.soView !== 'scanning') return;
          if (h.kind === 'directory') {
            if (!skipDir(name, path)) await walk(h, `${path}/${name}`);
            continue;
          }
          this.soScan.files++;
          // Schneller Vorfilter über den Namen: getFile() nur für mögliche Kandidaten.
          const guess = categorize(name, path);
          if (guess && !cats.has(guess) && !(guess === 'photos' && cats.has('screenshots')) && !(guess === 'videos' && cats.has('screenshots'))) continue;
          if (!guess) continue;
          queue.push(work({ name, handle: h, dir, path }));
          if (queue.length >= 16) await Promise.all(queue.splice(0));
        }
      };
      try {
        for (const r of this.soRoots) await walk(r.handle, r.name);
        await Promise.all(queue);
      } catch (e) {
        this.notify(e?.message || 'Der Scan wurde unterbrochen.', { tone: 'error' });
      }
      if (this.soView !== 'scanning') return;
      this.soFinishScan(found);
    },

    soCancelScan() {
      this.soView = 'home';
    },

    // Nur-Lese-Modus: Dateien über den Auswahldialog (Ordner oder einzelne Dateien).
    soPickFiles(ev) {
      const list = [...(ev.target.files || [])];
      ev.target.value = '';
      if (!list.length) return;
      this.soResetDeck();
      const cats = new Set(this.soCatsOn);
      const found = [];
      for (const file of list) {
        const rel = file.webkitRelativePath || file.name;
        const path = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
        const category = categorize(file.name, path, file.type);
        if (!category || !cats.has(category)) continue;
        const id = `${found.length}-${Math.random().toString(36).slice(2, 7)}`;
        handles.set(id, { file });
        found.push({ id, name: file.name, path, size: file.size, modified: file.lastModified, type: file.type, category, kind: kindOf(file.name, file.type) });
      }
      this.soScan = { files: list.length, found: found.length, bytes: found.reduce((n, f) => n + f.size, 0), dir: '', started: Date.now() };
      this.soFinishScan(found);
    },

    soFinishScan(found) {
      const kept = readJson(KEPT, {}) || {};
      this.soDeck = rankCandidates(found, kept);
      this.soIndex = 0;
      this.soMarked = [];
      this.soView = this.soDeck.length ? 'ready' : 'empty';
    },

    soResetDeck() {
      for (const id of previews.keys()) dropPreview(id);
      handles.clear();
      this.soDeck = [];
      this.soIndex = 0;
      this.soCurrent = null;
      this.soHistory = [];
    },

    get soDeckBytes() {
      return this.soDeck.reduce((n, f) => n + f.size, 0);
    },

    get soDeckByCat() {
      const out = {};
      for (const f of this.soDeck) out[f.category] = (out[f.category] || 0) + 1;
      return CATEGORIES.filter((c) => out[c.key]).map((c) => ({ ...c, n: out[c.key] }));
    },

    // ---------------------------------------------------------------- Wischen

    soBegin() {
      this.soSession = { start: Date.now(), xp: 0, freed: 0, deleted: 0, kept: 0, combo: 0, bestCombo: 0, lastAt: 0, rankBefore: this.soRank.level };
      this.soStats.sessions++;
      this.soStats.firstAt ||= Date.now();
      this.soSave();
      this.soView = 'swipe';
      this.soShow();
    },

    get soCard() {
      return this.soDeck[this.soIndex] || null;
    },

    get soUpcoming() {
      return this.soDeck.slice(this.soIndex + 1, this.soIndex + 3);
    },

    async soShow() {
      const item = this.soCard;
      if (!item) { this.soEnd(); return; }
      this.soCurrent = { id: item.id, preview: null };
      const p = await makePreview(item);
      if (this.soCurrent?.id === item.id) this.soCurrent = { id: item.id, preview: p };
      // Die nächsten Karten schon vorbereiten, damit das Wischen nie wartet.
      for (const next of this.soDeck.slice(this.soIndex + 1, this.soIndex + 1 + PRELOAD)) {
        makePreview(next).then((pv) => { this.soNextPreviews = { ...this.soNextPreviews, [next.id]: pv }; });
      }
      // Weit hinter uns liegende Vorschauen freigeben.
      const old = this.soDeck[this.soIndex - 6];
      if (old && !pending.has(old.id)) dropPreview(old.id);
    },

    soPreviewOf(item) {
      if (!item) return null;
      if (this.soCurrent?.id === item.id) return this.soCurrent.preview;
      return this.soNextPreviews[item.id] || null;
    },

    soDragStart(ev) {
      if (!this.soCard || this.soFlying) return;
      try { ev.currentTarget.setPointerCapture?.(ev.pointerId); } catch { /* egal */ }
      this.soDrag = { x0: ev.clientX, y0: ev.clientY, dx: 0, dy: 0, t: performance.now(), vx: 0, lastX: ev.clientX, lastT: performance.now(), w: ev.currentTarget.offsetWidth };
    },

    soDragMove(ev) {
      const d = this.soDrag;
      if (!d) return;
      const now = performance.now();
      d.vx = (ev.clientX - d.lastX) / Math.max(1, now - d.lastT);
      d.lastX = ev.clientX;
      d.lastT = now;
      d.dx = ev.clientX - d.x0;
      d.dy = ev.clientY - d.y0;
    },

    soDragEnd() {
      const d = this.soDrag;
      if (!d) return;
      this.soDrag = null;
      const far = Math.abs(d.dx) > d.w * 0.28;
      const fling = Math.abs(d.vx) > 0.55 && Math.abs(d.dx) > 30;
      if (far || fling) this.soDecide(d.dx < 0 ? 'delete' : 'keep', { fromX: d.dx, fromY: d.dy });
    },

    get soCardStyle() {
      const d = this.soDrag;
      if (!d) return '';
      return `transform: translate(${d.dx}px, ${d.dy * 0.35}px) rotate(${d.dx * 0.05}deg); transition: none;`;
    },

    get soLean() {
      const d = this.soDrag;
      if (!d) return 0;
      return Math.max(-1, Math.min(1, d.dx / (d.w * 0.28)));
    },

    soDecide(decision, { fromX = 0, fromY = 0 } = {}) {
      const item = this.soCard;
      if (!item || this.soFlying || !this.soSession) return;
      const s = this.soSession;
      const now = Date.now();
      s.combo = now - s.lastAt < 4000 ? s.combo + 1 : 1;
      s.lastAt = now;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      const pts = pointsFor(decision, item.size, s.combo);
      s.xp += pts;
      this.soStats.xp += pts;
      this.soStats.swipes++;
      this.soStats.bestCombo = Math.max(this.soStats.bestCombo, s.combo);
      this.soStats.lastAt = now;
      const entry = { id: item.id, index: this.soIndex, decision, pts, at: now };
      if (decision === 'keep') {
        s.kept++;
        this.soStats.kept++;
        const kept = readJson(KEPT, {}) || {};
        kept[keepKey(item)] = now;
        writeJson(KEPT, kept);
      } else {
        s.deleted++;
        s.freed += item.size;
        if (this.soReadonly) this.soMarked.push(item);
        else this.soQueueDelete(item);
      }
      this.soHistory.push(entry);
      this.soPop(decision === 'delete' ? `+${pts} · ${fmtBytes(item.size)}` : `+${pts}`, decision);
      this.soFlying = { id: item.id, dir: decision === 'delete' ? -1 : 1, x: fromX, y: fromY };
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      setTimeout(() => {
        this.soFlying = null;
        this.soIndex++;
        this.soShow();
      }, reduce ? 60 : 260);
      this.soCheckLevel();
      this.soSave();
    },

    soPop(text, kind) {
      const id = Math.random().toString(36).slice(2, 8);
      this.soFloat.push({ id, text, kind });
      setTimeout(() => { this.soFloat = this.soFloat.filter((f) => f.id !== id); }, 1100);
    },

    soCheckLevel() {
      const r = this.soRank;
      if (this.soSession && r.level > (this.soSession.rankShown || this.soSession.rankBefore)) {
        this.soSession.rankShown = r.level;
        this.soLevelUp = r;
        setTimeout(() => { this.soLevelUp = null; }, 2600);
      }
    },

    get soComboFactor() {
      return comboFactor(this.soSession?.combo || 0);
    },

    // ---------------------------------------------------------------- Löschen mit Gnadenfrist

    soQueueDelete(item) {
      const deadline = Date.now() + UNDO_MS;
      const timer = setTimeout(() => this.soReallyDelete(item.id), UNDO_MS);
      pending.set(item.id, { item, timer });
      this.soPending.push({ id: item.id, name: item.name, size: item.size, deadline });
    },

    async soReallyDelete(id) {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      this.soPending = this.soPending.filter((x) => x.id !== id);
      const rec = handles.get(id);
      try {
        await rec.dir.removeEntry(p.item.name);
        const st = this.soStats;
        st.freed += p.item.size;
        st.deleted++;
        st.byCategory[p.item.category] = (st.byCategory[p.item.category] || 0) + p.item.size;
        if (!st.biggest || p.item.size > st.biggest.size) st.biggest = { name: p.item.name, size: p.item.size };
        const h = this.soHistory.find((x) => x.id === id);
        if (h) h.done = true;
        this.soSave();
      } catch (e) {
        this.notify(`„${p.item.name}" ließ sich nicht löschen${e?.name === 'NotAllowedError' ? ' (kein Schreibzugriff)' : ''}.`, { tone: 'error' });
        if (this.soSession) this.soSession.freed -= p.item.size;
      }
      dropPreview(id);
    },

    soLeft(p) {
      return Math.max(0, Math.ceil((p.deadline - this.soNow) / 1000));
    },

    get soLastPending() {
      return this.soPending[this.soPending.length - 1] || null;
    },

    get soCanUndo() {
      const h = this.soHistory[this.soHistory.length - 1];
      return !!h && !h.done && !this.soFlying;
    },

    soUndo() {
      const h = this.soHistory[this.soHistory.length - 1];
      if (!h || h.done || this.soFlying) return;
      this.soHistory.pop();
      const item = this.soDeck[h.index];
      const s = this.soSession;
      if (h.decision === 'delete') {
        const p = pending.get(h.id);
        if (p) { clearTimeout(p.timer); pending.delete(h.id); }
        this.soPending = this.soPending.filter((x) => x.id !== h.id);
        this.soMarked = this.soMarked.filter((x) => x.id !== h.id);
        if (s) { s.deleted--; s.freed -= item.size; }
      } else {
        const kept = readJson(KEPT, {}) || {};
        delete kept[keepKey(item)];
        writeJson(KEPT, kept);
        if (s) s.kept--;
        this.soStats.kept--;
      }
      if (s) { s.xp -= h.pts; s.combo = 0; }
      this.soStats.xp = Math.max(0, this.soStats.xp - h.pts);
      this.soStats.swipes--;
      this.soIndex = h.index;
      if (this.soView !== 'swipe') this.soView = 'swipe';
      this.soReturning = true;
      setTimeout(() => { this.soReturning = false; }, 400);
      this.soShow();
      this.soSave();
    },

    soUndoPending(id) {
      const h = this.soHistory[this.soHistory.length - 1];
      if (h?.id === id) { this.soUndo(); return; }
      // Ältere Löschung zurücknehmen: Karte wandert ans Ende des Stapels.
      const p = pending.get(id);
      if (!p) return;
      clearTimeout(p.timer);
      pending.delete(id);
      this.soPending = this.soPending.filter((x) => x.id !== id);
      this.soHistory = this.soHistory.filter((x) => x.id !== id);
      if (this.soSession) { this.soSession.deleted--; this.soSession.freed -= p.item.size; }
      this.soDeck.push(p.item);
      this.notify(`„${p.item.name}" bleibt – kommt am Ende noch einmal`, { tone: 'ok' });
    },

    soEnd() {
      const s = this.soSession;
      if (s) this.soStats.bestSession = Math.max(this.soStats.bestSession, s.freed);
      this.soSave();
      this.soView = 'done';
    },

    soSave() {
      writeJson(STATS, this.soStats);
    },

    get soCategoryStats() {
      const total = Object.values(this.soStats.byCategory).reduce((a, b) => a + b, 0) || 1;
      return CATEGORIES.map((c) => ({ ...c, bytes: this.soStats.byCategory[c.key] || 0, share: (this.soStats.byCategory[c.key] || 0) / total }));
    },

    soMarkedText() {
      return this.soMarked.map((f) => `${f.path ? `${f.path}/` : ''}${f.name} (${fmtBytes(f.size)})`).join('\n');
    },

    async soCopyMarked() {
      try { await navigator.clipboard.writeText(this.soMarkedText()); this.notify('Liste kopiert', { tone: 'ok' }); } catch { this.notify('Kopieren ging nicht.', { tone: 'error' }); }
    },
  }));
}
