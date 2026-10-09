import Alpine from 'alpinejs';

import { iconSvg } from './icons.mjs';
import {
  MEALS, PEOPLE, slotsOf, getDay, addEntry, updateEntry, removeEntry, moveEntry, duplicateEntry, findEntry,
  addExtraSlot, renameExtraSlot, removeExtraSlot, newRecipe, clampRating, averageRating, sortRecipes,
  splitLines, usageOf, historyTitles, unlinkRecipe, sanitizeState, LEFTOVER_TITLE, ORDER_TITLE, addRestaurant, restaurantUsage,
} from './model.mjs';
import { previousDinner, cookHistory, suggestDinners, rememberShown, ingredientName, pantryMatch, similarRecipes, daysBetween } from './suggest.mjs';
import { periodOf, shiftPeriod, computeStats, compareStats, firstSeen, fmtEuro, fmtPct, fmtDiff } from './stats.mjs';
import { NUTRI_SYSTEM, NUTRI_SCHEMA, nutriModels, periodDishes, nutriSignature, nutriPrompt, readNutrition, acceptNutrition } from './nutrition-ai.mjs';
import { renderWrappedImage } from './wrapped-image.mjs';
import { BOOKS, SKIPS, SLEEP_OPTIONS, MARK_AFTER_MS, eveningKey, markDue, advance, seekAcross, scrubFactor, fmtClock } from './hp.mjs';
import { loadLibrary, saveHandles, copyFiles, removeBook, trackFile, canPickHandles } from './hp-store.mjs';
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
import { PLACES, MAINS, placeOf, isBrick, addPantryItem, pantryTree, belowMin, placeForProduct } from './pantry.mjs';
import { BRICK_SYSTEM, brickSchema, brickPrompt, readBrickMeals, brickModels } from './pantry-ai.mjs';
import {
  DEPTS, allStores, storeById, storeByName, addStore, removeStore, addItem, setDept, groupItems,
  withDeptHeads, suggestProducts, keyOf, recurringOf, setRecurring, applyRecurring, nextWeekday,
} from './shopping.mjs';
import {
  CLASSIFY_SYSTEM, CLASSIFY_SCHEMA, classifyPrompt, readClassification, voiceSystem, voiceSchema, readVoice, shopModels,
} from './shopping-ai.mjs';
import { registerAqua } from './tools/aqua-app.mjs';
import { registerSorter } from './tools/sorter-app.mjs';
import { loadData, saveData, flushData, readJson, writeJson, UI_KEY, GEMINI_KEY, QUOTA_KEY } from './storage.mjs';

const TABS = [
  { key: 'plan', label: 'Wochenplan', icon: 'plan' },
  { key: 'shop', label: 'Einkauf', icon: 'shop' },
  { key: 'recipes', label: 'Rezepte', icon: 'recipes' },
  { key: 'pantry', label: 'Vorrat', icon: 'pantry' },
  { key: 'tools', label: 'Werkzeuge', icon: 'tools' },
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

const TAB_ORDER = ['plan', 'shop', 'recipes', 'pantry', 'tools'];
const BACKUP_KEY = 'wp-backup-last-v1';
const SUGGEST_KEY = 'wp-suggest-v1';
const NUTRI_KEY = 'wp-nutrition-v1';
const WRAP_KEY = 'wp-wrapped-v1';
const HP_KEY = 'wp-hp-v1';
const WEEK_MS = 7 * 86400000;

// Recipe-Lookup: die Map wird nur neu gebaut, wenn sich die Liste selbst ändert
// (Titeländerungen kommen über die reaktiven Rezept-Objekte trotzdem an).
const recipeIndex = new WeakMap();

// Der Hörbuch-Player lebt außerhalb von Alpine: DOM-Objekte gehören nicht in den
// reaktiven Zustand, und das Abspielen soll unabhängig von jeder Ansicht weiterlaufen.
let hpAudio = null;
let hpUrl = '';

// Ansichtswechsel mit View Transition API; ohne Unterstützung einfach direkt.
function viewTransition(update, dir = 'none') {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce) { update(); return; }
  document.documentElement.dataset.vt = dir;
  // Nicht auf Alpine.nextTick warten: Alpine hält nextTick-Rückrufe bis zum nächsten
  // Animationsframe zurück, sobald irgendwo ein x-transition läuft — und während der
  // View Transition gibt es keine Frames. Ergebnis war ein 4-Sekunden-Hänger. Alpines
  // DOM-Aktualisierung läuft als Microtask, ein Makrotask danach reicht.
  const t = document.startViewTransition(() => {
    update();
    return new Promise((resolve) => setTimeout(resolve, 0));
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
    const stop = e.target.closest('[data-no-longpress], [x-longpress]');
    if (stop && stop !== el) return;
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
  availBox: null,
  recurringBox: false,

  // Wochenplan-Erweiterungen
  order: null,
  suggestBox: null,
  ingredientsBox: null,
  kitchenOpen: {},
  statsView: { kind: 'month', anchor: isoDate() },
  nutri: {},
  wrapped: null,
  backupAuto: false,

  // Werkzeuge: Harry-Potter-Hörbücher
  BOOKS,
  SKIPS,
  SLEEP_OPTIONS,
  hp: {
    lib: {}, loaded: false, pos: { book: 1, track: 0, time: 0 }, playing: false, current: 0, duration: 0,
    sleep: 0, sleepUntil: 0, sleepLeft: 0, scrub: null, notice: '', error: '', copying: null, canHandles: false,
  },

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
    this.backupAuto = !!readJson(DRIVE_KEY, {})?.auto;
    this.nutri = readJson(NUTRI_KEY, {}) || {};

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
      if (document.visibilityState === 'visible') { this.today = isoDate(); this.runRecurring(); }
      else { this.persistUi(); flushData(this.db); this.hpSave(); }
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
    this.runRecurring();
    this.hpInit();
    this.armAutoBackup();
    if (!this.locked) this.afterUnlock();
  },

  // Alles, was erst nach der Freischaltung sichtbar werden darf.
  afterUnlock() {
    if (this.handleShareTarget()) return;
    if (new URLSearchParams(location.search).get('kitchen')) {
      history.replaceState({ wp: 0 }, '', location.pathname);
      this.openKitchen();
      return;
    }
    setTimeout(() => this.checkWrapped(), 700);
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
      if (name === 'order') this.order = null;
      if (name === 'suggest') this.suggestBox = null;
      if (name === 'ingredients') this.ingredientsBox = null;
      if (name === 'avail') this.availBox = null;
      if (name === 'recurring') this.recurringBox = false;
      if (name === 'kitchen') this.releaseWakeLock();
      if (name === 'wrapped') this.wrappedClosed();
      if (name === 'hp') this.hp.scrub = null;
      window.dispatchEvent(new CustomEvent('wp-layer-closed', { detail: name }));
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
    this.db.restaurants = s.restaurants;
    this.commit();
  },

  get recipesById() {
    const list = this.db?.recipes;
    if (!list) return {};
    const n = list.length;
    const raw = Alpine.raw(list);
    const hit = recipeIndex.get(raw);
    if (hit && hit.n === n) return hit.map;
    const map = {};
    for (const r of list) map[r.id] = r;
    recipeIndex.set(raw, { n, map });
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
      ...(slot === 'dinner' && iso <= this.today && !e.order ? [{ label: 'Stattdessen bestellt', icon: 'order', action: () => this.openOrder(iso, slot, e) }] : []),
      { label: 'Duplizieren', icon: 'copy', action: () => this.openPicker('duplicate', { iso, slot, id: e.id, title: this.titleOf(e) }) },
      { label: 'Verschieben', icon: 'calendar-plus', action: () => this.openPicker('move', { iso, slot, id: e.id, title: this.titleOf(e) }) },
    ];
    for (const w of ['E', 'J']) {
      if (e.who !== w) items.push({ label: `Nur ${PEOPLE[w]}`, icon: 'user', action: () => this.setWho(iso, slot, e.id, w) });
    }
    if (e.who) items.push({ label: 'Für beide', icon: 'users', action: () => this.setWho(iso, slot, e.id, null) });
    if (recipe) items.push({ label: 'Rezept öffnen', icon: 'recipe', action: () => this.showRecipe(recipe.id) });
    if (recipe?.ingredients.length) items.push({ label: 'Zutaten einkaufen', icon: 'shop', action: () => this.openIngredients(recipe.id) });
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
    this.withUndo(`„${this.dishTitle(e, iso)}" entfernt`, () => removeEntry(this.db.plan, iso, slot, id));
  },

  clearDay(iso) {
    this.withUndo(`${WEEKDAYS[weekdayIndex(iso)]} geleert`, () => { delete this.db.plan[iso]; });
  },

  async exportWeek() {
    const text = weekText(this.db.plan, this.monday, (e, iso) => this.exportTitle(e, iso));
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
    if (e?.order) { this.openOrder(iso, slot, e); return; }
    this.entry = {
      iso, slot, id: e?.id || null,
      title: e ? this.titleOf(e) : '',
      recipeId: e?.recipeId || null,
      note: e?.note || '',
      noteOpen: !!e?.note,
      asRecipe: false,
      focus: false,
      leftover: !!e?.leftover,
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
    const leftover = f.leftover && title === LEFTOVER_TITLE;
    if (f.id) updateEntry(this.db.plan, f.iso, f.slot, f.id, { title, recipeId, note, leftover });
    else addEntry(this.db.plan, f.iso, f.slot, { title, recipeId, note, leftover });
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

  // Das Detail gleitet per x-transition herein (reine CSS-Transformation). Eine View
  // Transition müsste vorher die ganze Seite abfotografieren — auf dem Handy spürbar langsam.
  openDetail(id) {
    this.checked = {};
    if (this.detailId && this.isOpen('detail')) { this.detailId = id; this.$nextTick(() => this.$refs.detailScroller?.scrollTo({ top: 0 })); return; }
    this.detailId = id;
    this.openLayer('detail');
    this.$nextTick(() => this.$refs.detailScroller?.scrollTo({ top: 0 }));
  },

  closeDetail() {
    if (this.isOpen('detail')) this.closeLayer('detail');
    else this.detailId = null;
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

  async saveEditor() {
    const ed = this.editor;
    const title = ed.title.trim();
    if (!title) { ed.error = 'Der Titel fehlt.'; this.$refs.editorTitle?.focus(); return; }
    const twin = ed.isNew ? similarRecipes(this.db.recipes, title, ed.id).find((d) => d.score >= 0.9) : null;
    if (twin) {
      const ok = await this.confirm('Gibt es schon?', `„${twin.recipe.title}" ist sehr ähnlich. Trotzdem als neues Rezept speichern?`, 'Speichern');
      if (!ok || this.editor !== ed) return;
      await this.afterPop();
    }
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
    this.noteBackup();
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
      this.noteBackup();
    } catch (e) {
      if (e?.name !== 'AbortError') this.notify('Teilen nicht möglich – bitte herunterladen.', { tone: 'error' });
    }
  },

  saveDriveClient() {
    const cur = readJson(DRIVE_KEY, {}) || {};
    writeJson(DRIVE_KEY, { ...cur, clientId: this.backup.clientId.trim() });
  },

  async driveBackup({ silent = false } = {}) {
    const b = this.backup;
    if (b.busy) return false;
    if (!b.clientId.trim()) { if (!silent) this.notify('Zuerst die Google-Client-ID eintragen.', { tone: 'error' }); return false; }
    this.saveDriveClient();
    b.busy = true;
    b.status = silent ? 'Wöchentliche Sicherung läuft …' : 'Verbinde mit Google Drive …';
    try {
      const cur = readJson(DRIVE_KEY, {}) || {};
      const name = backupName();
      const res = await uploadToDrive({ clientId: b.clientId.trim(), blob: this.backupBlob(), name, folder: cur.folderId || null, keep: 3, silent });
      writeJson(DRIVE_KEY, { ...(readJson(DRIVE_KEY, {}) || {}), clientId: b.clientId.trim(), folderId: res.folderId, last: Date.now() });
      this.noteBackup();
      b.status = `Gespeichert in „Week Planner Sicherungen": ${name}${res.removed ? ` · ${res.removed} ältere entfernt` : ''}`;
      this.notify(silent ? 'Wöchentliche Sicherung in Google Drive gespeichert' : 'Sicherung in Google Drive gespeichert', { tone: 'ok' });
      return true;
    } catch (e) {
      b.status = e?.message || 'Hochladen fehlgeschlagen.';
      if (silent) this.notify('Die wöchentliche Sicherung braucht eine Anmeldung: Einstellungen → „In Drive sichern".', { tone: 'error', ms: 6000 });
      return false;
    } finally {
      b.busy = false;
    }
  },

  noteBackup() {
    writeJson(BACKUP_KEY, Date.now());
    this._backupTick = Date.now();
  },

  get lastDrive() {
    const t = readJson(DRIVE_KEY, {})?.last;
    return t ? new Date(t).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  },

  /** „Letzte Sicherung vor 3 Tagen" — über alle Wege (ZIP, Teilen, Drive). */
  get lastBackupText() {
    void this._backupTick;
    const t = Math.max(Number(readJson(BACKUP_KEY, 0)) || 0, Number(readJson(DRIVE_KEY, {})?.last) || 0);
    if (!t) return 'Noch keine Sicherung erstellt';
    const days = daysBetween(isoDate(new Date(t)), this.today);
    return `Letzte Sicherung ${days <= 0 ? 'heute' : days === 1 ? 'gestern' : `vor ${days} Tagen`}`;
  },

  setBackupAuto(on) {
    this.backupAuto = on;
    writeJson(DRIVE_KEY, { ...(readJson(DRIVE_KEY, {}) || {}), auto: on });
    if (on) this.armAutoBackup();
  },

  // Wöchentlich automatisch: Google verlangt für die Anmeldung eine Nutzergeste, darum
  // läuft die fällige Sicherung beim ersten Antippen nach dem Öffnen der App (still,
  // mit der einmal erteilten Freigabe).
  armAutoBackup() {
    const d = readJson(DRIVE_KEY, {}) || {};
    if (!d.auto || !d.clientId || this._autoArmed) return;
    if (Date.now() - (Number(d.last) || 0) < WEEK_MS) return;
    this._autoArmed = true;
    const run = () => {
      document.removeEventListener('click', run, true);
      this._autoArmed = false;
      if (this.locked) { this.armAutoBackup(); return; }
      this.driveBackup({ silent: true });
    };
    document.addEventListener('click', run, true);
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
        this.db.recipes = s.recipes; this.db.plan = s.plan; this.db.shopping = s.shopping; this.db.pantry = s.pantry; this.db.restaurants = s.restaurants;
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
        this.$nextTick(() => { this.setupDrag(); this.scrollToToday(false); this.afterUnlock(); });
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
    if (n >= before) return;
    if (belowMin(item)) { this.restockBelowMin(item); return; }
    if (before > 0 && n === 0) this.askRestock(item);
  },

  // Mindestbestand unterschritten: ohne Rückfrage auf die Einkaufsliste (ohne Laden).
  restockBelowMin(item) {
    if (this.db.shopping.items.some((it) => keyOf(it.name) === keyOf(item.name))) return;
    this.addShopItem(item.name, { store: null, silent: true });
    this.notify(`„${item.name}" unter Mindestbestand (${item.min}) – steht jetzt auf der Einkaufsliste`, { tone: 'ok' });
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
    this.pantryEdit = { id: item.id, name: item.name, place: item.place, qty: item.qty, min: item.min || 0 };
    this.openLayer('pantry-item');
  },

  savePantryEdit() {
    const f = this.pantryEdit;
    const item = this.db.pantry.items.find((it) => it.id === f.id);
    const name = f.name.trim();
    if (!item || !name) { this.closeLayer('pantry-item'); return; }
    item.name = name;
    item.place = f.place;
    const min = Math.max(0, Math.min(999, Math.round(Number(f.min) || 0)));
    if (min) item.min = min;
    else delete item.min;
    this.closeLayer('pantry-item');
    this.setPantryQty(item, f.qty);
    if (belowMin(item)) this.restockBelowMin(item);
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
        if (it.qty === 0 || belowMin(it)) names.push(it);
      }
    });
    this.closeLayer('bricks');
    for (const it of names) {
      if (belowMin(it)) this.restockBelowMin(it);
      else await this.askRestock(it);
    }
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
      { label: 'Wiederkehrende Einkäufe', icon: 'repeat', action: () => { this.recurringBox = true; this.openLayer('recurring'); } },
      { label: 'Ganze Liste leeren', icon: 'trash', danger: true, action: () => this.clearShopping() },
    ]);
  },

  openItemEdit(item) {
    this.shopEdit = { id: item.id, name: item.name, store: item.store, dept: item.dept || 'other', weeks: recurringOf(this.db.shopping, item.name)?.weeks || 0 };
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
    const was = recurringOf(this.db.shopping, name);
    if ((was?.weeks || 0) !== f.weeks || (was && was.store !== item.store)) setRecurring(this.db.shopping, item, f.weeks, this.today);
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

  // ------------------------------------------------------------ Hilfen für Ebenen

  /** Wartet, bis ein laufender Rücksprung (history.go) angekommen ist. */
  afterPop() {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => (this._popping > 0 && Date.now() - start < 900 ? setTimeout(tick, 30) : resolve());
      tick();
    });
  },

  // ------------------------------------------------------------ Anzeige von Einträgen

  restaurantName(id) {
    return id ? this.db.restaurants.find((r) => r.id === id)?.name || '' : '';
  },

  /** Angezeigter Titel: Rest zeigt das Abendessen des Vortags, Bestellung das Restaurant. */
  dishTitle(e, iso) {
    if (e.leftover) {
      const prev = previousDinner(this.db.plan, iso);
      return prev.length ? prev.map((x) => this.dishTitle(x, addDays(iso, -1))).join(' + ') : LEFTOVER_TITLE;
    }
    if (e.order) return this.restaurantName(e.order.rid) || ORDER_TITLE;
    return this.titleOf(e);
  },

  dishNote(e) {
    if (e.leftover) return 'Rest von gestern Abend';
    if (e.order) return ['Bestellt', e.order.amount ? fmtEuro(e.order.amount) : '', e.order.instead ? `statt ${e.order.instead}` : ''].filter(Boolean).join(' · ');
    return this.noteLabel(e);
  },

  dishIcon(e) {
    if (e.leftover) return 'leftover';
    if (e.order) return 'order';
    return e.recipeId ? 'recipe' : '';
  },

  exportTitle(e, iso) {
    if (e.leftover) {
      const prev = previousDinner(this.db.plan, iso);
      return prev.length ? `Rest von gestern (${prev.map((x) => this.dishTitle(x, addDays(iso, -1))).join(' + ')})` : LEFTOVER_TITLE;
    }
    if (e.order) {
      const name = this.restaurantName(e.order.rid);
      return name ? `Bestellt bei ${name}` : ORDER_TITLE;
    }
    return this.titleOf(e);
  },

  // ------------------------------------------------------------ Kopfleiste Wochenplan

  planMenu(ev) {
    this.openMenu(ev, [
      { label: 'Kopieren', icon: 'copy', action: () => this.exportWeek() },
      { label: 'Statistiken', icon: 'stats', action: () => this.openStats() },
      { label: 'Einstellungen', icon: 'settings', action: () => this.openSettings() },
    ]);
  },

  // ------------------------------------------------------------ Rest von gestern

  hasPrevDinner(iso) {
    return previousDinner(this.db.plan, iso).length > 0;
  },

  markLeftover(iso) {
    const prev = previousDinner(this.db.plan, iso);
    this.withUndo(prev.length ? `Mittag: Rest von „${this.dishTitle(prev[0], addDays(iso, -1))}"` : 'Mittag: Rest von gestern', () => {
      addEntry(this.db.plan, iso, 'lunch', { title: LEFTOVER_TITLE, leftover: true });
    });
  },

  // ------------------------------------------------------------ Stattdessen bestellt

  openOrder(iso, slot, e = null, { title = '' } = {}) {
    const fromEntry = this.isOpen('entry');
    const o = e?.order || null;
    const usage = restaurantUsage(this.db.plan);
    const first = [...this.db.restaurants].sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0))[0];
    this.order = {
      iso, slot, id: e?.id || null, editing: !!o,
      instead: o ? o.instead : (e ? this.titleOf(e) : title).trim(),
      amount: o?.amount ? String(o.amount).replace('.', ',') : '',
      rid: o ? o.rid : first?.id || null,
      adding: !this.db.restaurants.length, newName: '', fromEntry,
    };
    this.openLayer('order');
    setTimeout(() => (this.order?.adding ? this.$refs.orderNew : this.$refs.orderAmount)?.focus(), 80);
  },

  orderFromEntry() {
    const f = this.entry;
    if (!f) return;
    const e = f.id ? findEntry(this.db.plan, f.iso, f.slot, f.id) : null;
    this.openOrder(f.iso, f.slot, e, { title: e ? '' : f.title });
  },

  get restaurantChoices() {
    const usage = restaurantUsage(this.db?.plan || {});
    return [...(this.db?.restaurants || [])].sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0) || a.name.localeCompare(b.name, 'de'));
  },

  get orderValid() {
    const o = this.order;
    if (!o) return false;
    return o.adding ? !!o.newName.trim() || !!o.rid : true;
  },

  saveOrder() {
    const o = this.order;
    if (!o) return;
    let rid = o.rid;
    if (o.adding && o.newName.trim()) rid = addRestaurant(this.db.restaurants, o.newName).id;
    const order = { rid, amount: o.amount, instead: o.instead };
    const name = this.restaurantName(rid);
    this.withUndo(name ? `Bestellt bei ${name}` : 'Als bestellt eingetragen', () => {
      if (o.id) updateEntry(this.db.plan, o.iso, o.slot, o.id, { order, recipeId: null, leftover: false, title: ORDER_TITLE, note: '' });
      else addEntry(this.db.plan, o.iso, o.slot, { title: ORDER_TITLE, order });
    });
    this.closeLayer(o.fromEntry ? 'entry' : 'order');
  },

  /** Bestellung zurücknehmen: das ursprüngliche Gericht kommt wieder, sonst fällt der Eintrag weg. */
  undoOrder() {
    const o = this.order;
    if (!o?.id) return;
    this.closeLayer('order');
    this.withUndo('Bestellung entfernt', () => {
      if (o.instead) updateEntry(this.db.plan, o.iso, o.slot, o.id, { order: null, title: o.instead });
      else removeEntry(this.db.plan, o.iso, o.slot, o.id);
    });
  },

  async deleteRestaurant(r) {
    const ok = await this.confirm(`„${r.name}" entfernen?`, 'Bisherige Bestellungen bleiben erhalten, nur ohne Restaurantnamen.');
    if (!ok) return;
    this.db.restaurants = this.db.restaurants.filter((x) => x.id !== r.id);
    if (this.order?.rid === r.id) this.order.rid = null;
    this.commit();
  },

  // ------------------------------------------------------------ Abendessen-Vorschläge

  openSuggest(iso) {
    this.suggestBox = { iso, items: this.drawSuggestions(iso) };
    this.openLayer('suggest');
  },

  drawSuggestions(iso) {
    const store = readJson(SUGGEST_KEY, {}) || {};
    const items = suggestDinners({ recipes: this.db.recipes, plan: this.db.plan, iso, today: this.today, shown: store.shown || {} });
    writeJson(SUGGEST_KEY, { shown: rememberShown(store.shown, items.map((i) => i.key)) });
    return items;
  },

  reshuffleSuggest() {
    if (this.suggestBox) this.suggestBox.items = this.drawSuggestions(this.suggestBox.iso);
  },

  sinceLabel(days) {
    if (days == null) return 'noch nie gekocht';
    if (days <= 0) return 'heute';
    if (days < 14) return `vor ${days} Tagen`;
    if (days < 70) return `vor ${Math.round(days / 7)} Wochen`;
    return `vor ${Math.round(days / 30)} Monaten`;
  },

  pickSuggestDinner(item) {
    const iso = this.suggestBox?.iso;
    if (!iso) return;
    this.closeLayer('suggest');
    this.withUndo(`Abendessen: ${item.title}`, () => addEntry(this.db.plan, iso, 'dinner', { title: item.title, recipeId: item.recipeId }));
  },

  // ------------------------------------------------------------ Zutaten auf die Einkaufsliste

  openIngredients(recipeId) {
    const r = this.recipesById[recipeId];
    if (!r?.ingredients.length) { this.notify('Dieses Rezept hat keine Zutaten.'); return; }
    const onList = new Set(this.db.shopping.items.map((it) => keyOf(it.name)));
    const rows = r.ingredients.map((line, i) => {
      const name = ingredientName(line);
      const p = pantryMatch(line, this.db.pantry.items);
      const listed = onList.has(keyOf(name));
      return {
        i, line, name,
        hint: p ? `Im Vorrat: ${p.name} (${p.qty}, ${placeOf(p.place).short})` : listed ? 'Steht schon auf der Einkaufsliste' : '',
        checked: !p && !listed,
      };
    });
    this.ingredientsBox = { recipeId, title: r.title, rows };
    this.openLayer('ingredients');
  },

  get ingredientsCount() {
    return this.ingredientsBox?.rows.filter((r) => r.checked).length || 0;
  },

  addIngredients() {
    const box = this.ingredientsBox;
    if (!box) return;
    const rows = box.rows.filter((r) => r.checked && r.name);
    this.closeLayer('ingredients');
    if (!rows.length) return;
    const snap = this.snapshot();
    for (const r of rows) this.addShopItem(r.name, { store: null, silent: true });
    this.notify(rows.length === 1 ? `„${rows[0].name}" steht auf der Einkaufsliste` : `${rows.length} Zutaten auf der Einkaufsliste`, { undo: snap });
  },

  // ------------------------------------------------------------ Kochhistorie

  get detailHistory() {
    return this.detail ? cookHistory(this.db.plan, this.detail.id, this.today) : { cooked: [], planned: [], count: 0, last: null, daysSince: null, next: null };
  },

  get editorDupes() {
    const ed = this.editor;
    if (!ed || ed.title.trim().length < 3) return [];
    return similarRecipes(this.db.recipes, ed.title, ed.id);
  },

  shortDate(iso) {
    return `${WEEKDAYS_SHORT[weekdayIndex(iso)]} ${dayMonth(iso)}`;
  },

  // ------------------------------------------------------------ Küche: Heute

  openKitchen() {
    this.kitchenOpen = {};
    const first = this.kitchenDinner[0];
    if (first?.recipe) this.kitchenOpen[first.e.id] = true;
    this.openLayer('kitchen');
    this.requestWakeLock();
  },

  async requestWakeLock() {
    try { this._wake = await navigator.wakeLock?.request('screen'); } catch { this._wake = null; }
  },

  releaseWakeLock() {
    try { this._wake?.release(); } catch { /* schon frei */ }
    this._wake = null;
  },

  kitchenEntries(iso, slot) {
    return (this.db.plan[iso]?.slots?.[slot] || []).map((e) => {
      const base = e.leftover ? previousDinner(this.db.plan, iso)[0] : e;
      const recipe = base?.recipeId ? this.recipesById[base.recipeId] || null : null;
      return { e, iso, title: this.dishTitle(e, iso), note: this.dishNote(e), recipe, video: recipe?.video ? videoEmbed(recipe.video) : null };
    });
  },

  get kitchenDinner() {
    return this.db ? this.kitchenEntries(this.today, 'dinner') : [];
  },

  get kitchenTomorrow() {
    const iso = addDays(this.today, 1);
    return {
      iso,
      label: this.dayLabel(iso),
      breakfast: this.kitchenEntries(iso, 'breakfast'),
      lunch: this.kitchenEntries(iso, 'lunch'),
      dinner: this.kitchenEntries(iso, 'dinner').map((k) => {
        const freezer = this.db.pantry.items.filter((it) => it.place.startsWith('freezer'));
        const thaw = pantryMatch(k.title, freezer) || (k.recipe ? k.recipe.ingredients.map((l) => pantryMatch(l, freezer)).find(Boolean) : null);
        return { ...k, thaw };
      }),
    };
  },

  // ------------------------------------------------------------ Statistik

  openStats() {
    this.statsView = { kind: this.statsView.kind || 'month', anchor: this.today };
    this.openLayer('stats');
  },

  get statsPeriod() {
    return periodOf(this.statsView.kind, this.statsView.anchor);
  },

  statsFor(period) {
    const first = firstSeen(this.db.plan);
    const opt = { today: this.today, titleOf: (e) => this.titleOf(e), first };
    const cur = computeStats(this.db, period, opt);
    const prevPeriod = periodOf(period.kind, shiftPeriod(period.kind, period.start, -1));
    const prev = computeStats(this.db, prevPeriod, opt);
    return { cur, prev, prevPeriod, compare: compareStats(cur, prev) };
  },

  get statsData() {
    if (!this.db) return null;
    return this.statsFor(this.statsPeriod);
  },

  setStatsKind(kind) {
    this.statsView = { kind, anchor: this.statsView.anchor > this.today ? this.today : this.statsView.anchor };
  },

  shiftStats(dir) {
    const next = shiftPeriod(this.statsView.kind, this.statsPeriod.start, dir);
    if (dir > 0 && next > this.today) return;
    this.statsView = { ...this.statsView, anchor: next };
  },

  get statsCanNext() {
    return shiftPeriod(this.statsView.kind, this.statsPeriod.start, 1) <= this.today;
  },

  compareWord(kind) {
    return { week: 'zur Vorwoche', month: 'zum Vormonat', year: 'zum Vorjahr' }[kind];
  },

  euro(n) {
    return fmtEuro(n);
  },

  pct(n) {
    return fmtPct(n);
  },

  diffText(row) {
    return fmtDiff(row);
  },

  ratingText(v) {
    return v == null ? '' : this.fmtRating(v);
  },

  // ------------------------------------------------------------ Nährwerte (KI)

  nutriFor(period) {
    return this.nutri[period.key] || null;
  },

  async estimateNutrition(period) {
    if (!this.settings.keys.length) { this.notify('Für die Schätzung zuerst einen Gemini-Schlüssel in den Einstellungen hinterlegen.', { tone: 'error' }); return; }
    const end = period.end < this.today ? period.end : this.today;
    const dishes = periodDishes(this.db.plan, this.db.recipes, { start: period.start, end }, (e, iso) => this.dishTitle(e, iso));
    if (!Object.keys(dishes).length) { this.notify('In diesem Zeitraum ist nichts eingetragen.'); return; }
    const sig = nutriSignature(dishes);
    const box = { busy: true, error: '', status: `Schätze mit ${modelLabel(nutriModels()[0])} …`, data: this.nutri[period.key]?.data || null, sig };
    this.nutri = { ...this.nutri, [period.key]: box };
    try {
      const data = await generateJson({
        keys: this.settings.keys, models: nutriModels(), quota,
        system: NUTRI_SYSTEM, prompt: nutriPrompt(dishes), schema: NUTRI_SCHEMA,
        temperature: 0.3, maxOutputTokens: 2048, thinking: 'low', timeoutMs: 40000, accept: acceptNutrition,
        onRetry: ({ next }) => { if (next) this.nutri[period.key].status = `Weiter mit ${modelLabel(next)} …`; },
      });
      this.nutri[period.key] = { busy: false, error: '', status: '', data: readNutrition(data), sig, at: Date.now() };
      const keep = Object.fromEntries(Object.entries(this.nutri).filter(([, v]) => v?.data && !v.busy).slice(-24).map(([k, v]) => [k, { data: v.data, sig: v.sig, at: v.at }]));
      writeJson(NUTRI_KEY, keep);
    } catch (e) {
      this.nutri[period.key] = { ...this.nutri[period.key], busy: false, error: e?.message || 'Keine Schätzung erhalten.' };
    }
  },

  nutriStale(period) {
    const n = this.nutri[period.key];
    if (!n?.data || !n.sig) return false;
    const end = period.end < this.today ? period.end : this.today;
    return n.sig !== nutriSignature(periodDishes(this.db.plan, this.db.recipes, { start: period.start, end }, (e, iso) => this.dishTitle(e, iso)));
  },

  // ------------------------------------------------------------ Rückblick (Wrapped)

  hasData(period) {
    return Object.keys(this.db.plan).some((iso) => iso >= period.start && iso <= period.end);
  },

  checkWrapped() {
    if (this.locked || this.layers.length) return;
    const seen = readJson(WRAP_KEY, {}) || {};
    const queue = [];
    const m = periodOf('month', shiftPeriod('month', this.today, -1));
    if (seen.month !== m.key && this.hasData(m)) queue.push({ kind: 'month', anchor: m.start });
    const y = periodOf('year', shiftPeriod('year', this.today, -1));
    if (this.today.slice(5, 7) === '01' && seen.year !== y.key && this.hasData(y)) queue.push({ kind: 'year', anchor: y.start });
    writeJson(WRAP_KEY, { ...seen, month: m.key, ...(this.today.slice(5, 7) === '01' ? { year: y.key } : {}) });
    if (!queue.length) return;
    this._wrapQueue = queue.slice(1);
    this.openWrapped(queue[0].kind, queue[0].anchor);
  },

  openWrapped(kind, anchor) {
    const period = periodOf(kind, anchor);
    const { cur, compare, prevPeriod } = this.statsFor(period);
    const slides = ['intro', 'cooked'];
    if (cur.firsts.length) slides.push('fresh');
    if (cur.dinnerDays) slides.push('orders');
    if (compare.length) slides.push('compare');
    slides.push('nutri', 'outro');
    this.wrapped = { kind, period, prevPeriod, stats: cur, compare, slides, slide: 0, sharing: false, run: Date.now() };
    if (this.isOpen('stats')) this.closeLayer('stats');
    const open = () => { this.openLayer('wrapped'); this.wrapTimer(); };
    if (this._popping > 0) this.afterPop().then(open);
    else open();
  },

  get wrapSlide() {
    return this.wrapped ? this.wrapped.slides[this.wrapped.slide] : '';
  },

  wrapTimer() {
    clearTimeout(this._wrapTimer);
    const w = this.wrapped;
    if (!w || ['nutri', 'outro'].includes(this.wrapSlide)) return;
    this._wrapTimer = setTimeout(() => this.wrapStep(1), 9000);
  },

  wrapStep(dir) {
    const w = this.wrapped;
    if (!w) return;
    const next = w.slide + dir;
    if (next < 0) return;
    if (next >= w.slides.length) { this.closeLayer('wrapped'); return; }
    w.slide = next;
    w.run = Date.now();
    this.wrapTimer();
  },

  wrapTap(ev) {
    if (ev.target.closest('button, a, input')) return;
    const r = ev.currentTarget.getBoundingClientRect();
    this.wrapStep(ev.clientX - r.left < r.width * 0.32 ? -1 : 1);
  },

  wrappedClosed() {
    clearTimeout(this._wrapTimer);
    this.wrapped = null;
    const next = this._wrapQueue?.shift();
    if (next) setTimeout(() => this.openWrapped(next.kind, next.anchor), 450);
  },

  async shareWrapped() {
    const w = this.wrapped;
    if (!w || w.sharing) return;
    w.sharing = true;
    try {
      const blob = await renderWrappedImage({
        title: w.kind === 'month' ? w.period.short : w.period.label,
        sub: w.kind === 'month' ? `Rückblick ${w.period.label}` : 'Jahresrückblick',
        stats: w.stats, compare: w.compare, compareLabel: this.compareWord(w.kind).replace(/^z/, 'Z'),
      });
      const file = new File([blob], `rueckblick-${w.period.key.slice(1)}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `Unser ${w.period.label} in der Küche` });
      } else {
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file.name });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        this.notify('Bild gespeichert – Teilen geht direkt nur auf dem Handy.');
      }
    } catch (e) {
      if (e?.name !== 'AbortError') this.notify('Das Bild konnte nicht geteilt werden.', { tone: 'error' });
    } finally {
      if (this.wrapped === w) w.sharing = false;
    }
  },

  // ------------------------------------------------------------ Einkauf: verfügbar ab, Vorrat, Wiederholung

  openAvail(item) {
    this.availBox = { id: item.id, name: item.name, from: item.from || null };
    this.openLayer('avail');
  },

  setAvail(wd) {
    const box = this.availBox;
    const item = box && this.db.shopping.items.find((it) => it.id === box.id);
    this.closeLayer('avail');
    if (!item) return;
    const from = wd == null ? null : nextWeekday(this.today, wd);
    if (from && from > this.today) item.from = from;
    else delete item.from;
    this.commit();
  },

  weekdayOf(iso) {
    return weekdayIndex(iso);
  },

  dayMonthOf(iso) {
    return dayMonth(iso);
  },

  nextWeekdayIso(wd) {
    return nextWeekday(this.today, wd);
  },

  availLabel(item) {
    return item.from && item.from > this.today ? `ab ${WEEKDAYS_SHORT[weekdayIndex(item.from)]}.` : '';
  },

  recurLabel(item) {
    const r = recurringOf(this.db.shopping, item.name);
    return r ? (r.weeks === 1 ? 'jede Woche' : `alle ${r.weeks} Wo.`) : '';
  },

  checkToPantry(item) {
    const snap = this.snapshot();
    const place = placeForProduct(this.db.pantry, item.name, item.dept);
    const res = addPantryItem(this.db.pantry, { name: item.name, qty: Math.max(1, item.qty || 1), place });
    this.db.shopping.items = this.db.shopping.items.filter((it) => it.id !== item.id);
    this.commit();
    navigator.vibrate?.([10, 40, 10]);
    this.notify(`„${res.item.name}" im Vorrat: ${placeOf(res.item.place).short}${res.merged ? ` · jetzt ${res.item.qty}` : ''}`, { undo: snap });
  },

  runRecurring() {
    if (!this.db) return;
    const added = applyRecurring(this.db.shopping, this.today);
    if (!added.length) return;
    this.commit();
    for (const n of added) this.queueClassify(n);
    this.notify(added.length === 1 ? `„${added[0]}" ist wieder fällig und steht auf der Liste` : `${added.length} wiederkehrende Einkäufe stehen auf der Liste`, { tone: 'ok' });
  },

  removeRecurring(r) {
    this.db.shopping.recurring = this.db.shopping.recurring.filter((x) => x.key !== r.key);
    this.commit();
  },

  // ------------------------------------------------------------ Teilen an die App

  // Teilen-Ziel (Manifest share_target): Text/Link aus Instagram & Co. landet im KI-Import.
  handleShareTarget() {
    const q = new URLSearchParams(location.search);
    if (!['share_title', 'share_text', 'share_url'].some((k) => q.has(k))) return false;
    const text = [q.get('share_title'), q.get('share_text'), q.get('share_url')].map((v) => String(v || '').trim()).filter(Boolean)
      .filter((v, i, all) => all.indexOf(v) === i).join('\n');
    history.replaceState({ wp: 0 }, '', location.pathname);
    if (!text) return false;
    this.tab = 'recipes';
    this.openEditor();
    this.editor.importText = text;
    this.editor.importOpen = true;
    if (this.settings.keys.length && text.length >= 15) this.$nextTick(() => this.runImport());
    else if (!this.settings.keys.length) { this.editor.status = 'Geteilter Text ist eingefügt. Für den Import fehlt noch ein Gemini-Schlüssel.'; this.editor.statusTone = 'error'; }
    return true;
  },

  // ------------------------------------------------------------ Werkzeuge: Harry-Potter-Hörbücher

  async hpInit() {
    this.hp.canHandles = canPickHandles();
    const saved = readJson(HP_KEY, {}) || {};
    if (saved.pos?.book) this.hp.pos = { book: saved.pos.book, track: saved.pos.track || 0, time: saved.pos.time || 0 };
    this.hp.sleep = saved.sleep || 0;
    this.hp.lib = await loadLibrary();
  },

  hpState() {
    return readJson(HP_KEY, {}) || {};
  },

  hpSave(extra = {}) {
    if (!this.hp) return;
    const cur = this.hpState();
    const pos = { ...this.hp.pos, time: hpAudio && this.hp.loaded ? hpAudio.currentTime : this.hp.pos.time };
    const positions = { ...(cur.positions || {}), [pos.book]: { track: pos.track, time: pos.time } };
    writeJson(HP_KEY, { ...cur, pos, positions, sleep: this.hp.sleep, ...extra });
  },

  get hpCounts() {
    const out = {};
    for (const b of BOOKS) out[b.no] = this.hp.lib[b.no]?.tracks?.length || 0;
    return out;
  },

  get hpHasAny() {
    return Object.values(this.hpCounts).some((n) => n > 0);
  },

  get hpBook() {
    return BOOKS.find((b) => b.no === this.hp.pos.book) || BOOKS[0];
  },

  get hpTrackName() {
    const t = this.hp.lib[this.hp.pos.book]?.tracks?.[this.hp.pos.track];
    return t ? t.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ') : '';
  },

  hpClock(sec) {
    return fmtClock(sec);
  },

  openHp() {
    this.hp.error = '';
    const st = this.hpState();
    if (markDue(st.mark)) {
      const m = st.mark;
      const wasPlaying = this.hp.playing;
      if (!wasPlaying) {
        this.hp.pos = { book: m.book, track: m.track, time: m.time };
        this.hp.loaded = false;
        this.hp.current = m.time;
        this.hp.notice = `Startpunkt von gestern Abend übernommen (${this.hpBook.roman} · ${fmtClock(m.time)}, ${new Date(m.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr)`;
      }
      writeJson(HP_KEY, { ...st, mark: { ...m, applied: true }, pos: this.hp.pos });
    }
    if (!this.hp.loaded) this.hp.current = this.hp.pos.time;
    this.openLayer('hp');
    // Titel gleich bereitlegen (ohne abzuspielen): erst mit bekannter Dauer lässt sich spulen.
    // Der Klick auf die Kachel ist die Nutzergeste, die ein gemerkter Dateigriff ggf. braucht.
    this.hpPrepare();
  },

  async hpPrepare() {
    if (this.hp.loaded || !this.hpCounts[this.hp.pos.book]) return;
    await this.hpLoad(this.hp.pos, false);
  },

  hpEnsureAudio() {
    if (hpAudio) return hpAudio;
    hpAudio = new Audio();
    hpAudio.preload = 'auto';
    const a = hpAudio;
    a.addEventListener('timeupdate', () => this.hpTick());
    a.addEventListener('loadedmetadata', () => {
      this.hp.duration = a.duration || 0;
      const durations = { ...(this.hpState().durations || {}) };
      durations[this.hp.pos.book] = { ...(durations[this.hp.pos.book] || {}), [this.hp.pos.track]: a.duration };
      this.hpSave({ durations });
    });
    a.addEventListener('play', () => { this.hp.playing = true; this._hpCont ||= { start: Date.now() }; this.hpMediaState(); });
    a.addEventListener('pause', () => { this.hp.playing = false; this._hpCont = null; this.hpSave(); this.hpMediaState(); });
    a.addEventListener('ended', () => this.hpNext());
    a.addEventListener('error', () => { this.hp.error = 'Diese Datei lässt sich nicht abspielen.'; this.hp.playing = false; });
    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      const set = (k, fn) => { try { ms.setActionHandler(k, fn); } catch { /* nicht unterstützt */ } };
      set('play', () => this.hpToggle(true));
      set('pause', () => this.hpToggle(false));
      set('seekbackward', () => this.hpSkip(-1));
      set('seekforward', () => this.hpSkip(1));
      set('previoustrack', () => this.hpSkip(-5));
      set('nexttrack', () => this.hpSkip(5));
      set('seekto', (d) => { if (d.seekTime != null) { a.currentTime = d.seekTime; this._hpCont = null; } });
    }
    return a;
  },

  hpMediaState() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: this.hpTrackName || this.hpBook.title,
        artist: `Harry Potter ${this.hpBook.roman}`,
        album: `Harry Potter und ${this.hpBook.title.replace(/^Der |^Die |^Das /, (m) => m.toLowerCase())}`,
      });
      navigator.mediaSession.playbackState = this.hp.playing ? 'playing' : 'paused';
    } catch { /* egal */ }
  },

  async hpLoad(pos, autoplay) {
    const a = this.hpEnsureAudio();
    this.hp.error = '';
    try {
      const file = await trackFile(this.hp.lib, pos.book, pos.track);
      if (hpUrl) URL.revokeObjectURL(hpUrl);
      hpUrl = URL.createObjectURL(file);
      this.hp.pos = { ...pos };
      this.hp.loaded = true;
      a.src = hpUrl;
      await new Promise((resolve) => {
        const done = () => { a.removeEventListener('loadedmetadata', done); resolve(); };
        a.addEventListener('loadedmetadata', done);
        setTimeout(done, 4000);
      });
      try { a.currentTime = Math.min(pos.time || 0, Math.max(0, (a.duration || Infinity) - 1)); } catch { /* Anfang */ }
      this.hp.current = a.currentTime;
      if (autoplay) await a.play();
      this.hpMediaState();
      this.hpSave();
    } catch (e) {
      this.hp.loaded = false;
      this.hp.playing = false;
      this.hp.error = e?.name === 'NotAllowedError' ? 'Zum Abspielen bitte noch einmal tippen.' : e?.message || 'Die Datei konnte nicht geladen werden.';
    }
  },

  async hpToggle(force = null) {
    const a = this.hpEnsureAudio();
    const play = force ?? a.paused;
    if (!play) { a.pause(); return; }
    this.hp.notice = '';
    if (!this.hp.loaded) { await this.hpLoad(this.hp.pos, true); return; }
    try { await a.play(); } catch { this.hp.error = 'Zum Abspielen bitte noch einmal tippen.'; }
  },

  hpTick() {
    const a = hpAudio;
    if (!a || this.hp.scrub) return;
    this.hp.current = a.currentTime;
    this.hp.pos.time = a.currentTime;
    const now = Date.now();
    if (now - (this._hpSavedAt || 0) > 5000) { this._hpSavedAt = now; this.hpSave(); }
    if (this.hp.sleepUntil) {
      const left = this.hp.sleepUntil - now;
      this.hp.sleepLeft = Math.max(0, Math.ceil(left / 60000));
      if (left <= 0) {
        a.pause();
        a.volume = 1;
        this.hp.sleepUntil = 0;
        this.hp.sleep = 0;
        this.hpSave();
      } else if (left < 15000) a.volume = Math.max(0.05, left / 15000);
    }
    // Abend-Startpunkt: das erste Mal an einem Abend (ab 20 Uhr) 5 Minuten am Stück gehört.
    const c = this._hpCont;
    if (c && !c.marked && now - c.start >= MARK_AFTER_MS) {
      c.marked = true;
      const key = eveningKey(c.start) && eveningKey(now);
      const st = this.hpState();
      if (key && st.mark?.evening !== key) {
        writeJson(HP_KEY, { ...st, mark: { evening: key, book: this.hp.pos.book, track: this.hp.pos.track, time: a.currentTime, at: now, applied: false } });
      }
    }
  },

  async hpNext() {
    const st = this.hpState();
    const next = advance(this.hpCounts, this.hp.pos);
    if (!next) { this.hp.playing = false; return; }
    if (next.book !== this.hp.pos.book) writeJson(HP_KEY, { ...st, positions: { ...(st.positions || {}), [this.hp.pos.book]: { track: 0, time: 0 } } });
    const cont = this._hpCont;
    await this.hpLoad(next, true);
    this._hpCont = cont;
  },

  async hpSkip(minutes) {
    const a = this.hpEnsureAudio();
    this._hpCont = this.hp.playing ? { start: Date.now() } : null;
    const pos = { ...this.hp.pos, time: this.hp.loaded ? a.currentTime : this.hp.pos.time };
    const target = seekAcross(this.hpState().durations, this.hpCounts, pos, minutes * 60);
    if (!this.hp.loaded || target.track !== pos.track || target.book !== pos.book) {
      if (this.hp.loaded) await this.hpLoad(target, this.hp.playing);
      else { this.hp.pos = target; this.hp.current = target.time; this.hpSave(); }
      return;
    }
    a.currentTime = target.time;
    this.hp.current = target.time;
    this.hpSave();
  },

  async hpSelectBook(no) {
    if (no === this.hp.pos.book) return;
    if (!this.hpCounts[no]) { this.notify(`Für Band ${BOOKS[no - 1].roman} sind noch keine Dateien im Bücherregal.`); return; }
    this.hpSave();
    const st = this.hpState();
    const p = st.positions?.[no] || { track: 0, time: 0 };
    const target = { book: no, track: Math.min(p.track || 0, this.hpCounts[no] - 1), time: p.time || 0 };
    this._hpCont = null;
    this.hp.duration = st.durations?.[no]?.[target.track] || 0;
    await this.hpLoad(target, this.hp.playing);
  },

  hpSetSleep(min) {
    this.hp.sleep = min;
    this.hp.sleepUntil = min ? Date.now() + min * 60000 : 0;
    this.hp.sleepLeft = min;
    if (hpAudio) hpAudio.volume = 1;
    this.hpSave();
  },

  get hpDuration() {
    return this.hp.duration || this.hpState().durations?.[this.hp.pos.book]?.[this.hp.pos.track] || 0;
  },

  get hpProgress() {
    const d = this.hpDuration;
    const t = this.hp.scrub ? this.hp.scrub.time : this.hp.current;
    return d ? Math.max(0, Math.min(1, t / d)) : 0;
  },

  // Spulen: waagerecht ziehen; je höher der Daumen über den Regler wandert, desto feiner.
  async hpScrubStart(ev) {
    const el = ev.currentTarget;
    const { clientX, clientY, pointerId } = ev;
    this._hpUp = false;
    if (!this.hpDuration) await this.hpPrepare();
    const d = this.hpDuration;
    if (!d) return;
    try { el.setPointerCapture?.(pointerId); } catch { /* Finger schon weg */ }
    const r = el.getBoundingClientRect();
    const time = ((clientX - r.left) / r.width) * d;
    this.hp.scrub = { x: clientX, y: clientY, startY: clientY, width: r.width, time: Math.max(0, Math.min(d - 0.5, time)), moved: false, ...scrubFactor(0) };
    // Kurzes Antippen, während der Titel noch geladen wurde: direkt dorthin springen.
    if (this._hpUp) this.hpScrubEnd();
  },

  hpScrubMove(ev) {
    const s = this.hp.scrub;
    if (!s) return;
    const d = this.hpDuration;
    const f = scrubFactor(Math.max(0, s.startY - ev.clientY));
    const dx = ev.clientX - s.x;
    if (Math.abs(dx) > 2 || Math.abs(ev.clientY - s.y) > 2) s.moved = true;
    s.time = Math.max(0, Math.min(d - 0.5, s.time + (dx / s.width) * d * f.factor));
    s.x = ev.clientX;
    s.y = ev.clientY;
    s.factor = f.factor;
    s.label = f.label;
  },

  async hpScrubEnd() {
    const s = this.hp.scrub;
    if (!s) { this._hpUp = true; return; }
    this.hp.scrub = null;
    this._hpCont = this.hp.playing ? { start: Date.now() } : null;
    this.hp.current = s.time;
    this.hp.pos.time = s.time;
    if (this.hp.loaded && hpAudio) hpAudio.currentTime = s.time;
    this.hpSave();
  },

  hpScrubKey(ev) {
    const step = { ArrowLeft: -10, ArrowRight: 10, PageDown: -60, PageUp: 60 }[ev.key];
    if (step == null) return;
    ev.preventDefault();
    this.hpSkip(step / 60);
  },

  // Einstellungen: Dateien je Band wählen.
  async hpPickHandles(no) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{ description: 'Hörbuch', accept: { 'audio/*': ['.mp3', '.m4a', '.m4b', '.aac', '.ogg', '.opus', '.wav'] } }],
      });
      if (!handles.length) return;
      const n = await saveHandles(no, handles);
      this.hp.lib = await loadLibrary();
      this.notify(`Band ${BOOKS[no - 1].roman}: ${n} ${n === 1 ? 'Datei' : 'Dateien'} gemerkt`, { tone: 'ok' });
    } catch (e) {
      if (e?.name !== 'AbortError') this.notify('Die Dateien konnten nicht übernommen werden.', { tone: 'error' });
    }
  },

  async hpPickFiles(no, ev) {
    const files = [...(ev.target.files || [])];
    ev.target.value = '';
    if (!files.length) return;
    if (this.hp.pos.book === no && this.hp.loaded) { hpAudio?.pause(); this.hp.loaded = false; }
    this.hp.copying = { book: no, pct: 0, n: 0, total: files.length };
    try {
      const n = await copyFiles(no, files, (pct, i, total) => { this.hp.copying = { book: no, pct, n: i, total }; });
      this.hp.lib = await loadLibrary();
      this.notify(`Band ${BOOKS[no - 1].roman}: ${n} ${n === 1 ? 'Datei' : 'Dateien'} gespeichert`, { tone: 'ok' });
    } catch (e) {
      this.notify(e?.name === 'QuotaExceededError' ? 'Zu wenig Speicherplatz auf dem Gerät.' : 'Die Dateien konnten nicht gespeichert werden.', { tone: 'error' });
    } finally {
      this.hp.copying = null;
    }
  },

  async hpRemoveBook(no) {
    const ok = await this.confirm(`Band ${BOOKS[no - 1].roman} entfernen?`, 'Die gemerkten Dateien werden aus der App entfernt. Die Originale auf dem Gerät bleiben unberührt.');
    if (!ok) return;
    if (this.hp.pos.book === no && this.hp.loaded) { hpAudio?.pause(); this.hp.loaded = false; }
    await removeBook(no);
    this.hp.lib = await loadLibrary();
  },

  hpBookSize(no) {
    const t = this.hp.lib[no]?.tracks || [];
    const mb = t.reduce((n, x) => n + (x.size || 0), 0) / 1048576;
    return t.length ? `${t.length} ${t.length === 1 ? 'Datei' : 'Dateien'} · ${mb >= 1024 ? `${(mb / 1024).toFixed(1).replace('.', ',')} GB` : `${Math.round(mb)} MB`}` : 'Keine Dateien';
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

// Werkzeuge: eigene Komponenten, nur über Ebenen und Meldungen mit der App verbunden.
registerAqua(Alpine);
registerSorter(Alpine);

window.Alpine = Alpine;
Alpine.start();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
