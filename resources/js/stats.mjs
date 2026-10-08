// Statistik über den Wochenplan: Zeiträume (Woche, Monat, Jahr), Bestellquote, Ausgaben,
// meistgekochte und erstmals eingetragene Gerichte, Anteil Rezept/Freitext und der
// Vergleich mit dem vorherigen Zeitraum. Gezählt wird nur, was bis heute stattfand.

import { averageRating, isOrder } from './model.mjs';
import { addDays, mondayOf, isoWeek, rangeLabel, yearOfWeek, parseIso, isoDate } from './dates.mjs';
import { dishKey } from './suggest.mjs';

export const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const pad = (n) => String(n).padStart(2, '0');

/** Zeitraum um `anchor`: { kind, key, start, end, label, short } */
export function periodOf(kind, anchor) {
  const d = parseIso(anchor);
  if (kind === 'week') {
    const start = mondayOf(anchor);
    return { kind, key: `w${start}`, start, end: addDays(start, 6), label: `KW ${isoWeek(start)} · ${rangeLabel(start)} ${yearOfWeek(start)}`, short: `KW ${isoWeek(start)}` };
  }
  if (kind === 'year') {
    const y = d.getFullYear();
    return { kind, key: `y${y}`, start: `${y}-01-01`, end: `${y}-12-31`, label: String(y), short: String(y) };
  }
  const y = d.getFullYear();
  const m = d.getMonth();
  const last = new Date(y, m + 1, 0, 12).getDate();
  return { kind: 'month', key: `m${y}-${pad(m + 1)}`, start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-${pad(last)}`, label: `${MONTHS[m]} ${y}`, short: MONTHS[m] };
}

/** Anker des vorherigen (-1) oder nächsten (+1) Zeitraums. */
export function shiftPeriod(kind, anchor, dir) {
  if (kind === 'week') return addDays(mondayOf(anchor), dir * 7);
  const d = parseIso(anchor);
  if (kind === 'year') return `${d.getFullYear() + dir}-01-01`;
  return isoDate(new Date(d.getFullYear(), d.getMonth() + dir, 1, 12));
}

/** Erstes Auftreten jedes Gerichts im ganzen Plan. */
export function firstSeen(plan) {
  const first = new Map();
  for (const iso of Object.keys(plan).sort()) {
    for (const list of Object.values(plan[iso].slots || {})) {
      for (const e of list) {
        if (e.leftover || isOrder(e)) continue;
        const k = dishKey(e);
        if (!first.has(k)) first.set(k, iso);
      }
    }
  }
  return first;
}

/**
 * Kennzahlen eines Zeitraums. `titleOf(e)` liefert den angezeigten Titel (Rezepttitel live).
 */
export function computeStats({ plan, recipes, restaurants = [] }, period, { today, titleOf = (e) => e.title, first = null } = {}) {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const rest = new Map(restaurants.map((r) => [r.id, r]));
  const firsts = first || firstSeen(plan);
  const end = period.end < today ? period.end : today;
  const counts = new Map();
  const fresh = new Map();
  const shops = new Map();
  let dinnerDays = 0;
  let orderDays = 0;
  let orders = 0;
  let spend = 0;
  let paid = 0;
  let meals = 0;
  let withRecipe = 0;
  let free = 0;
  let days = 0;
  for (const [iso, day] of Object.entries(plan)) {
    if (iso < period.start || iso > end) continue;
    days++;
    const dinner = day.slots?.dinner || [];
    if (dinner.length) {
      dinnerDays++;
      if (dinner.some(isOrder)) orderDays++;
    }
    for (const list of Object.values(day.slots || {})) {
      for (const e of list) {
        if (isOrder(e)) {
          orders++;
          const amount = e.order?.amount || 0;
          spend += amount;
          if (amount) paid++;
          const id = e.order?.rid && rest.has(e.order.rid) ? e.order.rid : '?';
          const cur = shops.get(id) || { id, name: id === '?' ? 'Ohne Angabe' : rest.get(id).name, count: 0, amount: 0 };
          cur.count++;
          cur.amount += amount;
          shops.set(id, cur);
          continue;
        }
        if (e.leftover) continue;
        meals++;
        if (e.recipeId && byId.has(e.recipeId)) withRecipe++;
        else free++;
        const k = dishKey(e);
        const c = counts.get(k) || { key: k, title: titleOf(e), recipeId: e.recipeId && byId.has(e.recipeId) ? e.recipeId : null, count: 0 };
        c.count++;
        counts.set(k, c);
        if (firsts.get(k) === iso && !fresh.has(k)) {
          const r = c.recipeId ? byId.get(c.recipeId) : null;
          fresh.set(k, { key: k, title: c.title, recipeId: c.recipeId, rating: r ? averageRating(r) : null, first: iso });
        }
      }
    }
  }
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'de');
  return {
    period,
    days,
    meals,
    dinnerDays,
    orderDays,
    orders,
    orderRate: dinnerDays ? orderDays / dinnerDays : 0,
    spend: Math.round(spend * 100) / 100,
    avgOrder: paid ? Math.round((spend / paid) * 100) / 100 : 0,
    restaurants: [...shops.values()].sort((a, b) => b.count - a.count || b.amount - a.amount),
    top: [...counts.values()].sort((a, b) => b.count - a.count || byTitle(a, b)).slice(0, 5),
    dishes: counts.size,
    firsts: [...fresh.values()].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.first.localeCompare(b.first)),
    recipeShare: meals ? withRecipe / meals : 0,
    withRecipe,
    free,
  };
}

/** Veränderungen gegenüber dem Vorzeitraum, nur für Kennzahlen mit Daten. */
export function compareStats(cur, prev) {
  const rows = [
    { key: 'meals', label: 'Gerichte gekocht', a: cur.meals, b: prev.meals, unit: '' },
    { key: 'orderRate', label: 'Bestellquote', a: cur.orderRate * 100, b: prev.orderRate * 100, unit: 'pp' },
    { key: 'spend', label: 'Für Bestellungen', a: cur.spend, b: prev.spend, unit: '€' },
    { key: 'firsts', label: 'Neue Gerichte', a: cur.firsts.length, b: prev.firsts.length, unit: '' },
    { key: 'recipeShare', label: 'Mit Rezept', a: cur.recipeShare * 100, b: prev.recipeShare * 100, unit: 'pp' },
  ];
  return rows
    .filter((r) => r.a || r.b)
    .map((r) => {
      const diff = Math.round((r.a - r.b) * 10) / 10;
      return { ...r, diff, dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same' };
    });
}

export function fmtEuro(n) {
  return `${(Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export function fmtPct(share) {
  return `${Math.round((share || 0) * 100)} %`;
}

/** „+3", „−12,50 €", „+8 Prozentpunkte", „gleich". */
export function fmtDiff(row) {
  if (row.dir === 'same') return 'gleich';
  const sign = row.diff > 0 ? '+' : '−';
  const abs = Math.abs(row.diff);
  if (row.unit === '€') return `${sign}${fmtEuro(abs)}`;
  if (row.unit === 'pp') return `${sign}${Math.round(abs)} Prozentpunkte`;
  return `${sign}${abs.toLocaleString('de-DE')}`;
}
