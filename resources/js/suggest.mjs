// Küchen-Helfer ohne Framework: Abendessen-Vorschläge, Kochhistorie, Zutaten → Einkauf,
// Dubletten-Erkennung. Alles rein rechnerisch und unter Node testbar.

import { averageRating, historyTitles, isOrder } from './model.mjs';
import { addDays, parseIso } from './dates.mjs';
import { normalize, tokens, distance } from './search.mjs';

const DAY_MS = 86400000;
export const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / DAY_MS);

/** Schlüssel eines Gerichts: Rezept-ID oder normalisierter Freitext. */
export function dishKey(e) {
  return e.recipeId ? `r:${e.recipeId}` : `t:${normalize(e.title)}`;
}

/** Abendessen des Vortags (ohne Reste und Bestellungen) — für „Rest von gestern". */
export function previousDinner(plan, iso) {
  return (plan[addDays(iso, -1)]?.slots?.dinner || []).filter((e) => !e.leftover);
}

// ---------------------------------------------------------------- Kochhistorie

/** Wann ein Rezept gekocht wurde (bis heute) und wann es noch geplant ist. */
export function cookHistory(plan, recipeId, today) {
  const cooked = [];
  const planned = [];
  for (const [iso, day] of Object.entries(plan)) {
    const hit = Object.values(day.slots || {}).some((list) => list.some((e) => e.recipeId === recipeId && !e.order));
    if (!hit) continue;
    (iso <= today ? cooked : planned).push(iso);
  }
  cooked.sort().reverse();
  planned.sort();
  const last = cooked[0] || null;
  return { cooked, planned, count: cooked.length, last, daysSince: last ? daysBetween(last, today) : null, next: planned[0] || null };
}

// ---------------------------------------------------------------- Abendessen-Vorschläge

/**
 * Zehn Vorschläge für ein leeres Abendessen. Gewichtet nach Bewertung und danach, wie
 * lange es das Gericht nicht gab; kürzlich schon gezeigte Vorschläge treten zurück, damit
 * die Auswahl durchrotiert. Gezogen wird ohne Zurücklegen (Efraimidis–Spirakis).
 */
export function suggestDinners({ recipes, plan, iso, today, shown = {}, n = 10, random = Math.random }) {
  const last = new Map();
  const near = new Set();
  for (const [day, d] of Object.entries(plan)) {
    const gap = Math.abs(daysBetween(day, iso));
    for (const list of Object.values(d.slots || {})) {
      for (const e of list) {
        if (e.leftover || isOrder(e)) continue;
        const k = dishKey(e);
        if (gap <= 4) near.add(k);
        if (day <= today && (!last.has(k) || day > last.get(k))) last.set(k, day);
      }
    }
  }
  const pool = recipes.map((r) => ({ key: `r:${r.id}`, title: r.title, recipeId: r.id, rating: averageRating(r) }));
  const known = new Set(recipes.map((r) => normalize(r.title)));
  for (const h of historyTitles(plan, recipes)) {
    // Freitext nur, wenn er sich wie ein Gericht wiederholt hat — Notizen wie „Hamburg" oder
    // Varianten eines vorhandenen Rezepts bleiben draußen.
    if (h.count < 3 || known.has(normalize(h.title)) || /\bbestell/i.test(h.title)) continue;
    if (similarRecipes(recipes, h.title).length) continue;
    pool.push({ key: `t:${normalize(h.title)}`, title: h.title, recipeId: null, rating: null, free: true });
  }
  const now = Date.now();
  const scored = pool.filter((c) => !near.has(c.key)).map((c) => {
    const seen = last.get(c.key);
    const since = seen ? daysBetween(seen, today) : null;
    const base = c.free ? 0.35 : c.rating == null ? 0.55 : 0.25 + (c.rating / 5) ** 2;
    const recency = Math.min(1.6, Math.max(0.08, (since ?? 50) / 35));
    const recent = (shown[c.key] || []).filter((t) => now - t < 3 * DAY_MS).length;
    const w = base * recency * 0.3 ** recent;
    return { ...c, since, sort: random() ** (1 / Math.max(w, 1e-6)) };
  });
  return scored.sort((a, b) => b.sort - a.sort).slice(0, n).map(({ sort, free, ...c }) => c);
}

/** Gezeigte Vorschläge merken (nur die letzten sieben Tage). */
export function rememberShown(shown, keys, now = Date.now()) {
  const out = {};
  for (const [k, list] of Object.entries(shown || {})) {
    const keep = (list || []).filter((t) => now - t < 7 * DAY_MS);
    if (keep.length) out[k] = keep;
  }
  for (const k of keys) (out[k] ||= []).push(now);
  return out;
}

// ---------------------------------------------------------------- Zutaten → Einkauf

const UNITS = [
  'g', 'gr', 'gramm', 'kg', 'mg', 'ml', 'l', 'liter', 'cl', 'dl', 'el', 'tl', 'essloffel', 'teeloffel', 'msp', 'prise', 'prisen',
  'pck', 'pckg', 'packung', 'packungen', 'paket', 'dose', 'dosen', 'glas', 'glaser', 'bund', 'stk', 'stuck', 'zehe', 'zehen',
  'becher', 'tasse', 'tassen', 'scheibe', 'scheiben', 'handvoll', 'hand', 'voll', 'schuss', 'spritzer', 'kopf', 'knolle',
  'stange', 'stangen', 'zweig', 'zweige', 'blatt', 'blatter', 'beutel', 'flasche', 'etwas', 'ca', 'circa', 'nach', 'belieben',
  'cup', 'cups', 'tbsp', 'tsp', 'oz', 'x', 'grosse', 'grosser', 'grosses', 'kleine', 'kleiner', 'kleines', 'mittelgrosse',
  'mittelgrosser', 'frische', 'frischer', 'frisches', 'frisch', 'gehackte', 'gehackter',
];
const UNIT_SET = new Set(UNITS);

/** „200 g Spaghetti (Vollkorn)" → „Spaghetti". Zubereitungshinweise nach dem Komma fallen weg. */
export function ingredientName(line) {
  let s = String(line || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const comma = s.indexOf(',');
  if (comma > 0 && /^\s*[a-zäöüß]/.test(s.slice(comma + 1))) s = s.slice(0, comma);
  const words = s.split(' ');
  while (words.length > 1) {
    const w = words[0];
    const n = normalize(w).replace(/\s+/g, '');
    if (/^[\d½¼¾⅓⅔.,/–\-x]+[a-z]{0,3}$/i.test(w) || UNIT_SET.has(n) || UNIT_SET.has(n.replace(/\.$/, ''))) words.shift();
    else break;
  }
  const out = words.join(' ').replace(/^(?:von|vom|der|die|das)\s+/i, '').trim();
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** Vorrats-Eintrag (mit Bestand), der zu einer Zutatenzeile passt, sonst null. */
export function pantryMatch(line, items) {
  const text = normalize(line);
  const words = text.split(' ').filter(Boolean);
  if (!words.length) return null;
  for (const it of items) {
    if (!(it.qty > 0)) continue;
    const name = tokens(it.name).filter((t) => t.length >= 3);
    if (!name.length) continue;
    const all = name.every((t) => words.some((w) => w.startsWith(t) || (t.length >= 5 && w.includes(t)) || (t.length >= 6 && distance(t, w.slice(0, t.length), 1) <= 1)));
    if (all) return it;
  }
  return null;
}

// ---------------------------------------------------------------- Dubletten

const STOP = new Set(['mit', 'und', 'der', 'die', 'das', 'den', 'dem', 'in', 'im', 'an', 'am', 'auf', 'aus', 'vom', 'von', 'zum', 'zur', 'a', 'la', 'al', 'alla', 'e', 'con', 'de', 'di', 'en', 'the', 'and', 'with', 'nach', 'art', 'style']);
const sig = (title) => tokens(title).filter((t) => !STOP.has(t));

/** Rezepte mit sehr ähnlichem Titel, beste zuerst: [{ recipe, score }] (score 0–1). */
export function similarRecipes(recipes, title, excludeId = null) {
  const full = normalize(title);
  const a = sig(title);
  if (full.length < 3 || !a.length) return [];
  const out = [];
  for (const r of recipes) {
    if (r.id === excludeId) continue;
    const other = normalize(r.title);
    let score = 0;
    if (other === full) score = 1;
    else if (full.length >= 6 && distance(full, other, 2) <= 2) score = 0.95;
    else {
      const b = sig(r.title);
      const matches = (x, list) => list.some((y) => y === x || (x.length >= 5 && y.length >= 5 && distance(x, y, 1) <= 1));
      const shared = a.filter((x) => matches(x, b)).length;
      const union = a.length + b.length - shared;
      score = union ? shared / union : 0;
      if (shared < Math.min(2, Math.min(a.length, b.length))) score = Math.min(score, 0.49);
    }
    if (score >= 0.6) out.push({ recipe: r, score: Math.round(score * 100) / 100 });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 3);
}
