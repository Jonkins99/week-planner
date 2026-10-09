// Aquarium-Helfer: reine Logik (unter Node testbar, kein DOM).
// Zwei fest eingebaute Becken, Messungen mit beliebig vielen Werten, Zielwerte,
// Wasserwechsel, Futterplan und daraus abgeleitete Aufgaben.

export const PARAMS = [
  { key: 'ph', label: 'pH', unit: '', step: 0.1, digits: 1, target: { min: 6.5, max: 7.5 } },
  { key: 'kh', label: 'KH', unit: '°dH', step: 0.5, digits: 1, target: { min: 3, max: 8 } },
  { key: 'gh', label: 'GH', unit: '°dH', step: 0.5, digits: 1, target: { min: 4, max: 12 } },
  { key: 'ec', label: 'Leitwert', unit: 'µS/cm', step: 10, digits: 0, target: { min: 200, max: 500 } },
  { key: 'no3', label: 'NO₃', unit: 'mg/l', step: 1, digits: 0, target: { min: 5, max: 25 } },
  { key: 'co2', label: 'CO₂', unit: 'mg/l', step: 1, digits: 0, target: { min: 15, max: 30 } },
  { key: 'temp', label: 'Temperatur', unit: '°C', step: 0.5, digits: 1, target: { min: 23, max: 27 } },
];

export const PARAM = Object.fromEntries(PARAMS.map((p) => [p.key, p]));

export const PHASES = [
  { key: 'before', label: 'Vor Wasserwechsel', short: 'Vor WW' },
  { key: 'after', label: 'Nach Wasserwechsel', short: 'Nach WW' },
];

export const TANKS = [
  { id: 't54', name: '54 Liter', liters: 54 },
  { id: 'cube', name: 'Cube', liters: 0 },
];

export const MAX_FEED_SLOTS = 3;
export const DAY_MS = 86400000;
const HOUR_MS = 3600000;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const num = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const pad = (n) => String(n).padStart(2, '0');
export const isoDay = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const validTime = (t) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || '')) ? t : null);

/** Zeitpunkt aus Tag (yyyy-mm-dd) und Uhrzeit (hh:mm), lokal. */
export function atTime(day, time) {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi).getTime();
}

/** Wochentag 0 = Montag … 6 = Sonntag. */
export const weekdayOf = (ts) => (new Date(ts).getDay() + 6) % 7;

function emptyFeed() {
  return Array.from({ length: 7 }, () => []);
}

function defaultTank(t) {
  return {
    ...t,
    targets: Object.fromEntries(PARAMS.map((p) => [p.key, { ...p.target }])),
    wc: { every: 7, time: '18:00', start: null, enabled: true },
    feed: emptyFeed(),
    feedEnabled: true,
    stock: [],
    advice: null,
  };
}

export function emptyAqua() {
  return {
    v: 1,
    tanks: TANKS.map(defaultTank),
    foods: [],
    measurements: [],
    waterChanges: [],
    reminders: {},
  };
}

function cleanRange(r, fallback) {
  const min = num(r?.min);
  const max = num(r?.max);
  if (min == null && max == null) return fallback ? { ...fallback } : { min: null, max: null };
  return { min, max: max != null && min != null && max < min ? min : max };
}

/** Gespeicherten Stand robust einlesen (fehlende Felder ergänzen, Müll verwerfen). */
export function sanitizeAqua(raw) {
  const base = emptyAqua();
  if (!raw || typeof raw !== 'object') return base;
  const tanks = base.tanks.map((def) => {
    const t = (Array.isArray(raw.tanks) ? raw.tanks : []).find((x) => x?.id === def.id) || {};
    const feed = emptyFeed().map((_, i) => (Array.isArray(t.feed?.[i]) ? t.feed[i] : [])
      .map((s) => ({ id: s?.id || uid(), time: validTime(s?.time) || '08:00', foods: (Array.isArray(s?.foods) ? s.foods : []).filter((f) => typeof f === 'string') }))
      .slice(0, MAX_FEED_SLOTS)
      .sort((a, b) => a.time.localeCompare(b.time)));
    return {
      ...def,
      name: String(t.name || def.name).slice(0, 40),
      liters: Math.max(0, num(t.liters) ?? def.liters),
      targets: Object.fromEntries(PARAMS.map((p) => [p.key, cleanRange(t.targets?.[p.key], t.targets ? null : p.target)])),
      wc: {
        every: Math.max(1, Math.min(60, Math.round(num(t.wc?.every) ?? 7))),
        time: validTime(t.wc?.time) || '18:00',
        start: num(t.wc?.start),
        enabled: t.wc?.enabled !== false,
      },
      feed,
      feedEnabled: t.feedEnabled !== false,
      stock: (Array.isArray(t.stock) ? t.stock : []).filter((s) => s?.name).map((s) => ({
        id: s.id || uid(),
        name: String(s.name).slice(0, 80),
        qty: Math.max(0, Math.round(num(s.qty) ?? 1)),
        added: num(s.added) || Date.now(),
        photo: !!s.photo,
        profile: s.profile && typeof s.profile === 'object' ? s.profile : null,
        profileAt: num(s.profileAt),
      })),
      advice: t.advice && typeof t.advice === 'object' ? t.advice : null,
    };
  });
  const ids = new Set(tanks.map((t) => t.id));
  const measurements = (Array.isArray(raw.measurements) ? raw.measurements : [])
    .filter((m) => m && ids.has(m.tank) && Number.isFinite(Number(m.at)))
    .map((m) => ({
      id: m.id || uid(),
      tank: m.tank,
      at: Number(m.at),
      created: num(m.created) || Number(m.at),
      values: Object.fromEntries(PARAMS.map((p) => [p.key, num(m.values?.[p.key])]).filter(([, v]) => v != null)),
      phase: m.phase === 'before' || m.phase === 'after' ? m.phase : null,
      note: String(m.note || '').slice(0, 2000),
    }))
    .filter((m) => Object.keys(m.values).length || m.note || m.phase)
    .sort((a, b) => a.at - b.at);
  return {
    v: 1,
    tanks,
    foods: (Array.isArray(raw.foods) ? raw.foods : []).filter((f) => f?.name).map((f) => ({ id: f.id || uid(), name: String(f.name).slice(0, 60) })),
    measurements,
    waterChanges: (Array.isArray(raw.waterChanges) ? raw.waterChanges : [])
      .filter((w) => w && ids.has(w.tank) && Number.isFinite(Number(w.at)))
      .map((w) => ({ id: w.id || uid(), tank: w.tank, at: Number(w.at), source: w.source === 'reminder' ? 'reminder' : 'manual' }))
      .sort((a, b) => a.at - b.at),
    reminders: raw.reminders && typeof raw.reminders === 'object' ? raw.reminders : {},
  };
}

// ------------------------------------------------------------ Messungen

export function fmtValue(key, v) {
  if (v == null || !Number.isFinite(v)) return '–';
  const p = PARAM[key];
  return v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: p ? Math.max(p.digits, v % 1 ? 1 : 0) : 2 });
}

export function fmtWithUnit(key, v) {
  const u = PARAM[key]?.unit;
  return `${fmtValue(key, v)}${u ? ` ${u}` : ''}`;
}

/** Werte aus einem Formular (Strings mit Komma oder Punkt) übernehmen. */
export function readValues(form) {
  const out = {};
  for (const p of PARAMS) {
    const v = num(form?.[p.key]);
    if (v != null) out[p.key] = v;
  }
  return out;
}

export function measurementsOf(state, tank) {
  return state.measurements.filter((m) => m.tank === tank).sort((a, b) => a.at - b.at);
}

/** Zeitreihe eines Werts: [{ at, v, m }]. */
export function seriesOf(list, key) {
  return list.filter((m) => m.values[key] != null).map((m) => ({ at: m.at, v: m.values[key], m }));
}

/** Letzter bekannter Wert je Parameter: { key: { v, at, prev } }. */
export function latestValues(list) {
  const out = {};
  for (const p of PARAMS) {
    const s = seriesOf(list, p.key);
    if (!s.length) continue;
    const last = s[s.length - 1];
    out[p.key] = { v: last.v, at: last.at, prev: s.length > 1 ? s[s.length - 2].v : null };
  }
  return out;
}

/** CO₂ aus pH und KH (Faustformel der Aquaristik): CO₂ ≈ 3 · KH · 10^(7 − pH). */
export function co2FromPhKh(ph, kh) {
  if (ph == null || kh == null || kh <= 0) return null;
  return Math.round(3 * kh * 10 ** (7 - ph) * 10) / 10;
}

export function rangeState(range, v) {
  if (v == null || !range) return 'none';
  if (range.min != null && v < range.min) return 'low';
  if (range.max != null && v > range.max) return 'high';
  return range.min == null && range.max == null ? 'none' : 'ok';
}

export function fmtRange(key, r) {
  if (!r || (r.min == null && r.max == null)) return 'kein Ziel';
  const u = PARAM[key]?.unit ? ` ${PARAM[key].unit}` : '';
  if (r.min != null && r.max != null) return `${fmtValue(key, r.min)}–${fmtValue(key, r.max)}${u}`;
  return r.min != null ? `ab ${fmtValue(key, r.min)}${u}` : `bis ${fmtValue(key, r.max)}${u}`;
}

// ------------------------------------------------------------ Wasserwechsel

/**
 * Wasserwechsel im Diagramm: die Mitte zwischen einer „Vor WW"-Messung und der nächsten
 * „Nach WW"-Messung (höchstens 48 h später, ohne weitere „Vor"-Messung dazwischen).
 * Zusätzlich als erledigt gemeldete Wechsel, wenn in ±12 h kein solches Paar liegt.
 */
export function waterChangeMarks(list, logged = []) {
  const marks = [];
  const sorted = [...list].sort((a, b) => a.at - b.at);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].phase !== 'before') continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const n = sorted[j];
      if (n.at - sorted[i].at > 48 * HOUR_MS || n.phase === 'before') break;
      if (n.phase === 'after') {
        marks.push({ at: Math.round((sorted[i].at + n.at) / 2), from: sorted[i].at, to: n.at, derived: true });
        break;
      }
    }
  }
  for (const w of logged) {
    if (!marks.some((m) => Math.abs(m.at - w.at) <= 12 * HOUR_MS)) marks.push({ at: w.at, derived: false });
  }
  return marks.sort((a, b) => a.at - b.at);
}

/** Zeitpunkt des letzten Wasserwechsels eines Beckens (gemeldet oder aus Messpaaren). */
export function lastWaterChange(state, tank) {
  const marks = waterChangeMarks(measurementsOf(state, tank), state.waterChanges.filter((w) => w.tank === tank));
  return marks.length ? marks[marks.length - 1].at : null;
}

/** Nächster fälliger Wasserwechsel (Zeitpunkt mit eingestellter Uhrzeit). */
export function nextWaterChange(state, tank) {
  const t = state.tanks.find((x) => x.id === tank);
  if (!t || !t.wc.enabled) return null;
  const last = lastWaterChange(state, tank);
  const base = last ?? t.wc.start ?? null;
  if (base == null) return null;
  const day = isoDay(base + t.wc.every * DAY_MS);
  return atTime(day, t.wc.time);
}

/** Abstände zwischen Wasserwechseln in Tagen (für die Historie). */
export function waterChangeHistory(state, tank) {
  const marks = waterChangeMarks(measurementsOf(state, tank), state.waterChanges.filter((w) => w.tank === tank));
  return marks.map((m, i) => ({ ...m, gap: i ? Math.round((m.at - marks[i - 1].at) / DAY_MS * 10) / 10 : null })).reverse();
}

// ------------------------------------------------------------ Erinnerungen

/**
 * Alle Erinnerungen, die zu `now` anstehen (fällig, nicht erledigt, nicht verschoben).
 * Fütterungen gelten nur für den laufenden Tag, länger als 6 h zurück lohnt keine Meldung.
 * Ein Wasserwechsel bleibt fällig, bis er erledigt ist.
 */
export function dueReminders(state, now = Date.now()) {
  const out = [];
  const rem = state.reminders || {};
  for (const t of state.tanks) {
    const wcAt = nextWaterChange(state, t.id);
    if (wcAt != null) {
      const key = `wc:${t.id}:${isoDay(wcAt)}`;
      const r = rem[key] || {};
      if (!r.done && wcAt <= now && (!r.until || r.until <= now)) {
        out.push({ key, kind: 'wc', tank: t.id, at: wcAt, snoozes: r.count || 0, level: escalation(r.count || 0) });
      }
    }
    if (!t.feedEnabled) continue;
    for (const ev of feedingsOn(state, t, isoDay(now))) {
      const r = rem[ev.key] || {};
      if (r.done || ev.at > now || now - ev.at > 6 * HOUR_MS) continue;
      if (r.until && r.until > now) continue;
      out.push({ ...ev, snoozes: r.count || 0, level: 0 });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Fütterungen eines Tages: [{ key, kind: 'feed', tank, at, slot, foods }]. */
export function feedingsOn(state, tank, day) {
  const t = typeof tank === 'string' ? state.tanks.find((x) => x.id === tank) : tank;
  if (!t) return [];
  const wd = weekdayOf(atTime(day, '12:00'));
  return (t.feed[wd] || []).filter((s) => s.foods.length).map((s, i) => ({
    key: `feed:${t.id}:${day}:${s.time}`,
    kind: 'feed',
    tank: t.id,
    at: atTime(day, s.time),
    slot: i,
    foods: s.foods,
  }));
}

/** Nächster Zeitpunkt, an dem sich an den fälligen Erinnerungen etwas ändern kann. */
export function nextReminderAt(state, now = Date.now()) {
  const times = [];
  const rem = state.reminders || {};
  for (const t of state.tanks) {
    const wcAt = nextWaterChange(state, t.id);
    if (wcAt != null) {
      const r = rem[`wc:${t.id}:${isoDay(wcAt)}`] || {};
      if (!r.done) times.push(Math.max(wcAt, r.until || 0));
    }
    if (!t.feedEnabled) continue;
    for (const d of [0, 1]) {
      for (const ev of feedingsOn(state, t, isoDay(now + d * DAY_MS))) {
        const r = rem[ev.key] || {};
        if (!r.done) times.push(Math.max(ev.at, r.until || 0));
      }
    }
  }
  return times.filter((x) => x > now).sort((a, b) => a - b)[0] ?? null;
}

/** Kommende Erinnerungen der nächsten Tage (für den Service Worker). */
export function upcomingReminders(state, now = Date.now(), days = 3) {
  const out = [];
  const rem = state.reminders || {};
  for (const t of state.tanks) {
    const wcAt = nextWaterChange(state, t.id);
    if (wcAt != null) {
      const key = `wc:${t.id}:${isoDay(wcAt)}`;
      const r = rem[key] || {};
      if (!r.done) out.push({ key, kind: 'wc', tank: t.id, at: Math.max(wcAt, r.until || 0), level: escalation(r.count || 0), snoozes: r.count || 0 });
    }
    if (!t.feedEnabled) continue;
    for (let d = 0; d < days; d++) {
      for (const ev of feedingsOn(state, t, isoDay(now + d * DAY_MS))) {
        const r = rem[ev.key] || {};
        if (!r.done && ev.at + 6 * HOUR_MS > now) out.push({ ...ev, at: Math.max(ev.at, r.until || 0), level: 0 });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Eindringlichkeit einer Wasserwechsel-Erinnerung: ab dem 2. Aufschieben steigt sie. */
export function escalation(snoozes) {
  if (snoozes < 2) return 0;
  return Math.min(3, snoozes - 1);
}

/** Tag nach `now` zur eingestellten Uhrzeit (für „Morgen wieder erinnern"). */
export function tomorrowAt(time, now = Date.now()) {
  return atTime(isoDay(now + DAY_MS), time);
}

/** Erinnerung beantworten. Gibt den neuen Stand zurück (unverändert gelassen: Eingabe). */
export function answerReminder(state, key, action, now = Date.now()) {
  const reminders = { ...(state.reminders || {}) };
  const r = { ...(reminders[key] || {}) };
  const [kind, tank] = key.split(':');
  let waterChanges = state.waterChanges;
  if (action === 'done') {
    r.done = now;
    r.until = null;
    if (kind === 'wc') waterChanges = [...waterChanges, { id: uid(), tank, at: now, source: 'reminder' }];
  } else if (action === 'snooze') {
    r.count = (r.count || 0) + 1;
    if (kind === 'wc') {
      const t = state.tanks.find((x) => x.id === tank);
      r.until = tomorrowAt(t?.wc.time || '18:00', now);
    } else {
      r.until = now + HOUR_MS;
    }
  }
  reminders[key] = r;
  return { ...state, reminders: pruneReminders(reminders, now), waterChanges };
}

/** Alte Einträge (älter als 30 Tage) fallen weg, damit der Speicher nicht wächst. */
export function pruneReminders(rem, now = Date.now()) {
  const out = {};
  for (const [k, r] of Object.entries(rem)) {
    const day = k.split(':')[2];
    const ts = day ? atTime(day, '12:00') : now;
    if (now - ts < 30 * DAY_MS) out[k] = r;
  }
  return out;
}

// ------------------------------------------------------------ Futterplan

export function addFeedSlot(tank, day, time = '08:00') {
  const slots = tank.feed[day];
  if (slots.length >= MAX_FEED_SLOTS) return false;
  slots.push({ id: uid(), time, foods: [] });
  slots.sort((a, b) => a.time.localeCompare(b.time));
  return true;
}

/** Den Plan eines Tages auf alle anderen Tage übertragen. */
export function copyFeedDay(tank, day) {
  const src = tank.feed[day];
  tank.feed = tank.feed.map((slots, i) => (i === day ? slots : src.map((s) => ({ id: uid(), time: s.time, foods: [...s.foods] }))));
}

// ------------------------------------------------------------ Aufgaben & Schieflagen

const TIPS = {
  ph: {
    high: 'CO₂-Zufuhr prüfen bzw. leicht erhöhen; bei hoher KH mit Osmosewasser verschneiden.',
    low: 'KH prüfen (pH-Sturz-Gefahr), CO₂ etwas zurückdrehen, Teilwasserwechsel.',
  },
  kh: {
    high: 'Beim Wasserwechsel einen Teil Osmose- oder Regenwasser beimischen.',
    low: 'Mehr Leitungswasser beim Wechsel oder KH-Aufhärter; zu wenig KH lässt den pH schwanken.',
  },
  gh: {
    high: 'Mit Osmosewasser verschneiden.',
    low: 'GH-Aufhärtesalz (Mineralsalz) beim Wasserwechsel zugeben.',
  },
  ec: {
    high: 'Größeren Wasserwechsel machen, Düngung und Futter reduzieren.',
    low: 'Aufsalzen oder Dünger ergänzen; prüfen, ob das Wechselwasser zu weich ist.',
  },
  no3: {
    high: 'Wasserwechsel vorziehen, sparsamer füttern, Nitrat-Dünger reduzieren, schnellwachsende Pflanzen helfen.',
    low: 'Nitrat gezielt düngen – bei zu wenig NO₃ hungern die Pflanzen und Algen profitieren.',
  },
  co2: {
    high: 'CO₂ sofort reduzieren und belüften – hängen Fische an der Oberfläche, ist es akut.',
    low: 'CO₂-Zufuhr (Blasenzahl) leicht erhöhen, Strömung an der Oberfläche prüfen.',
  },
  temp: {
    high: 'Heizer und Raumtemperatur prüfen, Abdeckung öffnen, ggf. Lüfter; Licht kürzer.',
    low: 'Heizer prüfen (Einstellung, Funktion) und Raumtemperatur im Blick behalten.',
  },
};

/**
 * Aufgaben und Schieflagen eines Beckens. Jede hat `level` 3 = akut, 2 = Abweichung,
 * 1 = Hinweis und einen konkreten Tipp.
 */
export function deriveIssues(state, tank, now = Date.now()) {
  const t = state.tanks.find((x) => x.id === tank);
  if (!t) return [];
  const list = measurementsOf(state, tank);
  const out = [];
  const latest = latestValues(list);
  for (const p of PARAMS) {
    const r = t.targets[p.key];
    const l = latest[p.key];
    if (!l || !r || (r.min == null && r.max == null)) continue;
    const st = rangeState(r, l.v);
    const width = r.min != null && r.max != null ? Math.max(r.max - r.min, p.step) : Math.max(Math.abs(r.min ?? r.max) * 0.2, p.step);
    if (st === 'high' || st === 'low') {
      const off = st === 'high' ? l.v - r.max : r.min - l.v;
      const level = off > width * 0.5 ? 3 : 2;
      out.push({
        id: `range:${p.key}`, level, param: p.key, dir: st,
        title: `${p.label} zu ${st === 'high' ? 'hoch' : 'niedrig'}: ${fmtWithUnit(p.key, l.v)}`,
        detail: `Ziel ${fmtRange(p.key, r)}. ${TIPS[p.key][st]}`,
      });
      continue;
    }
    // Trend: letzte Messungen laufen auf eine Grenze zu und reißen sie absehbar.
    const s = seriesOf(list, p.key).slice(-4);
    if (s.length >= 3) {
      const slope = trendPerDay(s);
      const days = slope > 0 && r.max != null ? (r.max - l.v) / slope : slope < 0 && r.min != null ? (r.min - l.v) / slope : Infinity;
      if (days > 0 && days <= 7) {
        const dir = slope > 0 ? 'high' : 'low';
        out.push({
          id: `trend:${p.key}`, level: 1, param: p.key, dir,
          title: `${p.label} ${slope > 0 ? 'steigt' : 'fällt'} – Grenze in etwa ${Math.max(1, Math.round(days))} ${Math.round(days) === 1 ? 'Tag' : 'Tagen'}`,
          detail: `Aktuell ${fmtWithUnit(p.key, l.v)}, Ziel ${fmtRange(p.key, r)}. ${TIPS[p.key][dir]}`,
        });
      }
    }
  }
  // pH, KH und CO₂ passen nicht zusammen (CO₂-Test ungenau oder Dauertest falsch geeicht)
  const last = list[list.length - 1];
  if (last?.values.ph != null && last.values.kh != null && last.values.co2 != null) {
    const calc = co2FromPhKh(last.values.ph, last.values.kh);
    if (calc != null && Math.abs(calc - last.values.co2) > Math.max(10, last.values.co2 * 0.6)) {
      out.push({
        id: 'co2-mismatch', level: 1, param: 'co2',
        title: `CO₂ passt nicht zu pH und KH (rechnerisch ≈ ${fmtValue('co2', calc)} mg/l)`,
        detail: 'Huminstoffe oder Phosphatpuffer verfälschen die Rechnung; sonst Test oder Dauertest prüfen.',
      });
    }
  }
  // Wasserwechsel
  const wcAt = nextWaterChange(state, tank);
  if (wcAt != null && wcAt <= now + 12 * HOUR_MS) {
    const over = Math.floor((now - wcAt) / DAY_MS);
    out.push({
      id: 'wc', level: over >= 2 ? 3 : over >= 0 && wcAt <= now ? 2 : 1, kind: 'wc',
      title: wcAt > now ? 'Wasserwechsel steht heute an' : over >= 1 ? `Wasserwechsel seit ${over} ${over === 1 ? 'Tag' : 'Tagen'} überfällig` : 'Wasserwechsel ist fällig',
      detail: `Rhythmus: alle ${t.wc.every} Tage. Vorher und nachher messen, dann zeigt das Diagramm den Wechsel an.`,
    });
  } else if (wcAt == null && t.wc.enabled) {
    out.push({ id: 'wc-start', level: 1, kind: 'wc', title: 'Wasserwechsel-Rhythmus starten', detail: 'Einmal „Jetzt gewechselt" tippen – ab dann erinnert die App.' });
  }
  // Lange nicht gemessen
  const lastAt = list.length ? list[list.length - 1].at : null;
  if (lastAt == null) {
    out.push({ id: 'measure', level: 1, title: 'Noch keine Wasserwerte', detail: 'Erste Messung eintragen – einzelne Werte genügen.' });
  } else if (now - lastAt > 14 * DAY_MS) {
    const d = Math.floor((now - lastAt) / DAY_MS);
    out.push({ id: 'measure', level: 1, title: `Seit ${d} Tagen nicht gemessen`, detail: 'Mindestens alle zwei Wochen messen, um Schieflagen früh zu sehen.' });
  }
  return out.sort((a, b) => b.level - a.level);
}

/** Steigung pro Tag (kleinste Quadrate). */
export function trendPerDay(series) {
  const n = series.length;
  if (n < 2) return 0;
  const xs = series.map((s) => s.at / DAY_MS);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = series.reduce((a, s) => a + s.v, 0) / n;
  let num2 = 0;
  let den = 0;
  for (let i = 0; i < n; i++) { num2 += (xs[i] - mx) * (series[i].v - my); den += (xs[i] - mx) ** 2; }
  return den ? num2 / den : 0;
}

// ------------------------------------------------------------ Bestand

/** Passt eine Art zu den Zielwerten des Beckens? Liefert die Widersprüche. */
export function speciesConflicts(profile, targets) {
  if (!profile) return [];
  const out = [];
  for (const key of ['temp', 'ph', 'gh', 'kh']) {
    const need = profile[key];
    const have = targets?.[key];
    if (!need || !have || need.min == null || need.max == null || have.min == null || have.max == null) continue;
    if (have.max < need.min || have.min > need.max) {
      out.push(`${PARAM[key].label}: braucht ${fmtRange(key, need)}, Becken-Ziel ${fmtRange(key, have)}`);
    }
  }
  return out;
}
