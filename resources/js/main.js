import Alpine from 'alpinejs';

import { iconSvg } from './icons.mjs';
import {
  MEALS, PEOPLE, slotsOf, getDay, addEntry, updateEntry, removeEntry, moveEntry, duplicateEntry, findEntry,
  addExtraSlot, renameExtraSlot, removeExtraSlot, newRecipe, clampRating, averageRating, sortRecipes,
  splitLines, usageOf, historyTitles, unlinkRecipe, sanitizeState,
} from './model.mjs';
import { isoDate, mondayOf, addDays, weekDays, isoWeek, rangeLabel, yearOfWeek, WEEKDAYS, WEEKDAYS_SHORT, dayMonth, weekdayIndex } from './dates.mjs';
import { search, normalize } from './search.mjs';
import { weekText } from './whatsapp.mjs';
import { videoEmbed, hostLabel, normalizeUrl, findVideoUrl } from './video.mjs';
import { generateJson, QuotaBook, normalizeKeys, keyTag, GEMINI_MODELS } from './gemini.mjs';
import { SYSTEM, SCHEMA, buildPrompt, sanitizeImport, acceptImport, importModels, IMPORT_MODEL } from './recipe-ai.mjs';
import { createDrag } from './drag.mjs';
import { isUnlocked, checkPassword, rememberUnlock } from './auth.mjs';
import { buildBackupZip, readBackupFile, backupName } from './backup.mjs';
import { uploadToDrive } from './drive.mjs';
import { PLACES, MAINS, placeOf, isBrick, addPantryItem, pantryTree } from './pantry.mjs';
import { BRICK_SYSTEM, brickSchema, brickPrompt, readBrickMeals, brickModels } from './pantry-ai.mjs';
import {
  DEPTS, allStores, storeById, storeByName, addStore, removeStore, addItem, setDept, groupItems,
  withDeptHeads, suggestProducts, keyOf,
} from './shopping.mjs';
import {
  CLASSIFY_SYSTEM, CLASSIFY_SCHEMA, classifyPrompt, readClassification, voiceSystem, voiceSchema, readVoice, shopModels,
} from './shopping-ai.mjs';
import { loadData, saveData, flushData, readJson, writeJson, UI_KEY, GEMINI_KEY, QUOTA_KEY } from './storage.mjs';

const TABS = [
  { key: 'plan', label: 'Wochenplan', icon: 'plan' },
  { key: 'shop', label: 'Einkauf', icon: 'shop' },
  { key: 'recipes', label: 'Rezepte', icon: 'recipes' },
  { key: 'pantry', label: 'Vorrat', icon: 'pantry' },
];

const EXTRA_PRESETS = ['Snack', 'Kaffee & Kuchen', 'Vorbereitung', 'Spätmahlzeit', 'Gäste'];

const quota = new QuotaBook({ load: () => readJson(QUOTA_KEY, {}), save: (v) => writeJson(QUOTA_KEY, v) });

const modelLabel = (id) => GEMINI_MODELS.find((m) => m.id === id)?.label || id;

function maskKey(k) {
  const s = String(k || '');
  return s.length <= 10 ? '••••' : `${s.slice(0, 4)}…${s.slice(-4)}`;
}

// Erst der synchrone Weg (behält die Nutzer-Geste, klappt auch in Desktop-Browsern, die
// writeText ohne Fokus oder Berechtigung ablehnen), dann die Clipboard-API.
function copyLegacy(text) {
  const ta = Object.assign(document.createElement('textarea'), { value: text });
  ta.setAttribute('readonly', '');
  Object.assign(ta.style, { position: 'fixed', top: '0', left: '0', opacity: '0', pointerEvents: 'none' });
  document.body.appendChild(ta);
  ta.focus({ preventScroll: true });
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

async function copyText(text) {
  if (copyLegacy(text)) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error('copy');
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

const DRIVE_KEY = 'wp-drive-v1';

const TAB_ORDER = ['plan', 'shop', 'recipes', 'pantry'];

// Ansichtswechsel mit View Transition API; ohne Unterstützung einfach direkt.
function viewTransition(update, dir = 'none') {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce) { update(); return; }
  document.documentElement.dataset.vt = dir;
  const t = document.startViewTransition(() => {
    update();
    return new Promise((resolve) => Alpine.nextTick(resolve));
  });
  // Folgt direkt ein zweiter Wechsel, wird der erste übersprungen: das ist kein Fehler.
  t.ready.catch(() => {});
  t.finished.catch(() => {}).finally(() => { delete document.documentElement.dataset.vt; });
}

// Langes Drücken (Touch oder Maus). Der darauffolgende Klick wird geschluckt.
Alpine.directive('longpress', (el, { expression }, { evaluateLater, cleanup }) => {
  const run = evaluateLater(expression);
  let timer = null;
  let start = null;
  let fired = false;
  const clear = () => { clearTimeout(timer); timer = null; };
  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('[data-no-longpress]')) return;
    fired = false;
    start = { x: e.clientX, y: e.clientY };
    clear();
    timer = setTimeout(() => {
      fired = true;
      navigator.vibrate?.(12);
      run();
    }, 480);
  };
  const move = (e) => { if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) clear(); };
  const click = (e) => { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } };
  const ctx = (e) => e.preventDefault();
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move, { passive: true });
  el.addEventListener('pointerup', clear);
  el.addEventListener('pointercancel', clear);
  el.addEventListener('pointerleave', clear);
  el.addEventListener('click', click, true);
  el.addEventListener('contextmenu', ctx);
  cleanup(() => {
    clear();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', clear);
    el.removeEventListener('pointercancel', clear);
    el.removeEventListener('pointerleave', clear);
    el.removeEventListener('click', click, true);
    el.removeEventListener('contextmenu', ctx);
  });
});

// Waagerechte Leisten: Mausrad und Ziehen mit der Maus scrollen seitwärts (Touch kann das von selbst).
Alpine.directive('hscroll', (el) => {
  el.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, { passive: false });
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, left: el.scrollLeft, moved: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 4) drag.moved = true;
    if (drag.moved) el.scrollLeft = drag.left - dx;
  });
  window.addEventListener('pointerup', () => { setTimeout(() => { drag = null; }, 0); });
  el.addEventListener('click', (e) => { if (drag?.moved) { e.preventDefault(); e.stopPropagation(); } }, true);
});

Alpine.directive('icon', (el, { expression, modifiers }, { effect, evaluateLater }) => {
  const get = evaluateLater(expression);
  effect(() => get((name) => { el.innerHTML = iconSvg(name, { fill: modifiers.includes('fill') }); }));
});

Alpine.data('app', () => ({
  ready: false,
  db: null,
  TABS,
  MEALS,
  WEEKDAYS,
  WEEKDAYS_SHORT,
  EXTRA_PRESETS,
  tab: 'plan',
  today: isoDate(),
  layers: [],

  // Wochenplan
  monday: mondayOf(isoDate()),

  // Rezepte
  recipeQuery: '',
  recipeSort: 'rating',
  detailId: null,
  checked: {},

  // Overlays
  menu: null,
  toast: null,
  entry: null,
  entryActive: -1,
  picker: null,
  slotForm: null,
  confirmBox: null,
  editor: null,
  settings: { keys: [], newKey: '', reveal: false, testing: false, testResult: '', blocks: [] },
  copySheet: null,
  locked: false,
  auth: { pw: '', error: '', busy: false },
  backup: { busy: false, clientId: '', status: '' },

  // Vorrat
  PLACES,
  MAINS,
  pantryQuery: '',
  pantryPlace: 'freezer/bricks/component',
  pantryInput: '',
  pantryEdit: null,
  bricks: null,

  // Einkauf
  DEPTS,
  shopInput: '',
  shopStore: null,
  shopCollapsed: {},
  shopUndo: null,
  shopEdit: null,
  storeForm: null,
  shopFocus: false,
  rec: { state: 'idle', seconds: 0, text: '' },

  async init() {
    this.locked = !isUnlocked();
    const { state } = await loadData();
    Alpine.store('db', state);
    this.db = Alpine.store('db');
    this.restoreUi();
    const ask = new URLSearchParams(location.search).get('tab');
    if (TABS.some((t) => t.key === ask)) this.tab = ask;
    this.settings.keys = normalizeKeys(readJson(GEMINI_KEY, {})?.keys || []);
    this.backup.clientId = readJson(DRIVE_KEY, {})?.clientId || '';

    history.replaceState({ wp: 0 }, '');
    window.addEventListener('popstate', (e) => {
      if (this._popping > 0) {
        this._popping--;
        if (!this._popping) this._pushQueue.splice(0).forEach((fn) => fn());
        return;
      }
      const depth = e.state?.wp ?? 0;
      if (this.layers.length > depth) this.dropLayers(this.layers.length - depth);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.today = isoDate();
      else { this.persistUi(); flushData(this.db); }
    });
    window.addEventListener('pagehide', () => { this.persistUi(); flushData(this.db); });

    this.ready = true;
    this.$nextTick(() => {
      this.setupDrag();
      this.restoreScroll();
      if (!this._restoredScroll && this.monday === mondayOf(this.today)) this.scrollToToday(false);
    });
    for (const key of ['tab', 'monday', 'recipeQuery', 'recipeSort', 'detailId', 'shopStore', 'pantryPlace']) this.$watch(key, () => this.persistUi());
    this.$watch('shopCollapsed', () => this.persistUi());
    this.classifyMissing();
  },

  // ------------------------------------------------------------ Zustand je Reiter

  restoreUi() {
    const ui = readJson(UI_KEY, null);
    if (!ui) return;
    const fresh = Date.now() - (ui.at || 0) < 6 * 3600000;
    if (TABS.some((t) => t.key === ui.tab)) this.tab = ui.tab;
    if (fresh && /^\d{4}-\d{2}-\d{2}$/.test(ui.monday || '')) this.monday = ui.monday;
    this.recipeQuery = ui.recipeQuery || '';
    this.recipeSort = ui.recipeSort === 'alpha' ? 'alpha' : 'rating';
    if (ui.detailId && this.db.recipes.some((r) => r.id === ui.detailId)) this.detailId = ui.detailId;
    if (ui.shopStore && storeById(this.db.shopping, ui.shopStore)) this.shopStore = ui.shopStore;
    this.shopCollapsed = ui.shopCollapsed && typeof ui.shopCollapsed === 'object' ? ui.shopCollapsed : {};
    if (PLACES.some((p) => p.key === ui.pantryPlace)) this.pantryPlace = ui.pantryPlace;
    this._scroll = fresh ? ui.scroll || {} : {};
  },

  persistUi() {
    const scroll = {};
    document.querySelectorAll('[data-scroll-key]').forEach((el) => { scroll[el.dataset.scrollKey] = Math.round(el.scrollTop); });
    writeJson(UI_KEY, {
      at: Date.now(), tab: this.tab, monday: this.monday, recipeQuery: this.recipeQuery,
      recipeSort: this.recipeSort, detailId: this.detailId, shopStore: this.shopStore,
      shopCollapsed: this.shopCollapsed, pantryPlace: this.pantryPlace, scroll,
    });
  },

  restoreScroll() {
    const s = this._scroll || {};
    let any = false;
    document.querySelectorAll('[data-scroll-key]').forEach((el) => {
      const v = s[el.dataset.scrollKey];
      if (v) { el.scrollTop = v; any = true; }
    });
    this._restoredScroll = any && !!s.plan;
  },

  setTab(key) {
    if (this.tab === key) {
      // Zweiter Tipp auf den aktiven Reiter: zurück an den Anfang.
      if (key === 'recipes' && this.detailId) { this.closeDetail(); return; }
      if (key === 'plan') { this.goWeek(0); return; }
      const sc = document.querySelector(`[data-scroll-key="${key}"]`);
      sc?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    this.closeMenu();
    const dir = TAB_ORDER.indexOf(key) > TAB_ORDER.indexOf(this.tab) ? 'forward' : 'back';
    viewTransition(() => { this.tab = key; }, dir);
  },

  // ------------------------------------------------------------ Ebenen & Zurück-Taste

  // Jede Ebene ist ein Verlaufseintrag, damit die Zurück-Taste von Android sie schließt.
  // history.go() arbeitet asynchron: Wird direkt danach eine neue Ebene geöffnet, wartet
  // deren pushState auf das zugehörige popstate, sonst würde der Rücksprung sie gleich
  // wieder entfernen.
  _popping: 0,
  _pushQueue: [],

  openLayer(name) {
    this.layers.push(name);
    const depth = this.layers.length;
    const push = () => history.pushState({ wp: depth }, '');
    if (this._popping > 0) this._pushQueue.push(push);
    else push();
  },

  isOpen(name) {
    return this.layers.includes(name);
  },

  closeLayer(name) {
    const i = this.layers.lastIndexOf(name);
    if (i < 0) return;
    const n = this.layers.length - i;
    this.dropLayers(n);
    this._popping++;
    clearTimeout(this._popTimer);
    this._popTimer = setTimeout(() => {
      this._popping = 0;
      this._pushQueue.splice(0).forEach((fn) => fn());
    }, 800);
    history.go(-n);
  },

  dropLayers(n) {
    const removed = this.layers.splice(this.layers.length - n, n);
    for (const name of removed) {
      if (name === 'menu') this.menu = null;
      if (name === 'entry') this.entry = null;
      if (name === 'picker') this.picker = null;
      if (name === 'slot') this.slotForm = null;
      if (name === 'editor') this.editor = null;
      if (name === 'detail') this.detailId = null;
      if (name === 'confirm') { this.confirmBox?.resolve(false); this.confirmBox = null; }
      if (name === 'copy') this.copySheet = null;
      if (name === 'item') this.shopEdit = null;
      if (name === 'store') this.storeForm = null;
      if (name === 'pantry-item') this.pantryEdit = null;
      if (name === 'bricks') this.bricks = null;
    }
  },

  // ------------------------------------------------------------ Daten

  commit() {
    saveData(this.db);
  },

  snapshot() {
    return JSON.stringify(this.db);
  },

  restore(snap) {
    const s = sanitizeState(JSON.parse(snap));
    this.db.recipes = s.recipes;
    this.db.plan = s.plan;
    this.db.shopping = s.shopping;
    this.db.pantry = s.pantry;
    this.commit();
  },

  get recipesById() {
    const map = {};
    for (const r of this.db?.recipes || []) map[r.id] = r;
    return map;
  },

  titleOf(e) {
    return (e.recipeId && this.recipesById[e.recipeId]?.title) || e.title;
  },

  // ------------------------------------------------------------ Meldungen

  notify(text, { undo = null, tone = 'info', ms = 3800 } = {}) {
    clearTimeout(this._toastTimer);
    this.toast = { text, undo, tone, id: Date.now() };
    this._toastTimer = setTimeout(() => { this.toast = null; }, undo ? 5200 : ms);
  },

  undoToast() {
    const t = this.toast;
    if (!t?.undo) return;
    this.restore(t.undo);
    this.toast = null;
    this.notify('Rückgängig gemacht');
  },

  withUndo(label, fn) {
    const snap = this.snapshot();
    const out = fn();
    this.commit();
    this.notify(label, { undo: snap });
    return out;
  },

  // ------------------------------------------------------------ Kontextmenü

  openMenu(ev, items) {
    const r = ev.currentTarget.getBoundingClientRect();
    const width = 236;
    const est = items.length * 48 + 16;
    const below = r.bottom + est + 12 < window.innerHeight - 80;
    this.menu = {
      items,
      left: Math.max(12, Math.min(r.right - width, window.innerWidth - width - 12)),
      top: below ? r.bottom + 6 : Math.max(12, r.top - est - 6),
      origin: below ? 'top right' : 'bottom right',
    };
    if (!this.isOpen('menu')) this.openLayer('menu');
  },

  closeMenu() {
    if (this.isOpen('menu')) this.closeLayer('menu');
  },

  runMenu(item) {
    this.closeMenu();
    setTimeout(() => item.action(), 10);
  },

  // ------------------------------------------------------------ Bestätigung

  confirm(title, text, ok = 'Löschen') {
    return new Promise((resolve) => {
      this.confirmBox = { title, text, ok, resolve };
      this.openLayer('confirm');
    });
  },

  answerConfirm(yes) {
    const box = this.confirmBox;
    if (!box) return;
    box.resolve(yes);
    box.resolve = () => {};
    this.closeLayer('confirm');
  },

  // ------------------------------------------------------------ Wochenplan

  get days() {
    return weekDays(this.monday);
  },

  get weekNo() {
    return isoWeek(this.monday);
  },

  get weekRange() {
    return `${rangeLabel(this.monday)} ${yearOfWeek(this.monday)}`;
  },

  get isCurrentWeek() {
    return this.monday === mondayOf(this.today);
  },

  get weekDistance() {
    const diff = Math.round((new Date(this.monday) - new Date(mondayOf(this.today))) / 604800000);
    if (diff === 0) return 'Diese Woche';
    if (diff === 1) return 'Nächste Woche';
    if (diff === -1) return 'Letzte Woche';
    return diff > 0 ? `In ${diff} Wochen` : `Vor ${-diff} Wochen`;
  },

  get weekCount() {
    let n = 0;
    if (!this.db) return n;
    for (const iso of this.days) for (const list of Object.values(this.db.plan[iso]?.slots || {})) n += list.length;
    return n;
  },

  shiftWeek(dir) {
    this.monday = addDays(this.monday, dir * 7);
    this.$nextTick(() => document.querySelector('[data-scroll-key="plan"]')?.scrollTo({ top: 0 }));
  },

  goWeek(offset) {
    this.monday = addDays(mondayOf(this.today), offset * 7);
    this.$nextTick(() => this.scrollToToday(true));
  },

  scrollToToday(smooth) {
    const sc = document.querySelector('[data-scroll-key="plan"]');
    const el = sc?.querySelector('.day.is-today');
    if (!sc || !el) return;
    const top = el.offsetTop - 12;
    sc.scrollTo({ top: weekdayIndex(this.today) < 2 ? 0 : top, behavior: smooth ? 'smooth' : 'auto' });
  },

  dayView(iso) {
    const day = getDay(this.db.plan, iso);
    const i = weekdayIndex(iso);
    return {
      iso,
      name: WEEKDAYS[i],
      short: WEEKDAYS_SHORT[i],
      date: dayMonth(iso),
      today: iso === this.today,
      past: iso < this.today,
      weekend: i >= 5,
      slots: slotsOf(day).map((s) => ({ ...s, entries: day.slots?.[s.key] || [] })),
    };
  },

  slotName(iso, key) {
    return slotsOf(getDay(this.db.plan, iso)).find((s) => s.key === key)?.label || '';
  },

  where(iso, slot) {
    const i = weekdayIndex(iso);
    const rel = iso === this.today ? 'Heute' : iso === addDays(this.today, 1) ? 'Morgen' : `${WEEKDAYS_SHORT[i]}, ${dayMonth(iso)}`;
    return `${rel} · ${this.slotName(iso, slot)}`;
  },

  setupDrag() {
    const root = this.$refs.planView;
    const scroller = this.$refs.planScroller;
    if (!root || !scroller) return;
    this.drag = createDrag({
      root,
      scroller,
      onStart: () => this.closeMenu(),
      onFlip: (dir) => this.shiftWeekKeepScroll(dir),
      onDrop: (from, to) => {
        if (to.who !== undefined) {
          const e = findEntry(this.db.plan, from.iso, from.slot, from.id);
          const label = to.who ? `Nur ${PEOPLE[to.who]}` : 'Für beide';
          this.withUndo(`${label} · ${this.where(to.iso, to.slot)}`, () => {
            if (from.iso !== to.iso || from.slot !== to.slot) moveEntry(this.db.plan, from, { ...to, index: null });
            updateEntry(this.db.plan, to.iso, to.slot, from.id, { who: to.who || null });
          });
          return e;
        }
        if (from.iso === to.iso && from.slot === to.slot) {
          const list = this.db.plan[from.iso]?.slots?.[from.slot] || [];
          const i = list.findIndex((e) => e.id === from.id);
          if (i === to.index || i + 1 === to.index) return;
          moveEntry(this.db.plan, from, to);
          this.commit();
          return;
        }
        this.withUndo(`Verschoben nach ${this.where(to.iso, to.slot)}`, () => moveEntry(this.db.plan, from, to));
      },
    });
  },

  shiftWeekKeepScroll(dir) {
    this.monday = addDays(this.monday, dir * 7);
  },

  entryMenu(ev, iso, slot, e) {
    const recipe = e.recipeId ? this.recipesById[e.recipeId] : null;
    const items = [
      { label: 'Bearbeiten', icon: 'pencil', action: () => this.openEntry(iso, slot, e) },
      { label: 'Duplizieren', icon: 'copy', action: () => this.openPicker('duplicate', { iso, slot, id: e.id, title: this.titleOf(e) }) },
      { label: 'Verschieben', icon: 'calendar-plus', action: () => this.openPicker('move', { iso, slot, id: e.id, title: this.titleOf(e) }) },
    ];
    for (const w of ['E', 'J']) {
      if (e.who !== w) items.push({ label: `Nur ${PEOPLE[w]}`, icon: 'user', action: () => this.setWho(iso, slot, e.id, w) });
    }
    if (e.who) items.push({ label: 'Für beide', icon: 'users', action: () => this.setWho(iso, slot, e.id, null) });
    if (recipe) items.push({ label: 'Rezept öffnen', icon: 'recipe', action: () => this.showRecipe(recipe.id) });
    const link = e.note && findVideoUrl(e.note) || (e.note && /https?:\/\//.test(e.note) ? e.note.match(/https?:\/\/\S+/)[0] : '');
    if (!recipe && link) items.push({ label: 'Link öffnen', icon: 'external', action: () => window.open(link, '_blank', 'noopener') });
    items.push({ label: 'Entfernen', icon: 'trash', danger: true, action: () => this.deleteEntry(iso, slot, e.id) });
    this.openMenu(ev, items);
  },

  dayMenu(ev, iso) {
    this.openMenu(ev, [
      { label: 'Weitere Mahlzeit', icon: 'plus', action: () => this.openSlotForm(iso) },
      ...(this.dayView(iso).slots.some((s) => s.entries.length)
        ? [{ label: 'Tag leeren', icon: 'trash', danger: true, action: () => this.clearDay(iso) }]
        : []),
    ]);
  },

  extraMenu(ev, iso, slot) {
    this.openMenu(ev, [
      { label: 'Gericht eintragen', icon: 'plus', action: () => this.openEntry(iso, slot.key) },
      { label: 'Umbenennen', icon: 'pencil', action: () => this.openSlotForm(iso, slot) },
      { label: 'Mahlzeit entfernen', icon: 'trash', danger: true, action: () => this.withUndo(`„${slot.label}" entfernt`, () => removeExtraSlot(this.db.plan, iso, slot.key)) },
    ]);
  },

  setWho(iso, slot, id, who) {
    updateEntry(this.db.plan, iso, slot, id, { who });
    this.commit();
  },

  deleteEntry(iso, slot, id) {
    const e = findEntry(this.db.plan, iso, slot, id);
    if (!e) return;
    this.withUndo(`„${this.titleOf(e)}" entfernt`, () => removeEntry(this.db.plan, iso, slot, id));
  },

  clearDay(iso) {
    this.withUndo(`${WEEKDAYS[weekdayIndex(iso)]} geleert`, () => { delete this.db.plan[iso]; });
  },

  async exportWeek() {
    const text = weekText(this.db.plan, this.monday, (e) => this.titleOf(e));
    if (!text) { this.notify('In dieser Woche ist noch nichts geplant.'); return; }
    try {
      await copyText(text);
      this.notify('Wochenplan kopiert – bereit zum Einfügen in WhatsApp', { tone: 'ok' });
    } catch {
      // Letzter Ausweg: Text zum manuellen Kopieren anzeigen.
      this.copySheet = { text };
      this.openLayer('copy');
      this.$nextTick(() => this.$refs.copyArea?.select());
    }
  },

  // ------------------------------------------------------------ Weitere Mahlzeit

  openSlotForm(iso, slot = null) {
    this.slotForm = { iso, id: slot?.key || null, label: slot?.label || '' };
    this.openLayer('slot');
    this.$nextTick(() => this.$refs.slotInput?.focus());
  },

  saveSlot(label = null) {
    const f = this.slotForm;
    const name = String(label ?? f.label).trim();
    if (!name) return;
    if (f.id) renameExtraSlot(this.db.plan, f.iso, f.id, name);
    else addExtraSlot(this.db.plan, f.iso, name);
    this.commit();
    this.closeLayer('slot');
  },

  // ------------------------------------------------------------ Eintragen

  openEntry(iso, slot, e = null) {
    this.entry = {
      iso, slot, id: e?.id || null,
      title: e ? this.titleOf(e) : '',
      recipeId: e?.recipeId || null,
      note: e?.note || '',
      noteOpen: !!e?.note,
      asRecipe: false,
      focus: false,
    };
    this.entryActive = -1;
    this.openLayer('entry');
    setTimeout(() => {
      const input = this.$refs.entryInput;
      input?.focus({ preventScroll: true });
      if (e) input?.select();
    }, 60);
  },

  get entrySuggestions() {
    const f = this.entry;
    if (!f) return { recipes: [], history: [] };
    const q = f.title.trim();
    const linked = f.recipeId ? this.recipesById[f.recipeId] : null;
    if (linked && linked.title === q) return { recipes: [], history: [] };
    if (!q) {
      const recent = this.recentRecipes(6);
      return { recipes: recent, history: [], recent: true };
    }
    const recipes = search(this.db.recipes, q, { extra: (r) => r.ingredients.join(' '), limit: 6 });
    const hist = search(historyTitles(this.db.plan, this.db.recipes), q, { limit: 4 });
    return { recipes, history: hist };
  },

  get entryOptions() {
    const s = this.entrySuggestions;
    return [...s.recipes.map((r) => ({ kind: 'recipe', r })), ...s.history.map((h) => ({ kind: 'history', h }))];
  },

  recentRecipes(n) {
    const seen = new Map();
    const days = Object.keys(this.db.plan).sort().reverse();
    for (const iso of days) {
      for (const list of Object.values(this.db.plan[iso].slots)) {
        for (const e of list) if (e.recipeId && !seen.has(e.recipeId) && this.recipesById[e.recipeId]) seen.set(e.recipeId, this.recipesById[e.recipeId]);
      }
      if (seen.size >= n) break;
    }
    return [...seen.values()].slice(0, n);
  },

  get entryExactRecipe() {
    const q = normalize(this.entry?.title || '');
    return q ? this.db.recipes.find((r) => normalize(r.title) === q) || null : null;
  },

  entryTyped() {
    const f = this.entry;
    const linked = f.recipeId ? this.recipesById[f.recipeId] : null;
    if (linked && linked.title !== f.title.trim()) f.recipeId = null;
    this.entryActive = -1;
  },

  noteLabel(e) {
    const n = String(e?.note || '').trim();
    if (!n) return '';
    if (/^https?:\/\/\S+$/.test(n)) return hostLabel(n) || n;
    return n;
  },

  pickSuggestion(opt) {
    if (!opt) return;
    if (opt.kind === 'recipe') { this.entry.title = opt.r.title; this.entry.recipeId = opt.r.id; this.entry.asRecipe = false; }
    else { this.entry.title = opt.h.title; this.entry.recipeId = null; }
    this.entryActive = -1;
    this.saveEntry();
  },

  entryKey(ev) {
    const opts = this.entryOptions;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); this.entryActive = Math.min(opts.length - 1, this.entryActive + 1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); this.entryActive = Math.max(-1, this.entryActive - 1); }
    else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (this.entryActive >= 0) this.pickSuggestion(opts[this.entryActive]);
      else this.saveEntry();
    }
  },

  saveEntry() {
    const f = this.entry;
    const title = f.title.trim();
    if (!title) {
      if (f.id) this.deleteEntryFromSheet();
      else this.closeLayer('entry');
      return;
    }
    let recipeId = f.recipeId;
    if (!recipeId && this.entryExactRecipe) recipeId = this.entryExactRecipe.id;
    if (!recipeId && f.asRecipe) {
      const r = newRecipe({ title });
      this.db.recipes.push(r);
      recipeId = r.id;
    }
    const note = f.note.trim();
    if (f.id) updateEntry(this.db.plan, f.iso, f.slot, f.id, { title, recipeId, note });
    else addEntry(this.db.plan, f.iso, f.slot, { title, recipeId, note });
    this.commit();
    this.closeLayer('entry');
    if (f.asRecipe && !f.recipeId) this.notify(`„${title}" auch als Rezept gespeichert`, { tone: 'ok' });
  },

  // Verknüpftes Rezept aus dem Eintragen-Fenster öffnen: Eingabe wird dabei gespeichert.
  entryOpenRecipe() {
    const id = this.entry?.recipeId;
    if (!id || !this.recipesById[id]) return;
    this.saveEntry();
    this.showRecipe(id);
  },

  deleteEntryFromSheet() {
    const f = this.entry;
    this.closeLayer('entry');
    if (f.id) this.deleteEntry(f.iso, f.slot, f.id);
  },

  entryAsDetailedRecipe() {
    const f = this.entry;
    this.openEditor(null, {
      prefill: { title: f.title.trim() },
      onSaved: (r) => {
        if (!this.entry) return;
        this.entry.title = r.title;
        this.entry.recipeId = r.id;
        this.entry.asRecipe = false;
        this.saveEntry();
      },
    });
  },

  // ------------------------------------------------------------ Ziel wählen (Duplizieren / Verschieben / Einplanen)

  openPicker(mode, src) {
    const base = src.iso ? mondayOf(src.iso) : mondayOf(this.today);
    this.picker = { mode, src, monday: base };
    this.openLayer('picker');
  },

  get pickerTitle() {
    const p = this.picker;
    if (!p) return '';
    return { duplicate: 'Duplizieren nach …', move: 'Verschieben nach …', place: 'Einplanen am …' }[p.mode];
  },

  get pickerQuick() {
    const p = this.picker;
    if (!p) return [];
    const out = [];
    const add = (iso, slot) => {
      if (p.src.iso === iso && p.src.slot === slot) return;
      if (!out.some((o) => o.iso === iso && o.slot === slot)) out.push({ iso, slot, label: this.where(iso, slot) });
    };
    if (p.src.iso) {
      const next = addDays(p.src.iso, 1);
      if (p.src.slot === 'dinner') add(next, 'lunch');
      add(next, p.src.slot);
      if (p.src.slot === 'lunch') add(p.src.iso, 'dinner');
    } else {
      add(this.today, 'dinner');
      add(addDays(this.today, 1), 'dinner');
      add(addDays(this.today, 1), 'lunch');
    }
    return out.slice(0, 3);
  },

  get pickerDays() {
    const p = this.picker;
    if (!p) return [];
    return weekDays(p.monday).map((iso) => this.dayView(iso));
  },

  pickTarget(iso, slot) {
    const p = this.picker;
    this.closeLayer('picker');
    const where = this.where(iso, slot);
    if (p.mode === 'duplicate') this.withUndo(`Dupliziert nach ${where}`, () => duplicateEntry(this.db.plan, p.src, { iso, slot }));
    else if (p.mode === 'move') this.withUndo(`Verschoben nach ${where}`, () => moveEntry(this.db.plan, p.src, { iso, slot, index: null }));
    else this.withUndo(`Eingeplant: ${where}`, () => addEntry(this.db.plan, iso, slot, { title: p.src.title, recipeId: p.src.recipeId }));
  },

  // ------------------------------------------------------------ Rezepte

  get recipeList() {
    const q = this.recipeQuery.trim();
    if (q) return search(this.db.recipes, q, { extra: (r) => `${r.ingredients.join(' ')} ${r.notes}` });
    return sortRecipes(this.db.recipes, this.recipeSort);
  },

  get recipeGroups() {
    const list = this.recipeList;
    if (this.recipeQuery.trim() || this.recipeSort !== 'alpha') return [{ key: 'all', label: '', items: list }];
    const groups = [];
    for (const r of list) {
      let letter = normalize(r.title).charAt(0).toUpperCase() || '#';
      if (!/[A-Z]/.test(letter)) letter = '#';
      const g = groups.at(-1);
      if (g?.key === letter) g.items.push(r);
      else groups.push({ key: letter, label: letter, items: [r] });
    }
    return groups;
  },

  avg(r) {
    return averageRating(r);
  },

  fmtRating(v) {
    return v == null || v === 0 ? '–' : String(Math.round(v * 10) / 10).replace('.', ',');
  },

  starFill(value, i) {
    return Math.max(0, Math.min(1, (value || 0) - i));
  },

  ratingFromPointer(ev, i, current) {
    const r = ev.currentTarget.getBoundingClientRect();
    const half = ev.clientX - r.left < r.width / 2;
    const v = i + (half ? 0.5 : 1);
    return v === current ? 0 : v;
  },

  ratingKey(ev, current) {
    const step = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 }[ev.key];
    if (ev.key === 'Home') return 0;
    if (ev.key === 'End') return 5;
    if (step == null) return null;
    ev.preventDefault();
    return clampRating(current + step);
  },

  get detail() {
    return this.detailId ? this.recipesById[this.detailId] || null : null;
  },

  get detailUsage() {
    return this.detail ? usageOf(this.db.plan, this.detail.id) : { count: 0, last: null };
  },

  get detailVideo() {
    return this.detail?.video ? videoEmbed(this.detail.video) : null;
  },

  showRecipe(id) {
    this.tab = 'recipes';
    this.openDetail(id);
  },

  openDetail(id) {
    this.checked = {};
    if (this.detailId && this.isOpen('detail')) { this.detailId = id; return; }
    viewTransition(() => { this.detailId = id; }, 'forward');
    this.openLayer('detail');
    this.$nextTick(() => this.$refs.detailScroller?.scrollTo({ top: 0 }));
  },

  closeDetail() {
    viewTransition(() => {
      if (this.isOpen('detail')) this.closeLayer('detail');
      else this.detailId = null;
    }, 'back');
  },

  rateDetail(who, value) {
    const r = this.detail;
    if (!r) return;
    r[who] = clampRating(value);
    r.updatedAt = Date.now();
    this.commit();
  },

  detailMenu(ev) {
    const r = this.detail;
    this.openMenu(ev, [
      { label: 'Bearbeiten', icon: 'pencil', action: () => this.openEditor(r) },
      { label: 'Einplanen', icon: 'calendar-plus', action: () => this.openPicker('place', { title: r.title, recipeId: r.id }) },
      { label: 'Löschen', icon: 'trash', danger: true, action: () => this.deleteRecipe(r) },
    ]);
  },

  async deleteRecipe(r) {
    const used = usageOf(this.db.plan, r.id).count;
    const ok = await this.confirm(
      'Rezept löschen?',
      used ? `„${r.title}" steht ${used}× im Wochenplan. Diese Einträge bleiben als Freitext erhalten.` : `„${r.title}" wird endgültig gelöscht.`,
    );
    if (!ok) return;
    this.closeDetail();
    this.withUndo(`„${r.title}" gelöscht`, () => {
      unlinkRecipe(this.db.plan, r.id, r.title);
      this.db.recipes = this.db.recipes.filter((x) => x.id !== r.id);
    });
  },

  hostOf(url) {
    return hostLabel(url);
  },

  // ------------------------------------------------------------ Rezept-Editor

  openEditor(recipe = null, { prefill = {}, onSaved = null } = {}) {
    const r = recipe || newRecipe(prefill);
    this.editor = {
      isNew: !recipe,
      id: r.id,
      title: r.title,
      ratingElika: r.ratingElika,
      ratingJanik: r.ratingJanik,
      ingredients: r.ingredients.join('\n'),
      steps: r.steps.join('\n'),
      video: r.video,
      notes: r.notes,
      source: r.source,
      importOpen: !recipe,
      importText: '',
      busy: false,
      status: '',
      statusTone: '',
      error: '',
      onSaved,
    };
    this.openLayer('editor');
    this.$nextTick(() => this.$refs.editorScroller?.scrollTo({ top: 0 }));
  },

  get editorVideo() {
    const v = this.editor?.video?.trim();
    return v ? videoEmbed(v) : null;
  },

  async runImport() {
    const ed = this.editor;
    if (!ed || ed.busy) return;
    const text = ed.importText.trim();
    if (text.length < 15) { ed.status = 'Bitte zuerst einen Rezepttext einfügen.'; ed.statusTone = 'error'; return; }
    if (!this.settings.keys.length) { ed.status = 'Noch kein Gemini-Schlüssel hinterlegt.'; ed.statusTone = 'error'; return; }
    ed.busy = true;
    ed.status = `Liest Rezept mit ${modelLabel(IMPORT_MODEL)} …`;
    ed.statusTone = '';
    this._importAbort = new AbortController();
    try {
      let used = IMPORT_MODEL;
      const data = await generateJson({
        keys: this.settings.keys,
        models: importModels(),
        quota,
        system: SYSTEM,
        prompt: buildPrompt(text),
        schema: SCHEMA,
        temperature: 0.3,
        maxOutputTokens: 4096,
        thinking: 'low',
        timeoutMs: 45000,
        accept: acceptImport,
        signal: this._importAbort.signal,
        onRetry: ({ next }) => { if (next) ed.status = `Weiter mit ${modelLabel(next)} …`; },
        onSuccess: ({ model }) => { used = model; },
      });
      const out = sanitizeImport(data);
      if (!this.editor || this.editor !== ed) return;
      const urlVideo = findVideoUrl(text);
      ed.title = out.title || ed.title;
      ed.ingredients = out.ingredients.join('\n');
      ed.steps = out.steps.join('\n');
      if (out.notes) ed.notes = ed.notes ? `${ed.notes}\n\n${out.notes}` : out.notes;
      const video = (out.video && videoEmbed(out.video)?.embedUrl ? out.video : '') || urlVideo;
      if (video && !ed.video) ed.video = video;
      if (out.source && !ed.source) ed.source = normalizeUrl(out.source);
      ed.importOpen = false;
      ed.status = `Übernommen mit ${modelLabel(used)} – bitte kurz prüfen.`;
      ed.statusTone = 'ok';
    } catch (e) {
      if (e?.name === 'AbortError') return;
      ed.status = e?.message || 'Import fehlgeschlagen.';
      ed.statusTone = 'error';
    } finally {
      ed.busy = false;
    }
  },

  saveEditor() {
    const ed = this.editor;
    const title = ed.title.trim();
    if (!title) { ed.error = 'Der Titel fehlt.'; this.$refs.editorTitle?.focus(); return; }
    this._importAbort?.abort();
    let r = this.recipesById[ed.id];
    const patch = {
      title,
      ratingElika: clampRating(ed.ratingElika),
      ratingJanik: clampRating(ed.ratingJanik),
      ingredients: splitLines(ed.ingredients),
      steps: splitLines(ed.steps),
      video: normalizeUrl(ed.video),
      notes: ed.notes.trim(),
      source: normalizeUrl(ed.source),
      updatedAt: Date.now(),
    };
    if (r) Object.assign(r, patch);
    else {
      r = newRecipe({ id: ed.id, ...patch });
      this.db.recipes.push(r);
    }
    this.commit();
    // Mit Rückruf (Anlage aus dem Wochenplan) schließt der Rückruf Eintrag und Editor in
    // einem Rücksprung; zwei getrennte history.go() kurz hintereinander verschluckt der Browser.
    if (ed.onSaved) ed.onSaved(r);
    if (this.isOpen('editor')) this.closeLayer('editor');
    if (!ed.onSaved && ed.isNew) { this.notify(`„${title}" gespeichert`, { tone: 'ok' }); this.openDetail(r.id); }
  },

  cancelEditor() {
    this._importAbort?.abort();
    this.closeLayer('editor');
  },

  // ------------------------------------------------------------ Einstellungen

  openSettings() {
    this.settings.newKey = '';
    this.settings.testResult = '';
    this.settings.blocks = quota.list();
    this.openLayer('settings');
  },

  saveKeys() {
    writeJson(GEMINI_KEY, { keys: this.settings.keys });
  },

  addKey() {
    const added = normalizeKeys(this.settings.newKey.split(/[\s,;]+/));
    if (!added.length) return;
    this.settings.keys = normalizeKeys([...this.settings.keys, ...added]);
    this.settings.newKey = '';
    this.saveKeys();
    this.notify(added.length > 1 ? `${added.length} Schlüssel hinzugefügt` : 'Schlüssel hinzugefügt', { tone: 'ok' });
  },

  removeKey(k) {
    this.settings.keys = this.settings.keys.filter((x) => x !== k);
    this.saveKeys();
  },

  mask(k) {
    return maskKey(k);
  },

  async testKeys() {
    const s = this.settings;
    if (!s.keys.length || s.testing) return;
    s.testing = true;
    s.testResult = '';
    const results = [];
    for (const [i, key] of s.keys.entries()) {
      try {
        let used = IMPORT_MODEL;
        await generateJson({
          keys: [key], models: importModels(), quota,
          prompt: 'Antworte mit {"ok": true}.',
          schema: { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] },
          temperature: 0.2, maxOutputTokens: 256, thinking: 'minimal', attempts: 1,
          onSuccess: ({ model }) => { used = model; },
        });
        results.push(`Schlüssel ${i + 1}: ok (${modelLabel(used)})`);
      } catch (e) {
        results.push(`Schlüssel ${i + 1}: ${e?.message || 'Fehler'}`);
      }
    }
    s.testResult = results.join('\n');
    s.blocks = quota.list();
    s.testing = false;
  },

  clearQuota() {
    quota.clear();
    this.settings.blocks = [];
    this.notify('Sperrliste geleert');
  },

  blockLabel(b) {
    const until = new Date(b.until).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    const idx = this.settings.keys.findIndex((k) => keyTag(k) === b.tag);
    const who = idx >= 0 ? `Schlüssel ${idx + 1}` : 'Schlüssel';
    return `${who} · ${b.model === '*' ? 'alle Modelle' : modelLabel(b.model)} · bis ${until} Uhr`;
  },

  get stats() {
    const days = Object.keys(this.db?.plan || {});
    let entries = 0;
    for (const d of Object.values(this.db?.plan || {})) for (const l of Object.values(d.slots)) entries += l.length;
    return { recipes: this.db?.recipes.length || 0, days: days.length, entries, since: days.sort()[0] || null };
  },

  // ------------------------------------------------------------ Sicherung

  backupBlob() {
    return new Blob([buildBackupZip(this.db)], { type: 'application/zip' });
  },

  downloadBackup() {
    const blob = this.backupBlob();
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: backupName() });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },

  get canShareFiles() {
    try {
      return !!navigator.canShare?.({ files: [new File(['x'], 'x.zip', { type: 'application/zip' })] });
    } catch { return false; }
  },

  async shareBackup() {
    const file = new File([this.backupBlob()], backupName(), { type: 'application/zip' });
    try {
      await navigator.share({ files: [file], title: 'Week Planner Sicherung' });
    } catch (e) {
      if (e?.name !== 'AbortError') this.notify('Teilen nicht möglich – bitte herunterladen.', { tone: 'error' });
    }
  },

  saveDriveClient() {
    const cur = readJson(DRIVE_KEY, {}) || {};
    writeJson(DRIVE_KEY, { ...cur, clientId: this.backup.clientId.trim() });
  },

  async driveBackup() {
    const b = this.backup;
    if (b.busy) return;
    if (!b.clientId.trim()) { this.notify('Zuerst die Google-Client-ID eintragen.', { tone: 'error' }); return; }
    this.saveDriveClient();
    b.busy = true;
    b.status = 'Verbinde mit Google Drive …';
    try {
      const cur = readJson(DRIVE_KEY, {}) || {};
      const name = backupName();
      const res = await uploadToDrive({ clientId: b.clientId.trim(), blob: this.backupBlob(), name, folder: cur.folderId || null });
      writeJson(DRIVE_KEY, { ...cur, clientId: b.clientId.trim(), folderId: res.folderId, last: Date.now() });
      b.status = `Gespeichert in „Week Planner Sicherungen": ${name}`;
      this.notify('Sicherung in Google Drive gespeichert', { tone: 'ok' });
    } catch (e) {
      b.status = e?.message || 'Hochladen fehlgeschlagen.';
    } finally {
      b.busy = false;
    }
  },

  get lastDrive() {
    const t = readJson(DRIVE_KEY, {})?.last;
    return t ? new Date(t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  },

  async uploadBackup(ev) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const s = await readBackupFile(file);
      if (!s.recipes.length && !Object.keys(s.plan).length && !s.shopping.items.length && !s.pantry.items.length) throw new Error('leer');
      const ok = await this.confirm('Sicherung einspielen?', `${s.recipes.length} Rezepte, ${Object.keys(s.plan).length} geplante Tage, ${s.shopping.items.length} Einkaufsposten und ${s.pantry.items.length} Vorräte ersetzen den aktuellen Stand.`, 'Einspielen');
      if (!ok) return;
      this.withUndo('Sicherung eingespielt', () => {
        this.db.recipes = s.recipes; this.db.plan = s.plan; this.db.shopping = s.shopping; this.db.pantry = s.pantry;
      });
    } catch {
      this.notify('Die Datei ist keine gültige Sicherung.', { tone: 'error' });
    }
  },

  // ------------------------------------------------------------ Zugang

  async unlock() {
    const a = this.auth;
    if (a.busy) return;
    a.busy = true;
    a.error = '';
    try {
      if (await checkPassword(a.pw)) {
        rememberUnlock();
        viewTransition(() => { this.locked = false; });
        a.pw = '';
        this.$nextTick(() => { this.setupDrag(); this.scrollToToday(false); });
      } else {
        a.error = 'Das Passwort stimmt nicht.';
      }
    } catch {
      a.error = 'Dieser Browser kann das Passwort nicht prüfen (nur über HTTPS möglich).';
    } finally {
      a.busy = false;
    }
  },

  // ------------------------------------------------------------ Vorrat

  get pantryGroups() {
    return this.db ? pantryTree(this.db.pantry, this.pantryQuery) : [];
  },

  get pantryCount() {
    return this.db?.pantry.items.filter((it) => it.qty > 0).length || 0;
  },

  get brickStock() {
    return (this.db?.pantry.items || []).filter((it) => isBrick(it) && it.qty > 0);
  },

  placeShort(key) {
    return placeOf(key).short;
  },

  addPantry() {
    const name = this.pantryInput.trim();
    if (!name) return;
    const res = addPantryItem(this.db.pantry, { name, qty: 1, place: this.pantryPlace });
    this.pantryInput = '';
    this.commit();
    if (res?.merged) this.notify(`„${res.item.name}" gab es schon – jetzt ${res.item.qty} Stück`);
    this.$nextTick(() => {
      const el = document.querySelector(`[data-pantry="${res.item.id}"]`);
      el?.classList.remove('is-new');
      void el?.offsetWidth;
      el?.classList.add('is-new');
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  },

  setPantryQty(item, value) {
    const before = item.qty;
    const n = Math.max(0, Math.min(999, Math.round(Number(String(value).replace(',', '.')) || 0)));
    item.qty = n;
    item.updatedAt = Date.now();
    this.commit();
    if (before > 0 && n === 0) this.askRestock(item);
  },

  pantryStep(item, d) {
    this.setPantryQty(item, (item.qty || 0) + d);
  },

  async askRestock(item) {
    const onList = this.db.shopping.items.some((it) => keyOf(it.name) === keyOf(item.name));
    if (onList) { this.notify(`„${item.name}" ist aufgebraucht und steht schon auf der Einkaufsliste.`); return; }
    const ok = await this.confirm(`„${item.name}" ist aufgebraucht`, 'Auf die Einkaufsliste setzen?', 'Auf die Liste');
    if (!ok) return;
    this.addShopItem(item.name, { store: null, silent: true });
    this.notify(`„${item.name}" steht auf der Einkaufsliste`, { tone: 'ok' });
  },

  openPantryEdit(item) {
    this.pantryEdit = { id: item.id, name: item.name, place: item.place, qty: item.qty };
    this.openLayer('pantry-item');
  },

  savePantryEdit() {
    const f = this.pantryEdit;
    const item = this.db.pantry.items.find((it) => it.id === f.id);
    const name = f.name.trim();
    if (!item || !name) { this.closeLayer('pantry-item'); return; }
    item.name = name;
    item.place = f.place;
    this.closeLayer('pantry-item');
    this.setPantryQty(item, f.qty);
  },

  deletePantryItem() {
    const f = this.pantryEdit;
    this.closeLayer('pantry-item');
    const item = this.db.pantry.items.find((it) => it.id === f.id);
    if (!item) return;
    this.withUndo(`„${item.name}" entfernt`, () => { this.db.pantry.items = this.db.pantry.items.filter((it) => it.id !== f.id); });
  },

  async suggestBricks() {
    if (!this.settings.keys.length) { this.notify('Für Vorschläge zuerst einen Gemini-Schlüssel in den Einstellungen hinterlegen.', { tone: 'error' }); return; }
    if (this.brickStock.length < 2) { this.notify('Dafür braucht es mindestens zwei verschiedene Bricks im Vorrat.'); return; }
    if (!this.isOpen('bricks')) {
      this.bricks = { busy: true, meals: [], error: '', status: `Kombiniere mit ${modelLabel(brickModels()[0])} …` };
      this.openLayer('bricks');
    } else {
      Object.assign(this.bricks, { busy: true, error: '', status: `Neue Ideen mit ${modelLabel(brickModels()[0])} …` });
    }
    const box = this.bricks;
    try {
      const items = this.db.pantry.items;
      const data = await generateJson({
        keys: this.settings.keys, models: brickModels(), quota,
        system: BRICK_SYSTEM, prompt: `${brickPrompt(items)}${box.meals.length ? `\n\nBitte andere Ideen als: ${box.meals.map((m) => m.title).join(', ')}.` : ''}`,
        schema: brickSchema(items), temperature: 1, maxOutputTokens: 2048, thinking: 'minimal', timeoutMs: 25000,
        accept: (d) => readBrickMeals(d, items).length >= 3,
        onRetry: ({ next }) => { if (next) box.status = `Weiter mit ${modelLabel(next)} …`; },
      });
      if (this.bricks !== box) return;
      box.meals = readBrickMeals(data, items);
    } catch (e) {
      if (this.bricks === box) box.error = e?.message || 'Keine Vorschläge erhalten.';
    } finally {
      box.busy = false;
    }
  },

  async takeBricks(meal) {
    const names = [];
    this.withUndo(`Entnommen: ${meal.title}`, () => {
      for (const b of meal.bricks) {
        const it = this.db.pantry.items.find((x) => x.id === b.item.id);
        if (!it) continue;
        it.qty = Math.max(0, it.qty - b.count);
        it.updatedAt = Date.now();
        if (it.qty === 0) names.push(it);
      }
    });
    this.closeLayer('bricks');
    for (const it of names) await this.askRestock(it);
  },

  // ------------------------------------------------------------ Einkauf

  get shopStores() {
    return allStores(this.db?.shopping);
  },

  get shopGroups() {
    if (!this.db) return [];
    return groupItems(this.db.shopping).map((g) => ({ ...g, rows: withDeptHeads(g.items) }));
  },

  get shopCount() {
    return this.db?.shopping.items.length || 0;
  },

  get shopSuggestions() {
    if (!this.db) return [];
    return suggestProducts(this.db.shopping, this.shopInput, 8);
  },

  storeOf(id) {
    return storeById(this.db.shopping, id);
  },

  deptLabel(key) {
    return DEPTS.find((d) => d.key === key)?.label || 'Sonstiges';
  },

  addShopItem(name = null, { store = undefined, qty = 0, dept = null, silent = false } = {}) {
    const text = String(name ?? this.shopInput).trim();
    if (!text) return null;
    const res = addItem(this.db.shopping, { name: text, store: store === undefined ? this.shopStore : store, qty, dept });
    if (!res) return null;
    if (name == null || name === this.shopInput) this.shopInput = '';
    this.commit();
    if (!res.item.dept) this.queueClassify(res.item.name);
    if (!silent && res.merged) this.notify(`„${res.item.name}" stand schon auf der Liste – Menge erhöht`);
    if (!silent) this.$nextTick(() => this.revealItem(res.item.id));
    return res;
  },

  pickProduct(p) {
    this.addShopItem(p.name, { dept: p.dept });
    this.shopInput = '';
    this.$refs.shopInput?.focus({ preventScroll: true });
  },

  revealItem(id) {
    const el = document.querySelector(`[data-item="${id}"]`);
    if (!el) return;
    const group = el.closest('[data-group]')?.dataset.group;
    if (group && this.shopCollapsed[group]) this.shopCollapsed = { ...this.shopCollapsed, [group]: false };
    el.classList.remove('is-new');
    void el.offsetWidth;
    el.classList.add('is-new');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  },

  shopKey(ev) {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      this.addShopItem();
    }
  },

  // Abhaken = Löschen; der Rückgängig-Knopf oben links bleibt 5 s stehen und stellt
  // alles wieder her, was in diesem Fenster abgehakt wurde.
  checkItem(item) {
    if (!this.shopUndo) this.shopUndo = { snap: JSON.stringify(this.db.shopping.items), count: 0 };
    this.shopUndo.count++;
    this.shopUndo.until = Date.now() + 5000;
    this.db.shopping.items = this.db.shopping.items.filter((it) => it.id !== item.id);
    this.commit();
    clearTimeout(this._shopUndoTimer);
    this._shopUndoTimer = setTimeout(() => { this.shopUndo = null; }, 5000);
  },

  undoShop() {
    const u = this.shopUndo;
    if (!u) return;
    clearTimeout(this._shopUndoTimer);
    const items = JSON.parse(u.snap);
    const known = new Set(this.db.shopping.items.map((it) => it.id));
    const restored = items.filter((it) => !known.has(it.id));
    this.db.shopping.items = [...this.db.shopping.items, ...restored];
    this.shopUndo = null;
    this.commit();
  },

  incQty(item) {
    item.qty = (item.qty || 0) + 1;
    this.commit();
  },

  decQty(item) {
    if (item.qty > 1) item.qty -= 1;
    this.commit();
  },

  assignStore(item, storeId) {
    item.store = storeId;
    this.commit();
  },

  toggleGroup(key) {
    this.shopCollapsed = { ...this.shopCollapsed, [key]: !this.shopCollapsed[key] };
  },

  async clearGroup(g) {
    const name = g.store ? g.store.name : 'ohne Laden';
    const ok = await this.confirm(`${g.items.length} Einträge löschen?`, `Alle Einträge ${g.store ? `bei ${name}` : 'ohne Laden'} werden von der Liste genommen.`);
    if (!ok) return;
    const ids = new Set(g.items.map((it) => it.id));
    this.withUndo(`${ids.size} Einträge gelöscht`, () => { this.db.shopping.items = this.db.shopping.items.filter((it) => !ids.has(it.id)); });
  },

  async clearShopping() {
    if (!this.shopCount) return;
    const ok = await this.confirm('Ganze Liste leeren?', `Alle ${this.shopCount} Einträge werden gelöscht. Gemerkte Produkte bleiben als Vorschläge erhalten.`, 'Löschen');
    if (!ok) return;
    this.withUndo('Einkaufsliste geleert', () => { this.db.shopping.items = []; });
  },

  groupMenu(ev, g) {
    this.openMenu(ev, [
      { label: 'Alle Einträge löschen', icon: 'trash', danger: true, action: () => this.clearGroup(g) },
    ]);
  },

  shopMenu(ev) {
    this.openMenu(ev, [
      { label: 'Laden hinzufügen', icon: 'store', action: () => this.openStoreForm() },
      { label: 'Ganze Liste leeren', icon: 'trash', danger: true, action: () => this.clearShopping() },
    ]);
  },

  openItemEdit(item) {
    this.shopEdit = { id: item.id, name: item.name, store: item.store, dept: item.dept || 'other' };
    this.openLayer('item');
  },

  saveItemEdit() {
    const f = this.shopEdit;
    const item = this.db.shopping.items.find((it) => it.id === f.id);
    const name = f.name.trim();
    if (!item || !name) { this.closeLayer('item'); return; }
    const renamed = keyOf(name) !== keyOf(item.name);
    item.name = name;
    item.store = f.store || null;
    if (renamed) this.db.shopping.catalog[keyOf(name)] ||= { name, dept: f.dept, count: 1, last: Date.now() };
    setDept(this.db.shopping, name, f.dept);
    item.dept = f.dept;
    this.commit();
    this.closeLayer('item');
  },

  deleteFromEdit() {
    const f = this.shopEdit;
    this.closeLayer('item');
    const item = this.db.shopping.items.find((it) => it.id === f.id);
    if (item) this.checkItem(item);
  },

  openStoreForm() {
    this.storeForm = { name: '' };
    this.openLayer('store');
    setTimeout(() => this.$refs.storeInput?.focus(), 60);
  },

  saveStore() {
    const name = this.storeForm?.name.trim();
    if (!name) return;
    const s = addStore(this.db.shopping, name);
    this.commit();
    this.closeLayer('store');
    if (s) this.shopStore = s.id;
  },

  async deleteStore(s) {
    const n = this.db.shopping.items.filter((it) => it.store === s.id).length;
    const ok = await this.confirm(`„${s.name}" entfernen?`, n ? `${n} Einträge bleiben auf der Liste, aber ohne Laden.` : 'Der Laden wird aus der Auswahl entfernt.', 'Löschen');
    if (!ok) return;
    removeStore(this.db.shopping, s.id);
    if (this.shopStore === s.id) this.shopStore = null;
    this.commit();
  },

  storeChipPress(s) {
    if (s.custom) this.deleteStore(s);
  },

  // Abteilungen: neue Produkte werden gesammelt und in einer Anfrage zugeordnet.
  queueClassify(name) {
    if (!this.settings.keys.length) return;
    this._classifyQueue ||= new Set();
    this._classifyQueue.add(name);
    clearTimeout(this._classifyTimer);
    this._classifyTimer = setTimeout(() => this.runClassify(), 700);
  },

  classifyMissing() {
    for (const it of this.db.shopping.items) if (!it.dept && !this.db.shopping.catalog[keyOf(it.name)]?.dept) this.queueClassify(it.name);
  },

  async runClassify() {
    const names = [...(this._classifyQueue || [])].slice(0, 40);
    this._classifyQueue = new Set([...(this._classifyQueue || [])].slice(40));
    if (!names.length || !this.settings.keys.length) return;
    try {
      const data = await generateJson({
        keys: this.settings.keys, models: shopModels(), quota,
        system: CLASSIFY_SYSTEM, prompt: classifyPrompt(names), schema: CLASSIFY_SCHEMA,
        temperature: 0.2, maxOutputTokens: 2048, thinking: 'minimal',
      });
      const result = readClassification(data);
      const byKey = new Map(result.map((r) => [keyOf(r.name), r.dept]));
      names.forEach((n, i) => {
        const dept = byKey.get(keyOf(n)) || result[i]?.dept;
        if (dept && !this.db.shopping.catalog[keyOf(n)]?.dept) setDept(this.db.shopping, n, dept, { create: false });
      });
      this.commit();
    } catch {
      // Ohne Zuordnung bleibt das Produkt unter „Sonstiges"; beim nächsten Start neuer Versuch.
    }
    if (this._classifyQueue.size) this._classifyTimer = setTimeout(() => this.runClassify(), 1500);
  },

  // Sprachaufnahme: gedrückt halten, sprechen, loslassen.
  async recStart(ev) {
    if (this.rec.state !== 'idle') return;
    ev.preventDefault();
    if (!this.settings.keys.length) { this.notify('Für die Spracheingabe zuerst einen Gemini-Schlüssel in den Einstellungen hinterlegen.', { tone: 'error' }); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { this.notify('Dieser Browser kann keine Sprache aufnehmen.', { tone: 'error' }); return; }
    this._recHeld = true;
    this.rec = { state: 'starting', seconds: 0, text: '' };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!this._recHeld) { stream.getTracks().forEach((t) => t.stop()); this.rec = { state: 'idle', seconds: 0, text: '' }; this.notify('Zum Sprechen gedrückt halten'); return; }
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        this.recProcess(new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' }));
      };
      this._rec = { recorder, started: Date.now() };
      recorder.start(250);
      navigator.vibrate?.(15);
      this.rec = { state: 'recording', seconds: 0, text: '' };
      this._recTick = setInterval(() => { this.rec.seconds = Math.floor((Date.now() - this._rec.started) / 1000); if (this.rec.seconds >= 90) this.recStop(); }, 250);
    } catch {
      this._recHeld = false;
      this.rec = { state: 'idle', seconds: 0, text: '' };
      this.notify('Kein Zugriff auf das Mikrofon.', { tone: 'error' });
    }
  },

  recStop() {
    this._recHeld = false;
    if (this.rec.state !== 'recording' || !this._rec) return;
    clearInterval(this._recTick);
    const short = Date.now() - this._rec.started < 700;
    this._rec.short = short;
    this.rec = { state: short ? 'idle' : 'busy', seconds: 0, text: short ? '' : 'Verstehe die Liste …' };
    this._rec.recorder.stop();
  },

  async recProcess(blob) {
    if (this._rec?.short || !blob.size) {
      this._rec = null;
      this.rec = { state: 'idle', seconds: 0, text: '' };
      this.notify('Zum Sprechen den Knopf gedrückt halten');
      return;
    }
    this._rec = null;
    const stores = this.shopStores.map((s) => s.name);
    try {
      const data = await generateJson({
        keys: this.settings.keys, models: shopModels(), quota,
        system: voiceSystem(stores), schema: voiceSchema(stores),
        prompt: `Erstelle die Einkaufseinträge aus der Aufnahme.${this.shopStore ? ` Ohne genannten Laden gilt: ${this.storeOf(this.shopStore)?.name}.` : ''}`,
        media: [{ mimeType: blob.type.split(';')[0] || 'audio/webm', data: await blobToBase64(blob) }],
        temperature: 0.2, maxOutputTokens: 4096, thinking: 'minimal', timeoutMs: 45000,
        onRetry: ({ next }) => { if (next) this.rec.text = `Weiter mit ${modelLabel(next)} …`; },
      });
      const items = readVoice(data);
      if (!items.length) { this.notify('Darin wurde nichts für die Liste erkannt.'); return; }
      const snap = this.snapshot();
      for (const it of items) {
        const store = it.store ? storeByName(this.db.shopping, it.store)?.id || null : this.shopStore;
        this.addShopItem(it.name, { store, qty: it.qty, dept: it.dept, silent: true });
      }
      this.notify(items.length === 1 ? `„${items[0].name}" eingetragen` : `${items.length} Einträge aus der Sprachaufnahme`, { undo: snap });
    } catch (e) {
      this.notify(e?.message || 'Die Aufnahme konnte nicht ausgewertet werden.', { tone: 'error' });
    } finally {
      this.rec = { state: 'idle', seconds: 0, text: '' };
    }
  },

  addWeek(monday, dir) {
    return addDays(monday, dir * 7);
  },

  kwOf(monday) {
    return isoWeek(monday);
  },

  rangeOf(monday) {
    return rangeLabel(monday);
  },

  dayLabel(iso) {
    return `${WEEKDAYS[weekdayIndex(iso)]}, ${dayMonth(iso)}`;
  },

  fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  },
}));

window.Alpine = Alpine;
Alpine.start();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
