// Aquarium-Helfer: Alpine-Komponente `aqua`. Eigenständig neben der Haushalts-App:
// eigene Daten (`wp-aqua-v1`, Fotos in IndexedDB `wp-tools`), eigene Einstellungen,
// eigene Sicherung. Von der App nutzt sie nur Ebenen (Zurück-Taste), Meldung und Rückfrage.

import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import {
  PARAMS, PARAM, PHASES, MAX_FEED_SLOTS, DAY_MS, uid, sanitizeAqua, emptyAqua, readValues, measurementsOf, seriesOf,
  latestValues, co2FromPhKh, rangeState, fmtValue, fmtWithUnit, fmtRange, waterChangeMarks, nextWaterChange,
  lastWaterChange, waterChangeHistory, dueReminders, nextReminderAt, upcomingReminders, answerReminder, feedingsOn,
  addFeedSlot, copyFeedDay, deriveIssues, speciesConflicts, isoDay, weekdayOf,
} from './aqua.mjs';
import {
  PROFILE_SYSTEM, PROFILE_SCHEMA, profilePrompt, readProfile, profileModels,
  ADVICE_SYSTEM, ADVICE_SCHEMA, advicePrompt, readAdvice, adviceModels,
} from './aqua-ai.mjs';
import { TimeChart, clampView } from './chart.mjs';
import { idbGet, idbSet, idbDel } from './idb.mjs';
import {
  notifSupported, notifPermission, askPermission, showNotification, writeSchedule, registerPeriodic, takeAnswers, onWorkerMessage,
} from './notify.mjs';
import { generateJson, QuotaBook, normalizeKeys } from '../gemini.mjs';
import { readJson, writeJson, GEMINI_KEY, QUOTA_KEY } from '../storage.mjs';

const KEY = 'wp-aqua-v1';
const UI = 'wp-aqua-ui-v1';
const SHOWN = 'wp-aqua-shown-v1';
const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const WD_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const PRESETS = [
  { key: '7', label: '7 T', days: 7 }, { key: '30', label: '30 T', days: 30 }, { key: '90', label: '3 M', days: 90 },
  { key: '365', label: '1 J', days: 365 }, { key: 'all', label: 'Alles', days: 0 },
];

const quota = new QuotaBook({ load: () => readJson(QUOTA_KEY, {}), save: (v) => writeJson(QUOTA_KEY, v) });
const geminiKeys = () => normalizeKeys(readJson(GEMINI_KEY, {})?.keys || []);

// Diagramme und Objekt-URLs leben außerhalb des reaktiven Zustands.
const charts = new Map();
const photoUrls = new Map();

const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocalInput = (s) => { const t = new Date(s).getTime(); return Number.isFinite(t) ? t : Date.now(); };
const easeOut = (x) => 1 - (1 - x) ** 4;

async function shrinkImage(file, max = 960) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((resolve) => c.toBlob((b) => resolve(b || file), 'image/jpeg', 0.84));
}

export function registerAqua(Alpine) {
  Alpine.data('aqua', () => ({
    PARAMS, PARAM, PHASES, PRESETS, WEEKDAYS, WD_SHORT, MAX_FEED_SLOTS,
    d: emptyAqua(),
    tankId: 't54',
    section: 'values',
    mode: 'chart',
    preset: '30',
    cols: Object.fromEntries(PARAMS.map((p) => [p.key, true])),
    selectedId: null,
    form: null,
    targetsForm: null,
    speciesId: null,
    stockForm: { name: '', qty: 1 },
    profileBusy: {},
    adviceBusy: false,
    adviceStatus: '',
    feedEdit: null,
    foodName: '',
    alert: null,
    alertQueue: [],
    perm: 'default',
    periodic: '',
    photoTick: 0,
    view: null,
    settingsForm: null,

    init() {
      this.d = sanitizeAqua(readJson(KEY, null));
      const ui = readJson(UI, {}) || {};
      if (this.d.tanks.some((t) => t.id === ui.tank)) this.tankId = ui.tank;
      if (['values', 'care', 'stock'].includes(ui.section)) this.section = ui.section;
      if (ui.mode === 'list') this.mode = 'list';
      if (PRESETS.some((p) => p.key === ui.preset)) this.preset = ui.preset;
      if (ui.cols) this.cols = { ...this.cols, ...ui.cols };
      this.perm = notifPermission();
      this.loadPhotos();
      window.addEventListener('wp-layer-closed', (e) => this.layerClosed(e.detail));
      onWorkerMessage((msg) => {
        if (msg.type === 'tool-answer') this.answer(msg.key, msg.action, { fromNotification: true });
        if (msg.type === 'tool-open') this.openFromNotification(msg.key);
      });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.tick(); });
      for (const k of ['tankId', 'section', 'mode', 'preset']) this.$watch(k, () => this.aqPersistUi());
      this.$watch('tankId', () => { this.selectedId = null; this.resetView(false); this.$nextTick(() => this.refreshCharts(true)); });
      this.$watch('mode', () => this.$nextTick(() => this.refreshCharts(true)));
      this.$watch('section', () => this.$nextTick(() => this.refreshCharts(true)));
      this.resetView(false);
      this.reschedule();
      // Steckbriefe, die mangels Schlüssel oder Netz liegen geblieben sind, nachholen.
      setTimeout(() => {
        if (!geminiKeys().length) return;
        this.d.tanks.flatMap((t) => t.stock).filter((s) => !s.profile).slice(0, 3).forEach((s) => this.fetchProfile(s.id));
      }, 4000);
      setInterval(() => this.tick(), 60000);
      setTimeout(() => {
        this.tick();
        const q = new URLSearchParams(location.search);
        if (q.get('tool') === 'aqua') {
          const key = q.get('alert');
          history.replaceState(history.state, '', location.pathname);
          if (key) this.openFromNotification(key);
          else this.open();
        }
      }, 900);
    },

    aqPersistUi() {
      writeJson(UI, { tank: this.tankId, section: this.section, mode: this.mode, preset: this.preset, cols: this.cols });
    },

    save() {
      clearTimeout(this._saveT);
      this._saveT = setTimeout(() => writeJson(KEY, this.d), 120);
      this.reschedule();
    },

    // ---------------------------------------------------------------- Ebenen

    open() {
      if (!this.isOpen('aqua')) this.openLayer('aqua');
      this.$nextTick(() => setTimeout(() => this.refreshCharts(true), 60));
    },

    layerClosed(name) {
      if (name === 'aqua-measure') this.form = null;
      if (name === 'aqua-targets') this.targetsForm = null;
      if (name === 'aqua-species') this.speciesId = null;
      if (name === 'aqua-feed') this.feedEdit = null;
      if (name === 'aqua-settings') this.settingsForm = null;
      if (name === 'aqua-alert') { this.alert = null; setTimeout(() => this.nextAlert(), 400); }
    },

    // ---------------------------------------------------------------- Ableitungen

    get tank() {
      return this.d.tanks.find((t) => t.id === this.tankId) || this.d.tanks[0];
    },

    get list() {
      return measurementsOf(this.d, this.tankId);
    },

    get listDesc() {
      return [...this.list].reverse();
    },

    get latest() {
      return latestValues(this.list);
    },

    get issues() {
      return deriveIssues(this.d, this.tankId);
    },

    get chartParams() {
      const has = new Set(this.list.flatMap((m) => Object.keys(m.values)));
      return PARAMS.filter((p) => has.has(p.key));
    },

    get selected() {
      return this.d.measurements.find((m) => m.id === this.selectedId) || null;
    },

    get marks() {
      return waterChangeMarks(this.list, this.d.waterChanges.filter((w) => w.tank === this.tankId));
    },

    get nextWc() {
      return nextWaterChange(this.d, this.tankId);
    },

    get lastWc() {
      return lastWaterChange(this.d, this.tankId);
    },

    get wcHistory() {
      return waterChangeHistory(this.d, this.tankId);
    },

    get species() {
      return this.tank.stock.find((s) => s.id === this.speciesId) || null;
    },

    get todayFeedings() {
      return feedingsOn(this.d, this.tank, isoDay(Date.now())).map((ev) => ({ ...ev, state: this.d.reminders[ev.key] || {} }));
    },

    tankIssueLevel(id) {
      return Math.max(0, ...deriveIssues(this.d, id).map((i) => i.level));
    },

    paramState(key, v) {
      return rangeState(this.tank.targets[key], v);
    },

    fmt(key, v) { return fmtValue(key, v); },
    fmtU(key, v) { return fmtWithUnit(key, v); },
    fmtRange(key) { return fmtRange(key, this.tank.targets[key]); },
    co2Calc(m) { return m?.values.co2 == null ? co2FromPhKh(m?.values.ph, m?.values.kh) : null; },

    when(ts, { time = true } = {}) {
      if (!ts) return '–';
      const d = new Date(ts);
      const today = isoDay(Date.now());
      const day = isoDay(ts);
      const yest = isoDay(Date.now() - DAY_MS);
      const tom = isoDay(Date.now() + DAY_MS);
      const dl = day === today ? 'Heute' : day === yest ? 'Gestern' : day === tom ? 'Morgen'
        : d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', ...(d.getFullYear() !== new Date().getFullYear() ? { year: '2-digit' } : {}) });
      return time ? `${dl}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : dl;
    },

    ago(ts) {
      if (!ts) return '';
      const days = Math.floor((Date.now() - ts) / DAY_MS);
      if (days <= 0) return 'heute';
      return days === 1 ? 'gestern' : `vor ${days} Tagen`;
    },

    dueText(ts) {
      if (!ts) return 'Noch kein Wasserwechsel erfasst';
      const days = Math.round((new Date(isoDay(ts)).getTime() - new Date(isoDay(Date.now())).getTime()) / DAY_MS);
      if (days < 0) return `Seit ${-days} ${days === -1 ? 'Tag' : 'Tagen'} überfällig`;
      if (days === 0) return `Heute, ${this.tank.wc.time} Uhr`;
      if (days === 1) return `Morgen, ${this.tank.wc.time} Uhr`;
      return `In ${days} Tagen · ${new Date(ts).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}`;
    },

    foodNames(ids) {
      return ids.map((id) => this.d.foods.find((f) => f.id === id)?.name).filter(Boolean).join(', ') || 'Kein Futter gewählt';
    },

    // ---------------------------------------------------------------- Diagramme

    extent() {
      const ts = this.list.map((m) => m.at);
      const now = Date.now();
      return ts.length ? [Math.min(...ts), Math.max(now, ...ts)] : [now - 30 * DAY_MS, now];
    },

    presetView(key) {
      const [e0, e1] = this.extent();
      const end = Math.max(e1, Date.now()) + DAY_MS * 0.5;
      const p = PRESETS.find((x) => x.key === key);
      if (!p || !p.days) {
        const span = Math.max(end - e0, 2 * DAY_MS);
        return [e0 - span * 0.04, end + span * 0.02];
      }
      return [end - p.days * DAY_MS, end];
    },

    resetView(animate = true) {
      const target = this.presetView(this.preset);
      if (animate && this.view) this.animateView(target);
      else this.setView(target, false);
    },

    setPreset(key) {
      this.preset = key;
      this.animateView(this.presetView(key));
    },

    setView(v, clamp = true) {
      this.view = clamp ? clampView(v, this.extent()) : v;
      for (const c of charts.values()) c.setView(this.view);
    },

    animateView(target) {
      cancelAnimationFrame(this._viewRaf);
      const from = this.view || target;
      const start = performance.now();
      const dur = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 1 : 420;
      const step = (now) => {
        const k = easeOut(Math.min(1, (now - start) / dur));
        this.setView([from[0] + (target[0] - from[0]) * k, from[1] + (target[1] - from[1]) * k], false);
        if (k < 1) this._viewRaf = requestAnimationFrame(step);
      };
      this._viewRaf = requestAnimationFrame(step);
    },

    zoom(factor) {
      const [a, b] = this.view;
      const mid = Math.min((a + b) / 2, Date.now());
      const span = (b - a) * factor;
      this.preset = '';
      this.animateView(clampView([mid - span / 2, mid + span / 2], this.extent()));
    },

    mountChart(el, key) {
      const old = charts.get(key);
      if (old && old.el === el) return;
      old?.destroy();
      const c = new TimeChart(el, {
        onSelect: (m) => { this.selectedId = m?.id || null; for (const x of charts.values()) x.setSelected(this.selectedId); },
        onView: (v) => { this.preset = ''; cancelAnimationFrame(this._viewRaf); this.setView(v); },
      });
      charts.set(key, c);
      if (!this.view) this.resetView(false);
      c.view = this.view;
      c.selected = this.selectedId;
      this.feedChart(key, true);
    },

    feedChart(key, animate) {
      const c = charts.get(key);
      if (!c || !c.el.isConnected) { if (c) { c.destroy(); charts.delete(key); } return; }
      c.setData({
        series: seriesOf(this.list, key),
        marks: this.marks,
        target: this.tank.targets[key],
        param: PARAM[key],
      }, { animate });
    },

    refreshCharts(animate = false) {
      for (const key of [...charts.keys()]) this.feedChart(key, animate);
    },

    toggleCol(key) {
      this.cols[key] = !this.cols[key];
      this.aqPersistUi();
    },

    get visibleCols() {
      return PARAMS.filter((p) => this.cols[p.key]);
    },

    // ---------------------------------------------------------------- Messungen

    newMeasurement(phase = null) {
      this.form = {
        id: null, at: toLocalInput(Date.now()), phase,
        values: Object.fromEntries(PARAMS.map((p) => [p.key, ''])), note: '',
      };
      this.openLayer('aqua-measure');
    },

    editMeasurement(m) {
      this.form = {
        id: m.id, at: toLocalInput(m.at), phase: m.phase,
        values: Object.fromEntries(PARAMS.map((p) => [p.key, m.values[p.key] != null ? String(m.values[p.key]).replace('.', ',') : ''])),
        note: m.note,
      };
      this.openLayer('aqua-measure');
    },

    formState(key) {
      const raw = this.form?.values[key];
      const v = raw === '' || raw == null ? null : Number(String(raw).replace(',', '.'));
      return Number.isFinite(v) ? this.paramState(key, v) : 'none';
    },

    get formValid() {
      if (!this.form) return false;
      return Object.keys(readValues(this.form.values)).length > 0 || !!this.form.note.trim() || !!this.form.phase;
    },

    stepValue(key, dir) {
      const p = PARAM[key];
      const cur = Number(String(this.form.values[key]).replace(',', '.'));
      const base = Number.isFinite(cur) && this.form.values[key] !== '' ? cur : (this.latest[key]?.v ?? p.target.min);
      const next = Math.max(0, Math.round((base + dir * p.step) / p.step) * p.step);
      this.form.values[key] = next.toLocaleString('de-DE', { maximumFractionDigits: p.digits });
    },

    saveMeasurement() {
      if (!this.formValid) return;
      const f = this.form;
      const rec = {
        id: f.id || uid(), tank: this.tankId, at: fromLocalInput(f.at), values: readValues(f.values),
        phase: f.phase, note: f.note.trim(),
      };
      const i = this.d.measurements.findIndex((m) => m.id === rec.id);
      if (i >= 0) this.d.measurements[i] = { ...this.d.measurements[i], ...rec };
      else this.d.measurements.push({ ...rec, created: Date.now() });
      this.d.measurements.sort((a, b) => a.at - b.at);
      this.save();
      this.closeLayer('aqua-measure');
      this.selectedId = rec.id;
      if (this.view && (rec.at > this.view[1] || rec.at < this.view[0])) this.resetView(true);
      this.$nextTick(() => this.refreshCharts(i < 0));
      this.notify(i >= 0 ? 'Messung geändert' : 'Messung gespeichert', { tone: 'ok' });
    },

    async deleteMeasurement() {
      const id = this.form?.id;
      if (!id) return;
      const ok = await this.confirm('Messung löschen?', 'Alle Werte und die Notiz dieser Messung werden entfernt.');
      if (!ok) return;
      this.d.measurements = this.d.measurements.filter((m) => m.id !== id);
      if (this.selectedId === id) this.selectedId = null;
      this.save();
      this.closeLayer('aqua-measure');
      this.$nextTick(() => this.refreshCharts(false));
    },

    // ---------------------------------------------------------------- Zielwerte

    openTargets() {
      this.targetsForm = Object.fromEntries(PARAMS.map((p) => {
        const r = this.tank.targets[p.key] || {};
        const s = (v) => (v == null ? '' : String(v).replace('.', ','));
        return [p.key, { min: s(r.min), max: s(r.max) }];
      }));
      this.openLayer('aqua-targets');
    },

    saveTargets() {
      const n = (v) => { const x = Number(String(v).replace(',', '.')); return v === '' || !Number.isFinite(x) ? null : x; };
      for (const p of PARAMS) {
        const f = this.targetsForm[p.key];
        let min = n(f.min);
        let max = n(f.max);
        if (min != null && max != null && min > max) [min, max] = [max, min];
        this.tank.targets[p.key] = { min, max };
      }
      this.save();
      this.closeLayer('aqua-targets');
      this.$nextTick(() => this.refreshCharts(false));
    },

    resetTargets(key) {
      const t = PARAM[key].target;
      this.targetsForm[key] = { min: String(t.min).replace('.', ','), max: String(t.max).replace('.', ',') };
    },

    // ---------------------------------------------------------------- KI-Maßnahmen

    async runAdvice() {
      const keys = geminiKeys();
      if (!keys.length) { this.notify('Für KI-Vorschläge fehlt ein Gemini-Schlüssel (Haushalt-Einstellungen).', { tone: 'error' }); return; }
      this.adviceBusy = true;
      this.adviceStatus = 'Werte werden ausgewertet …';
      const tank = this.tank;
      try {
        const data = await generateJson({
          keys, models: adviceModels(), quota,
          system: ADVICE_SYSTEM, schema: ADVICE_SCHEMA,
          prompt: advicePrompt(tank, this.list, this.issues, this.d.waterChanges.filter((w) => w.tank === tank.id)),
          temperature: 0.6, maxOutputTokens: 4096, timeoutMs: 45000,
          accept: (x) => !!readAdvice(x),
          onRetry: ({ next }) => { if (next) this.adviceStatus = `Weiter mit ${next} …`; },
        });
        tank.advice = readAdvice(data);
        this.save();
      } catch (e) {
        this.notify(e?.message || 'Die KI hat gerade keine Antwort.', { tone: 'error' });
      } finally {
        this.adviceBusy = false;
        this.adviceStatus = '';
      }
    },

    // ---------------------------------------------------------------- Wasserwechsel

    async waterChangedNow() {
      const open = dueReminders(this.d).find((r) => r.kind === 'wc' && r.tank === this.tankId);
      if (open) { this.answer(open.key, 'done'); }
      else {
        this.d.waterChanges.push({ id: uid(), tank: this.tankId, at: Date.now(), source: 'manual' });
        this.save();
      }
      this.notify(`Wasserwechsel im ${this.tank.name} eingetragen`, { tone: 'ok' });
      this.$nextTick(() => this.refreshCharts(false));
    },

    async removeWaterChange(w) {
      if (!w.derived) {
        const hit = this.d.waterChanges.find((x) => x.tank === this.tankId && Math.abs(x.at - w.at) < 60000);
        if (!hit) return;
        const ok = await this.confirm('Wasserwechsel entfernen?', `Eintrag vom ${this.when(w.at)} wird gelöscht.`);
        if (!ok) return;
        this.d.waterChanges = this.d.waterChanges.filter((x) => x !== hit);
        this.save();
        this.$nextTick(() => this.refreshCharts(false));
      }
    },

    setWc(field, value) {
      if (field === 'every') this.tank.wc.every = Math.max(1, Math.min(60, Math.round(Number(value) || 7)));
      if (field === 'time' && /^\d{2}:\d{2}$/.test(value)) this.tank.wc.time = value;
      if (field === 'enabled') this.tank.wc.enabled = !!value;
      if (!this.lastWc && !this.tank.wc.start) this.tank.wc.start = Date.now();
      this.save();
    },

    // ---------------------------------------------------------------- Futter

    addFood() {
      const name = this.foodName.trim();
      if (!name) return;
      if (this.d.foods.some((f) => f.name.toLowerCase() === name.toLowerCase())) { this.foodName = ''; return; }
      this.d.foods.push({ id: uid(), name });
      this.foodName = '';
      this.save();
    },

    async removeFood(f) {
      const ok = await this.confirm(`„${f.name}" löschen?`, 'Das Futter verschwindet auch aus den Futterplänen.');
      if (!ok) return;
      this.d.foods = this.d.foods.filter((x) => x.id !== f.id);
      for (const t of this.d.tanks) for (const day of t.feed) for (const s of day) s.foods = s.foods.filter((id) => id !== f.id);
      this.save();
    },

    addSlot(day) {
      const slots = this.tank.feed[day];
      const time = slots.length ? `${pad(Math.min(21, Number(slots[slots.length - 1].time.slice(0, 2)) + 5))}:00` : '08:00';
      if (!addFeedSlot(this.tank, day, time)) return;
      this.save();
      this.editSlot(day, this.tank.feed[day].findIndex((s) => s.time === time));
    },

    editSlot(day, idx) {
      const s = this.tank.feed[day][idx];
      if (!s) return;
      this.feedEdit = { day, id: s.id, time: s.time, foods: [...s.foods], all: false };
      this.openLayer('aqua-feed');
    },

    toggleFeedFood(id) {
      const f = this.feedEdit.foods;
      const i = f.indexOf(id);
      if (i >= 0) f.splice(i, 1); else f.push(id);
    },

    aqSaveSlot() {
      const e = this.feedEdit;
      const slots = this.tank.feed[e.day];
      const s = slots.find((x) => x.id === e.id);
      if (s) { s.time = e.time; s.foods = [...e.foods]; }
      slots.sort((a, b) => a.time.localeCompare(b.time));
      if (e.all) copyFeedDay(this.tank, e.day);
      this.save();
      this.closeLayer('aqua-feed');
    },

    removeSlot() {
      const e = this.feedEdit;
      this.tank.feed[e.day] = this.tank.feed[e.day].filter((x) => x.id !== e.id);
      this.save();
      this.closeLayer('aqua-feed');
    },

    copyDayToAll(day) {
      copyFeedDay(this.tank, day);
      this.save();
      this.notify(`${WEEKDAYS[day]} auf alle Tage übertragen`, { tone: 'ok' });
    },

    get todayIndex() {
      return weekdayOf(Date.now());
    },

    feedDone(ev) {
      this.answer(ev.key, 'done');
    },

    // ---------------------------------------------------------------- Bestand

    addStock() {
      const name = this.stockForm.name.trim();
      if (!name) return;
      const item = { id: uid(), name, qty: Math.max(1, Math.round(Number(this.stockForm.qty) || 1)), added: Date.now(), photo: false, profile: null, profileAt: null };
      this.tank.stock.push(item);
      this.stockForm = { name: '', qty: 1 };
      this.save();
      this.fetchProfile(item.id);
    },

    stockQty(s, dir) {
      s.qty = Math.max(0, s.qty + dir);
      this.save();
    },

    async removeStock(s) {
      const ok = await this.confirm(`„${s.profile?.commonName || s.name}" entfernen?`, 'Steckbrief und Foto werden gelöscht.');
      if (!ok) return;
      this.tank.stock = this.tank.stock.filter((x) => x.id !== s.id);
      await idbDel('photos', `aqua:${s.id}`);
      if (photoUrls.has(s.id)) { URL.revokeObjectURL(photoUrls.get(s.id)); photoUrls.delete(s.id); }
      this.save();
      if (this.speciesId === s.id) this.closeLayer('aqua-species');
    },

    openSpecies(s) {
      this.speciesId = s.id;
      this.openLayer('aqua-species');
    },

    async fetchProfile(id) {
      const keys = geminiKeys();
      const s = this.d.tanks.flatMap((t) => t.stock).find((x) => x.id === id);
      if (!s) return;
      if (!keys.length) { this.profileBusy = { ...this.profileBusy, [id]: 'Kein Gemini-Schlüssel – Steckbrief folgt, sobald einer hinterlegt ist.' }; return; }
      const tank = this.d.tanks.find((t) => t.stock.includes(s));
      this.profileBusy = { ...this.profileBusy, [id]: 'Steckbrief wird recherchiert …' };
      try {
        const data = await generateJson({
          keys, models: profileModels(), quota,
          system: PROFILE_SYSTEM, schema: PROFILE_SCHEMA, prompt: profilePrompt(s.name, tank),
          temperature: 0.4, maxOutputTokens: 6144, timeoutMs: 45000,
          accept: (x) => !!readProfile(x),
          onRetry: ({ next }) => { if (next) this.profileBusy = { ...this.profileBusy, [id]: `Weiter mit ${next} …` }; },
        });
        s.profile = readProfile(data);
        s.profileAt = Date.now();
        this.save();
        const rest = { ...this.profileBusy };
        delete rest[id];
        this.profileBusy = rest;
      } catch (e) {
        this.profileBusy = { ...this.profileBusy, [id]: `Fehlgeschlagen: ${e?.message || 'keine Antwort'}` };
      }
    },

    isBusy(id) {
      const v = this.profileBusy[id];
      return !!v && !/^Fehlgeschlagen|^Kein Gemini/.test(v);
    },

    conflicts(s) {
      return speciesConflicts(s?.profile, this.tank.targets);
    },

    stockCount(kindGroup) {
      return this.tank.stock.filter((s) => (kindGroup === 'plants' ? ['Pflanze', 'Moos'].includes(s.profile?.kind) : !['Pflanze', 'Moos'].includes(s.profile?.kind))).reduce((n, s) => n + s.qty, 0);
    },

    async loadPhotos() {
      for (const s of this.d.tanks.flatMap((t) => t.stock)) {
        if (!s.photo || photoUrls.has(s.id)) continue;
        const blob = await idbGet('photos', `aqua:${s.id}`);
        if (blob) photoUrls.set(s.id, URL.createObjectURL(blob));
      }
      this.photoTick++;
    },

    photo(s) {
      void this.photoTick;
      return s?.photo ? photoUrls.get(s.id) || '' : '';
    },

    async setPhoto(s, ev) {
      const file = ev.target.files?.[0];
      ev.target.value = '';
      if (!file) return;
      try {
        const blob = await shrinkImage(file);
        await idbSet('photos', `aqua:${s.id}`, blob);
        if (photoUrls.has(s.id)) URL.revokeObjectURL(photoUrls.get(s.id));
        photoUrls.set(s.id, URL.createObjectURL(blob));
        s.photo = true;
        this.photoTick++;
        this.save();
      } catch {
        this.notify('Das Bild konnte nicht gespeichert werden.', { tone: 'error' });
      }
    },

    // ---------------------------------------------------------------- Erinnerungen

    payloadOf(ev) {
      const t = this.d.tanks.find((x) => x.id === ev.tank);
      const name = t?.name || 'Aquarium';
      if (ev.kind === 'feed') {
        const time = new Date(ev.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        return {
          key: ev.key, at: ev.at, kind: 'feed', level: 0,
          title: `Fütterung · ${name}`,
          body: `${time} Uhr: ${this.foodNames(ev.foods)}`,
          actions: [{ action: 'done', title: 'Erledigt' }, { action: 'snooze', title: 'In 1 h erneut erinnern' }],
        };
      }
      const n = ev.snoozes || 0;
      const over = Math.max(0, Math.floor((Date.now() - (nextWaterChange(this.d, ev.tank) || Date.now())) / DAY_MS));
      const titles = [
        `Wasserwechsel · ${name}`,
        `Wasserwechsel · ${name} – schon ${n}× verschoben`,
        `Wasserwechsel überfällig · ${name}`,
        `DRINGEND: Wasserwechsel · ${name}`,
      ];
      const bodies = [
        over ? `Seit ${over} ${over === 1 ? 'Tag' : 'Tagen'} fällig (Rhythmus: alle ${t?.wc.every || 7} Tage).` : `Heute ist Wasserwechsel dran (alle ${t?.wc.every || 7} Tage).`,
        `Das Becken wartet ${over ? `seit ${over} ${over === 1 ? 'Tag' : 'Tagen'}` : 'schon'}. Heute schaffst du es!`,
        `${n}× verschoben, ${over} ${over === 1 ? 'Tag' : 'Tage'} drüber. Nitrat und Schadstoffe sammeln sich – bitte heute wechseln.`,
        `${n}× verschoben! Die Bewohner brauchen frisches Wasser. Jetzt 10 Minuten – danach ist Ruhe.`,
      ];
      return {
        key: ev.key, at: ev.at, kind: 'wc', level: ev.level,
        title: titles[ev.level], body: bodies[ev.level],
        actions: [{ action: 'done', title: 'Erledigt' }, { action: 'snooze', title: 'Morgen wieder erinnern' }],
      };
    },

    reschedule() {
      clearTimeout(this._remT);
      const next = nextReminderAt(this.d);
      if (next != null) this._remT = setTimeout(() => this.tick(), Math.min(2 ** 31 - 1, Math.max(1000, next - Date.now() + 500)));
      writeSchedule(upcomingReminders(this.d).map((ev) => this.payloadOf(ev)));
    },

    async tick() {
      for (const a of await takeAnswers()) this.answer(a.key, a.action, { fromNotification: true, at: a.at });
      const due = dueReminders(this.d);
      const shown = readJson(SHOWN, {}) || {};
      const visible = document.visibilityState === 'visible';
      let changed = false;
      for (const ev of due) {
        const mark = Math.max(ev.at, this.d.reminders[ev.key]?.until || 0);
        if (shown[ev.key] && shown[ev.key] >= mark) {
          if (visible && !this.alert && !this.alertQueue.some((x) => x.key === ev.key) && !shown[`seen:${ev.key}`]) this.queueAlert(ev);
          continue;
        }
        shown[ev.key] = Date.now();
        delete shown[`seen:${ev.key}`];
        changed = true;
        const p = this.payloadOf(ev);
        if (!visible) await showNotification(p);
        else this.queueAlert(ev);
      }
      if (changed) writeJson(SHOWN, Object.fromEntries(Object.entries(shown).filter(([, v]) => Date.now() - v < 30 * DAY_MS)));
      this.reschedule();
    },

    queueAlert(ev) {
      if (this.alert?.key === ev.key || this.alertQueue.some((x) => x.key === ev.key)) return;
      this.alertQueue.push(ev);
      if (!this.alert) this.nextAlert();
    },

    nextAlert() {
      if (this.alert || this.locked) return;
      const ev = this.alertQueue.shift();
      if (!ev) return;
      // Inzwischen erledigt oder verschoben? Dann nicht mehr zeigen.
      if (!dueReminders(this.d).some((x) => x.key === ev.key)) { this.nextAlert(); return; }
      this.alert = { ...ev, ...this.payloadOf(ev) };
      this.openLayer('aqua-alert');
      if (navigator.vibrate) { try { navigator.vibrate(ev.level >= 2 ? [300, 100, 300, 100, 600] : [160]); } catch { /* egal */ } }
    },

    openFromNotification(key) {
      const ev = dueReminders(this.d).find((x) => x.key === key);
      if (ev) this.queueAlert(ev);
      else this.open();
    },

    answer(key, action, { fromNotification = false, at = Date.now() } = {}) {
      if (!key || !['done', 'snooze'].includes(action)) return;
      const r = this.d.reminders[key];
      if (r?.done) return;
      const next = answerReminder(this.d, key, action, at);
      this.d.reminders = next.reminders;
      this.d.waterChanges = next.waterChanges;
      const shown = readJson(SHOWN, {}) || {};
      shown[`seen:${key}`] = Date.now();
      writeJson(SHOWN, shown);
      this.save();
      if (this.alert?.key === key) this.closeLayer('aqua-alert');
      this.alertQueue = this.alertQueue.filter((x) => x.key !== key);
      if (fromNotification) this.notify(action === 'done' ? 'Erledigt – danke!' : 'Erinnerung verschoben', { tone: 'ok' });
      this.$nextTick(() => this.refreshCharts(false));
    },

    dismissAlert() {
      if (!this.alert) return;
      const shown = readJson(SHOWN, {}) || {};
      shown[`seen:${this.alert.key}`] = Date.now();
      writeJson(SHOWN, shown);
      this.closeLayer('aqua-alert');
    },

    async enableNotifications() {
      const res = await askPermission();
      this.perm = res;
      if (res === 'granted') {
        this.periodic = await registerPeriodic();
        await showNotification({ key: 'aqua-test', title: 'Aquarium-Helfer', body: 'So sehen die Erinnerungen aus. Fütterung und Wasserwechsel melden sich hier.', actions: [] });
      } else if (res === 'denied') {
        this.notify('Benachrichtigungen sind blockiert – in den Website-Einstellungen von Chrome freigeben.', { tone: 'error', ms: 6000 });
      }
    },

    testAlert(level) {
      const t = this.tank;
      this.alert = { ...this.payloadOf({ key: `test:${t.id}`, kind: 'wc', tank: t.id, at: Date.now(), snoozes: level + 1, level }), test: true };
      this.openLayer('aqua-alert');
    },

    // ---------------------------------------------------------------- Einstellungen & Sicherung

    openAquaSettings() {
      this.settingsForm = { names: Object.fromEntries(this.d.tanks.map((t) => [t.id, { name: t.name, liters: t.liters || '' }])) };
      this.perm = notifPermission();
      registerPeriodic().then((s) => { this.periodic = s; });
      this.openLayer('aqua-settings');
    },

    saveTankMeta(id) {
      const f = this.settingsForm.names[id];
      const t = this.d.tanks.find((x) => x.id === id);
      t.name = f.name.trim() || t.name;
      t.liters = Math.max(0, Math.round(Number(f.liters) || 0));
      this.save();
    },

    get notifText() {
      if (!notifSupported()) return 'Dieser Browser kann keine Benachrichtigungen zeigen. Erinnerungen erscheinen beim Öffnen der App als Vollbild.';
      if (this.perm === 'granted') return 'Benachrichtigungen sind erlaubt.';
      if (this.perm === 'denied') return 'Benachrichtigungen sind blockiert. In Chrome: Schloss-Symbol bzw. App-Info → Benachrichtigungen erlauben.';
      return 'Noch nicht erlaubt.';
    },

    async exportAqua() {
      const files = { 'aquarium.json': strToU8(JSON.stringify(this.d, null, 2)) };
      for (const s of this.d.tanks.flatMap((t) => t.stock)) {
        if (!s.photo) continue;
        const blob = await idbGet('photos', `aqua:${s.id}`);
        if (blob) files[`fotos/${s.id}.jpg`] = new Uint8Array(await blob.arrayBuffer());
      }
      const zip = zipSync(files, { level: 6 });
      const name = `aquarium-${isoDay(Date.now())}.zip`;
      const file = new File([zip], name, { type: 'application/zip' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e?.name === 'AbortError') return; }
      }
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },

    async importAqua(ev) {
      const file = ev.target.files?.[0];
      ev.target.value = '';
      if (!file) return;
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        let data;
        let photos = {};
        if (file.name.endsWith('.json')) data = JSON.parse(strFromU8(buf));
        else {
          const z = unzipSync(buf);
          data = JSON.parse(strFromU8(z['aquarium.json']));
          photos = Object.fromEntries(Object.entries(z).filter(([k]) => k.startsWith('fotos/')));
        }
        const next = sanitizeAqua(data);
        const ok = await this.confirm('Aquarium-Sicherung einspielen?', `${next.measurements.length} Messungen, ${next.tanks.reduce((n, t) => n + t.stock.length, 0)} Arten. Der aktuelle Stand des Aquarium-Helfers wird ersetzt.`, 'Einspielen');
        if (!ok) return;
        for (const [k, bytes] of Object.entries(photos)) {
          await idbSet('photos', `aqua:${k.slice(6).replace(/\.jpg$/, '')}`, new Blob([bytes], { type: 'image/jpeg' }));
        }
        this.d = next;
        photoUrls.forEach((u) => URL.revokeObjectURL(u));
        photoUrls.clear();
        await this.loadPhotos();
        this.save();
        this.resetView(false);
        this.$nextTick(() => this.refreshCharts(true));
        this.notify('Aquarium-Sicherung eingespielt', { tone: 'ok' });
      } catch {
        this.notify('Die Datei ist keine Aquarium-Sicherung.', { tone: 'error' });
      }
    },
  }));
}
