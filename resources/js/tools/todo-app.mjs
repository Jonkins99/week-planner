// To-do-Liste: Alpine-Komponente `todo`. Eigenständig neben der Haushalts-App: eigene Daten
// (`wp-todo-v1`), eigene gezeigte Erinnerungen (`wp-todo-shown-v1`). Erinnerungen laufen über
// dieselben Wege wie beim Aquarium (notify.mjs: Takt in der App, Plan für den Service Worker,
// Weckdienst); Schlüssel `todo:<id>:<Fälligkeit>`, Quelle „todo“.

import {
  REPEATS, DAY_MS, sanitizeTodo, emptyTodo, addTodo, completeTodo, openTodos, doneTodos, upcomingTodo, dueTodo,
  buildRepeat, nextOf, parseCron, dueText, reminderKey,
} from './todo.mjs';
import { CRON_SYSTEM, CRON_SCHEMA, cronPrompt, readCron, acceptCron, todoModels } from './todo-ai.mjs';
import {
  notifPermission, askPermission, showNotification, writeSchedule, syncWakeTimes, takeAnswers, onWorkerMessage, pushConfig, registerPeriodic,
} from './notify.mjs';
import { generateJson, QuotaBook, normalizeKeys } from '../gemini.mjs';
import { readJson, writeJson, GEMINI_KEY, QUOTA_KEY } from '../storage.mjs';

const KEY = 'wp-todo-v1';
const SHOWN = 'wp-todo-shown-v1';
const HOUR = 3600000;

const quota = new QuotaBook({ load: () => readJson(QUOTA_KEY, {}), save: (v) => writeJson(QUOTA_KEY, v) });
const geminiKeys = () => normalizeKeys(readJson(GEMINI_KEY, {})?.keys || []);

const pad = (n) => String(n).padStart(2, '0');
const dateInput = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const timeInput = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const isTodoKey = (k) => String(k || '').startsWith('todo:');

export function registerTodo(Alpine) {
  Alpine.data('todo', () => ({
    TD_REPEATS: REPEATS,
    td: emptyTodo(),
    tdInput: '',
    tdForm: null,
    tdPerm: 'default',
    tdPush: false,
    tdNow: Date.now(),
    tdAiBusy: false,
    tdAiError: '',
    _tdSaveT: 0,
    _tdRemT: 0,
    _tdPlanT: 0,
    _tdTicked: false,

    init() {
      this.td = sanitizeTodo(readJson(KEY, null));
      this.tdPerm = notifPermission();
      window.addEventListener('wp-layer-closed', (e) => { if (e.detail === 'todo-edit') this.tdForm = null; });
      onWorkerMessage((msg) => {
        if (!isTodoKey(msg.key)) return;
        if (msg.type === 'tool-answer') this.tdAnswer(msg.key, msg.action, true);
        if (msg.type === 'tool-open') this.tdOpen();
      });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.tdTick(); });
      setInterval(() => this.tdTick(), 60000);
      setTimeout(() => {
        this.tdTick();
        const q = new URLSearchParams(location.search);
        if (q.get('tool') === 'todo') {
          history.replaceState(history.state, '', location.pathname);
          this.tdOpen();
        }
      }, 900);
    },

    tdSave() {
      clearTimeout(this._tdSaveT);
      this._tdSaveT = setTimeout(() => writeJson(KEY, this.td), 120);
      this.tdReschedule();
    },

    tdOpen() {
      this.tdPerm = notifPermission();
      pushConfig().then((c) => { this.tdPush = !!c; });
      if (!this.isOpen('todo')) this.openLayer('todo');
    },

    // ---------------------------------------------------------------- Liste

    get tdOpenList() {
      return openTodos(this.td);
    },

    get tdDoneList() {
      return doneTodos(this.td);
    },

    tdDue(item) {
      return dueText(item.due, this.tdNow);
    },

    tdLate(item) {
      return !!item.due && item.due < this.tdNow;
    },

    tdAdd() {
      if (!addTodo(this.td, this.tdInput)) return;
      this.tdInput = '';
      this.tdSave();
    },

    tdToggle(item) {
      if (item.done) {
        item.done = 0;
      } else if (completeTodo(item) === 'next') {
        this.notify(`Wieder fällig: ${dueText(item.due)}`, { tone: 'ok' });
      }
      this.tdSave();
    },

    async tdClearDone() {
      const n = this.tdDoneList.length;
      if (!n || !(await this.confirm(`${n} erledigte ${n === 1 ? 'Aufgabe' : 'Aufgaben'} löschen?`, 'Sie verschwinden endgültig aus der Liste.'))) return;
      this.td.items = this.td.items.filter((x) => !x.done);
      this.tdSave();
    },

    // ---------------------------------------------------------------- Bearbeiten

    tdEdit(item) {
      const r = item.repeat;
      this.tdForm = {
        id: item.id,
        title: item.title,
        date: item.due ? dateInput(item.due) : '',
        time: item.due ? timeInput(item.due) : '09:00',
        notify: item.notify,
        kind: r?.kind || '',
        text: r?.text || '',
        cron: r?.kind === 'custom' ? r.cron : '',
        weeks: r?.weeks || 1,
        label: r?.kind === 'custom' ? r.label : '',
      };
      this.tdAiError = '';
      this.tdPerm = notifPermission();
      this.openLayer('todo-edit');
    },

    tdQuickDate(days) {
      const d = new Date(Date.now() + days * DAY_MS);
      this.tdForm.date = dateInput(d);
    },

    get tdNextWeekday() {
      return (8 - new Date().getDay()) % 7 || 7;
    },

    get tdFormDue() {
      const f = this.tdForm;
      if (!f?.date) return 0;
      const t = new Date(`${f.date}T${f.time || '09:00'}`).getTime();
      return Number.isFinite(t) ? t : 0;
    },

    get tdFormRepeatText() {
      const f = this.tdForm;
      if (!f?.kind) return '';
      if (f.kind === 'custom') return f.cron ? f.label || f.cron : '';
      return buildRepeat(f.kind, this.tdFormDue || new Date(`${dateInput(Date.now())}T${f.time || '09:00'}`).getTime())?.label || '';
    },

    async tdToggleNotify() {
      const f = this.tdForm;
      f.notify = !f.notify;
      if (!f.notify) return;
      if (!f.date && !f.kind) f.date = dateInput(Date.now() + DAY_MS);
      if (notifPermission() === 'default') {
        this.tdPerm = await askPermission();
        if (this.tdPerm === 'granted') registerPeriodic();
      }
    },

    async tdAiCron() {
      const f = this.tdForm;
      if (!f?.text.trim() || this.tdAiBusy) return false;
      const keys = geminiKeys();
      if (!keys.length) { this.tdAiError = 'Für die Übersetzung fehlt ein Gemini-Schlüssel (Haushalt-Einstellungen).'; return false; }
      this.tdAiBusy = true;
      this.tdAiError = '';
      try {
        const data = await generateJson({
          keys, models: todoModels(), quota,
          system: CRON_SYSTEM, schema: CRON_SCHEMA,
          prompt: cronPrompt(f.text, this.tdFormDue || new Date(`${dateInput(Date.now())}T${f.time || '09:00'}`).getTime()),
          temperature: 0.1, maxOutputTokens: 300, timeoutMs: 20000, accept: acceptCron,
        });
        const got = readCron(data);
        if (!got) { this.tdAiError = 'Daraus ließ sich keine Wiederholung lesen. Anders formulieren?'; return false; }
        if (this.tdForm !== f) return false;
        Object.assign(f, got);
        return true;
      } catch (e) {
        this.tdAiError = e?.message || 'Die KI hat gerade keine Antwort.';
        return false;
      } finally {
        this.tdAiBusy = false;
      }
    },

    async tdSaveForm() {
      const f = this.tdForm;
      if (!f) return;
      const item = this.td.items.find((x) => x.id === f.id);
      if (!item) { this.closeLayer('todo-edit'); return; }
      if (f.kind === 'custom' && f.text.trim() && !parseCron(f.cron) && !(await this.tdAiCron())) return;
      const now = Date.now();
      let due = this.tdFormDue;
      let repeat = null;
      if (f.kind) {
        const base = due || new Date(`${dateInput(now)}T${f.time || '09:00'}`).getTime();
        repeat = buildRepeat(f.kind, base, { cron: f.cron, weeks: f.weeks, label: f.label, text: f.text, anchor: base });
        // Eigene Regel ohne Datum: erster Termin aus der Regel; sonst nie in der Vergangenheit starten.
        if (repeat && !due) due = f.kind !== 'custom' && base > now ? base : nextOf(repeat, now) || base;
      }
      const changedDue = due !== item.due;
      Object.assign(item, {
        title: f.title.trim() || item.title,
        due,
        repeat,
        notify: !!f.notify && !!due,
        snooze: changedDue ? 0 : item.snooze,
      });
      this.tdSave();
      this.closeLayer('todo-edit');
    },

    tdRemove() {
      const f = this.tdForm;
      if (!f) return;
      const item = this.td.items.find((x) => x.id === f.id);
      this.td.items = this.td.items.filter((x) => x.id !== f.id);
      this.tdSave();
      this.closeLayer('todo-edit');
      if (item) this.notify(`„${item.title}“ gelöscht`);
    },

    // ---------------------------------------------------------------- Erinnerungen

    tdPayload(r) {
      return {
        key: r.key, kind: 'todo', at: r.at, level: 0, url: './?tool=todo',
        title: r.title,
        body: r.repeat ? `Jetzt fällig · ${r.repeat}` : 'Jetzt fällig',
        actions: [{ action: 'done', title: 'Erledigt' }, { action: 'snooze', title: 'In 1 Std.' }],
      };
    },

    tdReschedule() {
      clearTimeout(this._tdRemT);
      const next = upcomingTodo(this.td, Date.now(), 30).find((r) => r.at > Date.now());
      if (next) this._tdRemT = setTimeout(() => this.tdTick(), Math.min(2 ** 31 - 1, Math.max(1000, next.at - Date.now() + 500)));
      if (!this._tdTicked) return;
      clearTimeout(this._tdPlanT);
      this._tdPlanT = setTimeout(() => {
        const plan = upcomingTodo(this.td, Date.now(), 14).map((r) => this.tdPayload(r));
        writeSchedule(plan, 'todo');
        syncWakeTimes(plan.map((p) => p.at), 'todo');
      }, 400);
    },

    async tdTick() {
      this.tdNow = Date.now();
      for (const a of await takeAnswers(isTodoKey)) this.tdAnswer(a.key, a.action, true);
      this._tdTicked = true;
      const shown = readJson(SHOWN, {}) || {};
      const visible = document.visibilityState === 'visible';
      let changed = false;
      for (const r of dueTodo(this.td)) {
        if (shown[r.key] && shown[r.key] >= r.at) continue;
        shown[r.key] = r.at;
        changed = true;
        if (visible) this.notify(`Fällig: ${r.title}`, { tone: 'ok', ms: 6000 });
        else await showNotification(this.tdPayload(r));
      }
      if (changed) writeJson(SHOWN, Object.fromEntries(Object.entries(shown).filter(([, v]) => Date.now() - v < 30 * DAY_MS)));
      this.tdReschedule();
    },

    tdAnswer(key, action, fromNotification = false) {
      const [, id] = String(key).split(':');
      const item = this.td.items.find((x) => x.id === id);
      if (!item || item.done || reminderKey(item) !== key) return;
      if (action === 'done') completeTodo(item);
      else if (action === 'snooze') item.snooze = Date.now() + HOUR;
      else return;
      this.tdSave();
      if (fromNotification) this.notify(action === 'done' ? `Erledigt: ${item.title}` : 'Erinnerung in einer Stunde', { tone: 'ok' });
    },

    async tdAllow() {
      this.tdPerm = await askPermission();
      if (this.tdPerm === 'granted') {
        registerPeriodic();
        this.tdReschedule();
      } else if (this.tdPerm === 'denied') {
        this.notify('Benachrichtigungen sind blockiert – in den Website-Einstellungen von Chrome freigeben.', { tone: 'error', ms: 6000 });
      }
    },

    get tdNeedsPerm() {
      return this.tdPerm !== 'granted' && this.tdPerm !== 'unsupported' && this.td.items.some((x) => !x.done && x.notify);
    },
  }));
}
