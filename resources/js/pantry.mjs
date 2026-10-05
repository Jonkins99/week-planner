// Vorrat: nur die Dinge, bei denen man leicht den Überblick verliert — vor allem die
// Gefriertruhe mit LEGO-Bricks (portionsweise eingefrorene Gerichte und Komponenten).
//
// pantry = { items: [{ id, name, qty, place, updatedAt }] }
// place ist ein Pfad aus PLACES, z. B. 'freezer/bricks/dish'.

import { uid } from './model.mjs';
import { normalize, search } from './search.mjs';

export const PLACES = [
  { key: 'freezer/bricks/dish', main: 'freezer', label: 'Gericht', path: ['Gefriertruhe', 'LEGO-Bricks', 'Gericht'], short: 'Brick · Gericht', icon: 'brick' },
  { key: 'freezer/bricks/component', main: 'freezer', label: 'Komponente', path: ['Gefriertruhe', 'LEGO-Bricks', 'Komponente'], short: 'Brick · Komponente', icon: 'brick' },
  { key: 'freezer/other', main: 'freezer', label: 'Sonstiges', path: ['Gefriertruhe', 'Sonstiges'], short: 'Truhe · Sonstiges', icon: 'dept-frozen' },
  { key: 'fridge', main: 'fridge', label: 'Kühlschrank', path: ['Kühlschrank'], short: 'Kühlschrank', icon: 'dept-chilled' },
  { key: 'dry', main: 'dry', label: 'Ungekühlt', path: ['Ungekühlt'], short: 'Ungekühlt', icon: 'dept-staples' },
];
const PLACE_KEYS = PLACES.map((p) => p.key);

export const MAINS = [
  { key: 'freezer', label: 'Gefriertruhe', icon: 'dept-frozen' },
  { key: 'fridge', label: 'Kühlschrank', icon: 'dept-chilled' },
  { key: 'dry', label: 'Ungekühlt', icon: 'dept-staples' },
];

export const placeOf = (key) => PLACES.find((p) => p.key === key) || PLACES[2];
export const isBrick = (item) => String(item?.place || '').startsWith('freezer/bricks/');

export function emptyPantry() {
  return { items: [] };
}

export function addPantryItem(pantry, { name, qty = 1, place = 'freezer/other' }) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const p = PLACE_KEYS.includes(place) ? place : 'freezer/other';
  const same = pantry.items.find((it) => normalize(it.name) === normalize(clean) && it.place === p);
  if (same) {
    same.qty = Math.max(0, (same.qty || 0) + Math.max(1, qty));
    same.updatedAt = Date.now();
    return { item: same, merged: true };
  }
  const item = { id: uid('p-'), name: clean, qty: Math.max(0, Math.round(qty)), place: p, updatedAt: Date.now() };
  pantry.items.push(item);
  return { item, merged: false };
}

/**
 * Anzeige: Hauptkategorien in fester Reihenfolge, darin die Unterbereiche (nur die
 * Gefriertruhe hat welche). Leere Bereiche bleiben sichtbar, damit klar ist, wohin
 * etwas gehört — außer bei aktiver Suche.
 */
export function pantryTree(pantry, query = '') {
  const q = String(query || '').trim();
  const pool = q ? search(pantry.items, q, { text: (it) => it.name }) : pantry.items;
  const ids = new Set(pool.map((it) => it.id));
  const byName = (a, b) => (a.qty === 0) - (b.qty === 0) || a.name.localeCompare(b.name, 'de');
  return MAINS.map((m) => {
    const places = PLACES.filter((p) => p.main === m.key).map((p) => ({
      ...p,
      items: pantry.items.filter((it) => it.place === p.key && ids.has(it.id)).sort(byName),
    }));
    const count = places.reduce((n, p) => n + p.items.length, 0);
    return { ...m, places, count, sub: places.length > 1 };
  }).filter((m) => !q || m.count);
}

export function sanitizePantry(raw) {
  const s = emptyPantry();
  s.items = (Array.isArray(raw?.items) ? raw.items : [])
    .filter((it) => it && String(it.name || '').trim())
    .map((it) => ({
      id: String(it.id || uid('p-')),
      name: String(it.name).trim(),
      qty: Math.max(0, Math.round(Number(it.qty) || 0)),
      place: PLACE_KEYS.includes(it.place) ? it.place : 'freezer/other',
      updatedAt: Number(it.updatedAt) || Date.now(),
    }));
  return s;
}
