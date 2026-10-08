// Datenmodell und reine Operationen darauf (framework-frei, unter Node testbar).
//
// state = {
//   version: 1,
//   recipes: [{ id, title, ratingElika, ratingJanik, ingredients[], steps[], video, notes, source, createdAt, updatedAt }],
//   plan: { 'YYYY-MM-DD': { slots: { breakfast: [entry], lunch: [], dinner: [], <extraId>: [] }, extras: [{ id, label }] } },
// }
// entry = { id, title, recipeId?, note?, who?, leftover?, order? }
//   who: 'E' (nur Elika) | 'J' (nur Janik)
//   leftover: true = „Rest von gestern Abend" (zeigt live das Abendessen des Vortags)
//   order: { rid, amount, instead } = stattdessen bestellt (Restaurant-ID, Betrag in €, ursprüngliches Gericht)
// restaurants: [{ id, name }]
// shopping: siehe shopping.mjs
//
// Ein Tag existiert im Plan nur, solange er etwas enthält; leere Tage werden entfernt.

import { emptyShopping, sanitizeShopping } from './shopping.mjs';
import { emptyPantry, sanitizePantry } from './pantry.mjs';

export const MEALS = [
  { key: 'breakfast', label: 'Frühstück', short: 'Früh', emoji: '🌅' },
  { key: 'lunch', label: 'Mittagessen', short: 'Mittag', emoji: '☀️' },
  { key: 'dinner', label: 'Abendessen', short: 'Abend', emoji: '🌙' },
];
export const EXTRA_EMOJI = '🍴';
const MEAL_KEYS = MEALS.map((m) => m.key);

export function uid(prefix = '') {
  const rnd = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix + rnd;
}

export function emptyState() {
  return { version: 4, recipes: [], plan: {}, restaurants: [], shopping: emptyShopping(), pantry: emptyPantry() };
}

export function emptyDay() {
  return { slots: { breakfast: [], lunch: [], dinner: [] }, extras: [] };
}

export function getDay(plan, iso) {
  return plan[iso] || emptyDay();
}

export function ensureDay(plan, iso) {
  if (!plan[iso]) plan[iso] = emptyDay();
  const day = plan[iso];
  day.slots ||= {};
  day.extras ||= [];
  for (const k of MEAL_KEYS) day.slots[k] ||= [];
  for (const x of day.extras) day.slots[x.id] ||= [];
  return day;
}

export function isDayEmpty(day) {
  return !day || (!(day.extras || []).length && Object.values(day.slots || {}).every((l) => !l.length));
}

export function pruneDay(plan, iso) {
  if (isDayEmpty(plan[iso])) delete plan[iso];
}

/** Sichtbare Slots eines Tages in fester Reihenfolge: drei Mahlzeiten, dann Zusätze. */
export function slotsOf(day) {
  const d = day || emptyDay();
  return [
    ...MEALS.map((m) => ({ key: m.key, label: m.label, short: m.short, emoji: m.emoji, extra: false })),
    ...(d.extras || []).map((x) => ({ key: x.id, label: x.label, short: x.label, emoji: EXTRA_EMOJI, extra: true })),
  ];
}

export function entriesOf(plan, iso, slot) {
  return plan[iso]?.slots?.[slot] || [];
}

export const PEOPLE = { E: 'Elika', J: 'Janik' };
const cleanWho = (w) => (w === 'E' || w === 'J' ? w : null);

/** Bestellung säubern: Betrag in Euro (zwei Nachkommastellen) oder null. */
export function cleanOrder(o) {
  if (!o || typeof o !== 'object') return null;
  const n = Number(String(o.amount ?? '').replace(',', '.'));
  return {
    rid: o.rid ? String(o.rid) : null,
    amount: Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null,
    instead: String(o.instead || '').trim(),
  };
}

export const LEFTOVER_TITLE = 'Rest von gestern Abend';
export const ORDER_TITLE = 'Bestellt';

/** Bestellt? Neue Einträge tragen `order`, im Altbestand stand es als Freitext („Bestellen"). */
export function isOrder(e) {
  return !!e?.order || (!e?.recipeId && !e?.leftover && /\bbestell/i.test(String(e?.title || '')));
}

export function addEntry(plan, iso, slot, { title, recipeId = null, note = '', who = null, leftover = false, order = null }, index = null) {
  const day = ensureDay(plan, iso);
  const entry = { id: uid('e-'), title: String(title || '').trim() };
  if (recipeId) entry.recipeId = recipeId;
  if (note) entry.note = note;
  if (cleanWho(who)) entry.who = cleanWho(who);
  if (leftover) entry.leftover = true;
  if (order) entry.order = cleanOrder(order);
  const list = day.slots[slot] ||= [];
  if (index == null || index > list.length) list.push(entry);
  else list.splice(Math.max(0, index), 0, entry);
  return entry;
}

export function findEntry(plan, iso, slot, id) {
  return entriesOf(plan, iso, slot).find((e) => e.id === id) || null;
}

export function updateEntry(plan, iso, slot, id, patch) {
  const e = findEntry(plan, iso, slot, id);
  if (!e) return null;
  if ('title' in patch) e.title = String(patch.title || '').trim();
  if ('recipeId' in patch) {
    if (patch.recipeId) e.recipeId = patch.recipeId;
    else delete e.recipeId;
  }
  if ('who' in patch) {
    if (cleanWho(patch.who)) e.who = cleanWho(patch.who);
    else delete e.who;
  }
  if ('note' in patch) {
    const note = String(patch.note || '').trim();
    if (note) e.note = note;
    else delete e.note;
  }
  if ('leftover' in patch) {
    if (patch.leftover) e.leftover = true;
    else delete e.leftover;
  }
  if ('order' in patch) {
    if (patch.order) e.order = cleanOrder(patch.order);
    else delete e.order;
  }
  return e;
}

export function removeEntry(plan, iso, slot, id) {
  const list = plan[iso]?.slots?.[slot];
  if (!list) return null;
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const [removed] = list.splice(i, 1);
  pruneDay(plan, iso);
  return removed;
}

/** Eintrag verschieben; `index` ist die Zielposition in der Zielliste (null = ans Ende). */
export function moveEntry(plan, from, to) {
  const src = plan[from.iso]?.slots?.[from.slot];
  if (!src) return false;
  const i = src.findIndex((e) => e.id === from.id);
  if (i < 0) return false;
  const [entry] = src.splice(i, 1);
  const day = ensureDay(plan, to.iso);
  const dst = day.slots[to.slot] ||= [];
  let index = to.index == null ? dst.length : to.index;
  if (src === dst && i < index) index -= 1;
  dst.splice(Math.max(0, Math.min(index, dst.length)), 0, entry);
  pruneDay(plan, from.iso);
  return true;
}

export function duplicateEntry(plan, from, to) {
  const e = findEntry(plan, from.iso, from.slot, from.id);
  if (!e) return null;
  return addEntry(plan, to.iso, to.slot, { title: e.title, recipeId: e.recipeId, note: e.note, who: e.who });
}

export function addExtraSlot(plan, iso, label) {
  const day = ensureDay(plan, iso);
  const x = { id: uid('x-'), label: String(label || '').trim() || 'Extra' };
  day.extras.push(x);
  day.slots[x.id] = [];
  return x;
}

export function renameExtraSlot(plan, iso, id, label) {
  const x = plan[iso]?.extras?.find((s) => s.id === id);
  if (x) x.label = String(label || '').trim() || x.label;
}

export function removeExtraSlot(plan, iso, id) {
  const day = plan[iso];
  if (!day) return;
  day.extras = (day.extras || []).filter((x) => x.id !== id);
  delete day.slots[id];
  pruneDay(plan, iso);
}

// ---------------------------------------------------------------- Rezepte

export function newRecipe(patch = {}) {
  const now = Date.now();
  return {
    id: uid('r-'),
    title: '',
    ratingElika: 0,
    ratingJanik: 0,
    ingredients: [],
    steps: [],
    video: '',
    notes: '',
    source: '',
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

export function clampRating(v) {
  const n = Math.round(Number(v || 0) * 2) / 2;
  return Math.max(0, Math.min(5, Number.isFinite(n) ? n : 0));
}

/** Ø der vergebenen Bewertungen; null, wenn noch niemand bewertet hat. */
export function averageRating(r) {
  const vals = [r.ratingElika, r.ratingJanik].filter((v) => v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function sortRecipes(list, mode = 'rating') {
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' });
  const copy = [...list];
  if (mode === 'alpha') return copy.sort(byTitle);
  return copy.sort((a, b) => (averageRating(b) ?? -1) - (averageRating(a) ?? -1) || byTitle(a, b));
}

/** Mehrzeiligen Text in Listenpunkte zerlegen; Aufzählungszeichen fallen weg. */
export function splitLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-–•*·▪︎◦]|\d{1,2}[.)]|[a-z][.)])\s+/i, '').trim())
    .filter(Boolean);
}

/** Wie oft und wann zuletzt ein Rezept im Plan stand. */
export function usageOf(plan, recipeId) {
  let count = 0;
  let last = null;
  for (const [iso, day] of Object.entries(plan)) {
    for (const list of Object.values(day.slots || {})) {
      for (const e of list) {
        if (e.recipeId === recipeId) {
          count++;
          if (!last || iso > last) last = iso;
        }
      }
    }
  }
  return { count, last };
}

/** Freitext-Titel aus dem Plan (ohne Rezeptbezug), häufigste zuerst — für Vorschläge. */
export function historyTitles(plan, recipes = []) {
  const known = new Set(recipes.map((r) => r.title.trim().toLowerCase()));
  const map = new Map();
  for (const [iso, day] of Object.entries(plan)) {
    for (const list of Object.values(day.slots || {})) {
      for (const e of list) {
        if (e.recipeId || !e.title || e.leftover || e.order) continue;
        const key = e.title.trim().toLowerCase();
        if (known.has(key)) continue;
        const cur = map.get(key) || { title: e.title.trim(), count: 0, last: iso };
        cur.count++;
        if (iso > cur.last) cur.last = iso;
        map.set(key, cur);
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
}

export function unlinkRecipe(plan, recipeId, title) {
  for (const day of Object.values(plan)) {
    for (const list of Object.values(day.slots || {})) {
      for (const e of list) {
        if (e.recipeId === recipeId) {
          delete e.recipeId;
          if (title) e.title = title;
        }
      }
    }
  }
}

/** Gespeicherten Stand prüfen und auf das aktuelle Format bringen. */
export function sanitizeState(raw) {
  const s = emptyState();
  if (!raw || typeof raw !== 'object') return s;
  s.recipes = (Array.isArray(raw.recipes) ? raw.recipes : [])
    .filter((r) => r && r.id && String(r.title || '').trim())
    .map((r) => newRecipe({
      ...r,
      title: String(r.title).trim(),
      ratingElika: clampRating(r.ratingElika),
      ratingJanik: clampRating(r.ratingJanik),
      ingredients: (Array.isArray(r.ingredients) ? r.ingredients : splitLines(r.ingredients)).map(String).filter(Boolean),
      steps: (Array.isArray(r.steps) ? r.steps : splitLines(r.steps)).map(String).filter(Boolean),
      video: String(r.video || ''),
      notes: String(r.notes || ''),
      source: String(r.source || ''),
    }));
  const plan = raw.plan && typeof raw.plan === 'object' ? raw.plan : {};
  for (const [iso, day] of Object.entries(plan)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !day) continue;
    const d = emptyDay();
    d.extras = (Array.isArray(day.extras) ? day.extras : []).filter((x) => x?.id).map((x) => ({ id: String(x.id), label: String(x.label || 'Extra') }));
    for (const key of [...MEAL_KEYS, ...d.extras.map((x) => x.id)]) {
      d.slots[key] = (day.slots?.[key] || [])
        .filter((e) => e && String(e.title || '').trim())
        .map((e) => {
          const out = { id: String(e.id || uid('e-')), title: String(e.title).trim() };
          if (e.recipeId) out.recipeId = String(e.recipeId);
          if (e.note) out.note = String(e.note);
          if (cleanWho(e.who)) out.who = e.who;
          if (e.leftover) out.leftover = true;
          if (e.order) out.order = cleanOrder(e.order);
          return out;
        });
    }
    if (!isDayEmpty(d)) s.plan[iso] = d;
  }
  const seen = new Set();
  s.restaurants = (Array.isArray(raw.restaurants) ? raw.restaurants : [])
    .filter((x) => x?.id && String(x.name || '').trim() && !seen.has(x.id) && seen.add(x.id))
    .map((x) => ({ id: String(x.id), name: String(x.name).trim() }));
  s.shopping = sanitizeShopping(raw.shopping);
  s.pantry = sanitizePantry(raw.pantry);
  return s;
}

// ---------------------------------------------------------------- Restaurants

export function addRestaurant(list, name) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const same = list.find((r) => r.name.toLowerCase() === clean.toLowerCase());
  if (same) return same;
  const r = { id: uid('o-'), name: clean };
  list.push(r);
  return r;
}

/** Wie oft bei welchem Restaurant bestellt wurde (für die Sortierung der Auswahl). */
export function restaurantUsage(plan) {
  const out = {};
  for (const day of Object.values(plan)) {
    for (const list of Object.values(day.slots || {})) {
      for (const e of list) if (e.order?.rid) out[e.order.rid] = (out[e.order.rid] || 0) + 1;
    }
  }
  return out;
}
