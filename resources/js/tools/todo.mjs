// To-do-Liste: Datenmodell und reine Logik (ohne DOM, in Node testbar).
// To-do = { id, title, created, done (0 | Zeitpunkt), due (0 | Zeitpunkt), notify, snooze, repeat }.
// repeat = null | { kind: daily|weekly|monthly|yearly|custom, cron, weeks, label, text, anchor }.
// Wiederholung als Cron-Ausdruck (Minute Stunde Tag Monat Wochentag) mit zwei Erweiterungen:
// Wochentag „2#3“ = dritter Dienstag im Monat, „5L“ = letzter Freitag, Tag „L“ = Monatsletzter.
// `weeks` > 1 nimmt nur jede n-te Woche ab `anchor` (z. B. Müll alle 2 Wochen).

export const DAY_MS = 86400000;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const pad = (n) => String(n).padStart(2, '0');

export const REPEATS = [
  { key: '', label: 'Nie' },
  { key: 'daily', label: 'Täglich' },
  { key: 'weekly', label: 'Wöchentlich' },
  { key: 'monthly', label: 'Monatlich' },
  { key: 'yearly', label: 'Jährlich' },
  { key: 'custom', label: 'Eigene' },
];

// ---------------------------------------------------------------- Cron

function field(src, min, max) {
  const set = new Set();
  for (const part of String(src).split(',')) {
    const [range, stepRaw] = part.split('/');
    const step = stepRaw == null ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) return null;
    let lo; let hi;
    if (range === '*') { lo = min; hi = max; } else if (range.includes('-')) {
      [lo, hi] = range.split('-').map(Number);
    } else {
      lo = Number(range);
      hi = stepRaw == null ? lo : max;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return set;
}

/** Cron-Ausdruck lesen; null, wenn ungültig. */
export function parseCron(expr) {
  const parts = String(expr || '').trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [mi, ho, dom, mon, dow] = parts;
  const minute = field(mi, 0, 59);
  const hour = field(ho, 0, 23);
  const month = field(mon, 1, 12);
  if (!minute || !hour || !month) return null;
  let domSet = null;
  let last = false;
  if (dom !== '*') {
    const items = dom.split(',');
    last = items.includes('L');
    const rest = items.filter((x) => x !== 'L');
    domSet = rest.length ? field(rest.join(','), 1, 31) : new Set();
    if (!domSet) return null;
  }
  let dowSet = null;
  const nth = [];
  const lastDow = [];
  if (dow !== '*') {
    dowSet = new Set();
    for (const item of dow.split(',')) {
      let m = /^([0-7])#([1-5])$/.exec(item);
      if (m) { nth.push({ d: Number(m[1]) % 7, n: Number(m[2]) }); continue; }
      m = /^([0-7])L$/.exec(item);
      if (m) { lastDow.push(Number(m[1]) % 7); continue; }
      const f = field(item, 0, 7);
      if (!f) return null;
      for (const v of f) dowSet.add(v % 7);
    }
  }
  return { minute: [...minute].sort((a, b) => a - b), hour: [...hour].sort((a, b) => a - b), month, domSet, last, dowSet, nth, lastDow };
}

function dayMatches(c, d) {
  if (!c.month.has(d.getMonth() + 1)) return false;
  const date = d.getDate();
  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const wd = d.getDay();
  const domOk = c.domSet ? c.domSet.has(date) || (c.last && date === dim) : null;
  const dowOk = c.dowSet ? c.dowSet.has(wd) || c.nth.some((x) => x.d === wd && Math.ceil(date / 7) === x.n) || c.lastDow.some((x) => x === wd && date + 7 > dim) : null;
  // Wie bei Cron: sind Tag und Wochentag beide eingeschränkt, genügt einer von beiden.
  if (domOk == null && dowOk == null) return true;
  if (domOk == null) return dowOk;
  if (dowOk == null) return domOk;
  return domOk || dowOk;
}

const mondayOf = (t) => {
  const d = new Date(t);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
};

/** Nächster Termin nach `after` (ms) oder null. `weeks`/`anchor` für „alle n Wochen“. */
export function cronNext(expr, after = Date.now(), { weeks = 1, anchor = null } = {}) {
  const c = typeof expr === 'string' ? parseCron(expr) : expr;
  if (!c) return null;
  const day = new Date(after);
  day.setHours(0, 0, 0, 0);
  const base = anchor != null ? mondayOf(anchor) : null;
  for (let i = 0; i < 366 * 4; i++) {
    if (dayMatches(c, day)) {
      const okWeek = !(weeks > 1 && base != null) || ((Math.round((mondayOf(day.getTime()) - base) / (7 * DAY_MS)) % weeks) + weeks) % weeks === 0;
      if (okWeek) {
        for (const h of c.hour) {
          for (const m of c.minute) {
            const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime();
            if (t > after) return t;
          }
        }
      }
    }
    day.setDate(day.getDate() + 1);
  }
  return null;
}

/** Cron für die einfachen Wiederholungen aus Fälligkeit (Datum + Uhrzeit). */
export function presetCron(kind, due) {
  const d = new Date(due || Date.now());
  const hm = `${d.getMinutes()} ${d.getHours()}`;
  if (kind === 'daily') return `${hm} * * *`;
  if (kind === 'weekly') return `${hm} * * ${d.getDay()}`;
  if (kind === 'monthly') return d.getDate() > 28 ? `${hm} L * *` : `${hm} ${d.getDate()} * *`;
  if (kind === 'yearly') return `${hm} ${d.getDate()} ${d.getMonth() + 1} *`;
  return '';
}

export function presetLabel(kind, due) {
  const d = new Date(due || Date.now());
  const at = `um ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (kind === 'daily') return `Täglich ${at}`;
  if (kind === 'weekly') return `Jeden ${WD[d.getDay()]} ${at}`;
  if (kind === 'monthly') return d.getDate() > 28 ? `Am Monatsletzten ${at}` : `Am ${d.getDate()}. jedes Monats ${at}`;
  if (kind === 'yearly') return `Jedes Jahr am ${d.getDate()}. ${MONTHS[d.getMonth()]} ${at}`;
  return '';
}

/** Wiederholung (ggf.) zur Fälligkeit passend neu aufbauen. */
export function buildRepeat(kind, due, custom = null) {
  if (!kind) return null;
  if (kind === 'custom') {
    if (!custom?.cron || !parseCron(custom.cron)) return null;
    const weeks = Math.max(1, Math.min(8, Math.round(Number(custom.weeks) || 1)));
    return { kind, cron: custom.cron.trim(), weeks, label: String(custom.label || custom.cron).trim(), text: String(custom.text || '').trim(), anchor: custom.anchor || due || Date.now() };
  }
  return { kind, cron: presetCron(kind, due), weeks: 1, label: presetLabel(kind, due), text: '', anchor: due || Date.now() };
}

export const nextOf = (repeat, after) => (repeat ? cronNext(repeat.cron, after, { weeks: repeat.weeks || 1, anchor: repeat.anchor }) : null);

// ---------------------------------------------------------------- Bestand

export const emptyTodo = () => ({ items: [] });

export function sanitizeTodo(raw) {
  const out = emptyTodo();
  for (const x of Array.isArray(raw?.items) ? raw.items : []) {
    const title = String(x?.title || '').trim();
    if (!title) continue;
    const r = x.repeat && parseCron(x.repeat.cron) ? {
      kind: String(x.repeat.kind || 'custom'), cron: String(x.repeat.cron), weeks: Math.max(1, Number(x.repeat.weeks) || 1),
      label: String(x.repeat.label || x.repeat.cron), text: String(x.repeat.text || ''), anchor: Number(x.repeat.anchor) || Number(x.due) || null,
    } : null;
    out.items.push({
      id: String(x.id || uid()), title, created: Number(x.created) || Date.now(), done: Number(x.done) || 0,
      due: Number(x.due) || 0, notify: !!x.notify && !!Number(x.due), snooze: Number(x.snooze) || 0, repeat: r,
    });
  }
  return out;
}

export function addTodo(state, title, now = Date.now()) {
  const t = String(title || '').trim();
  if (!t) return null;
  const item = { id: uid(), title: t, created: now, done: 0, due: 0, notify: false, snooze: 0, repeat: null };
  state.items.unshift(item);
  return item;
}

/** Abhaken: wiederkehrende rücken zum nächsten Termin vor, alle anderen sind erledigt. */
export function completeTodo(item, now = Date.now()) {
  if (item.repeat) {
    const next = nextOf(item.repeat, Math.max(now, item.due || now));
    if (next) {
      item.due = next;
      item.snooze = 0;
      return 'next';
    }
  }
  item.done = now;
  item.snooze = 0;
  return 'done';
}

/** Offene zuerst nach Fälligkeit (ohne Datum zuletzt, dann neueste zuerst). */
export function openTodos(state) {
  return state.items.filter((x) => !x.done).sort((a, b) => (a.due || Infinity) - (b.due || Infinity) || b.created - a.created);
}

export const doneTodos = (state) => state.items.filter((x) => x.done).sort((a, b) => b.done - a.done);

// ---------------------------------------------------------------- Erinnerungen

export const reminderKey = (item) => `todo:${item.id}:${item.due}`;
export const reminderAt = (item) => Math.max(item.due || 0, item.snooze || 0);

/** Erinnerungen von `from` bis `days` Tage voraus (auch schon fällige der letzten zwei Tage). */
export function upcomingTodo(state, now = Date.now(), days = 14) {
  return state.items
    .filter((x) => !x.done && x.notify && x.due)
    .map((x) => ({ key: reminderKey(x), id: x.id, at: reminderAt(x), title: x.title, repeat: x.repeat?.label || '' }))
    .filter((r) => r.at > now - 2 * DAY_MS && r.at < now + days * DAY_MS)
    .sort((a, b) => a.at - b.at);
}

export const dueTodo = (state, now = Date.now()) => upcomingTodo(state, now, 0).filter((r) => r.at <= now);

/** Fälligkeit kurz und menschlich: „Heute 18:00“, „Morgen“, „Do. 24.10.“, „Überfällig seit …“. */
export function dueText(due, now = Date.now()) {
  if (!due) return '';
  const d = new Date(due);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - today.getTime()) / DAY_MS);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : diff === -1 ? 'Gestern'
    : `${WD[d.getDay()].slice(0, 2)}. ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear() !== today.getFullYear() ? String(d.getFullYear()).slice(2) : ''}`;
  return `${day} ${hm}`;
}
