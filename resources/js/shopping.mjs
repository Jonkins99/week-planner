// Einkaufsliste: Läden, Abteilungen, Einträge und gemerkte Produkte (framework-frei).
//
// shopping = {
//   items:   [{ id, name, qty, store, dept, createdAt, from? }] store = Laden-ID oder null,
//                                                              from = verfügbar ab (YYYY-MM-DD)
//   catalog: { <normName>: { name, dept, count, last } }      jedes je eingetragene Produkt
//   stores:  [{ id, name }]                                   nur die selbst angelegten Läden
//   recurring: [{ key, name, store, dept, weeks, next }]      kommt alle `weeks` Wochen auf die Liste
// }
// qty 0 heißt „ohne Mengenangabe".

import { normalize, search } from './search.mjs';
import { uid } from './model.mjs';

export const DEPTS = [
  { key: 'produce', label: 'Obst & Gemüse', icon: 'dept-produce' },
  { key: 'chilled', label: 'Kühlung', icon: 'dept-chilled' },
  { key: 'frozen', label: 'TK', icon: 'dept-frozen' },
  { key: 'staples', label: 'Nährmittel', icon: 'dept-staples' },
  { key: 'snacks', label: 'Snacks & Süßes', icon: 'dept-snacks' },
  { key: 'household', label: 'Haushalt', icon: 'dept-household' },
  { key: 'other', label: 'Sonstiges', icon: 'dept-other' },
];
export const DEPT_KEYS = DEPTS.map((d) => d.key);
const DEPT_RANK = Object.fromEntries(DEPT_KEYS.map((k, i) => [k, i]));

export function deptByLabel(label) {
  const n = normalize(label);
  return DEPTS.find((d) => normalize(d.label) === n || d.key === label)?.key || null;
}

// Die festen Läden mit Logo. Die Logos sind vereinfachte Nachbauten als SVG, damit
// nichts von fremden Servern geladen werden muss.
const logo = (body) => `<svg class="store-logo" viewBox="0 0 120 44" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
const T = 'font-family="Archivo Variable, Archivo, sans-serif" font-weight="850" text-anchor="middle"';

export const FIXED_STORES = [
  {
    id: 'lidl', name: 'Lidl', hint: '',
    logo: logo(`<rect width="120" height="44" rx="9" fill="#0050aa"/><circle cx="60" cy="22" r="18.5" fill="#fff000" stroke="#e60a14" stroke-width="3"/><text x="60" y="29" ${T} font-size="19" font-stretch="80%" fill="#0050aa">Lidl</text>`),
  },
  {
    id: 'aldi', name: 'Aldi', hint: 'Nord',
    logo: logo(`<rect width="120" height="44" rx="9" fill="#1d3f8e"/><path d="M8 38 22 6h7L15 38Z" fill="#7fc4ef"/><path d="M18 38 32 6h5L23 38Z" fill="#fff"/><path d="M27 38 41 6h4L31 38Z" fill="#e2001a"/><text x="78" y="30" ${T} font-size="21" font-stretch="78%" fill="#fff">ALDI</text>`),
  },
  {
    id: 'netto', name: 'Netto', hint: 'Marken-Discount',
    logo: logo(`<rect width="120" height="44" rx="9" fill="#ffe500"/><text x="60" y="30" ${T} font-size="23" font-style="italic" font-stretch="82%" fill="#e2001a">Netto</text>`),
  },
  {
    id: 'edeka', name: 'Edeka', hint: '',
    logo: logo(`<rect width="120" height="44" rx="9" fill="#fde100"/><text x="60" y="30" ${T} font-size="21" font-stretch="84%" fill="#1d4f91">EDEKA</text>`),
  },
  {
    id: 'rossmann', name: 'Rossmann', hint: '',
    logo: logo(`<rect x="1" y="1" width="118" height="42" rx="8" fill="#fff" stroke="#c3002f" stroke-width="2"/><text x="60" y="28.5" ${T} font-size="15.5" font-stretch="76%" fill="#c3002f">ROSSMANN</text>`),
  },
  {
    id: 'rewe', name: 'Rewe', hint: '',
    logo: logo(`<rect width="120" height="44" rx="9" fill="#cc071e"/><text x="60" y="31" ${T} font-size="24" font-stretch="74%" fill="#fff">REWE</text>`),
  },
];

export function emptyShopping() {
  return { items: [], catalog: {}, stores: [], recurring: [], flags: {} };
}

export function allStores(shopping) {
  return [...FIXED_STORES, ...(shopping?.stores || []).map((s) => ({ ...s, custom: true, logo: null, hint: '' }))];
}

export function storeById(shopping, id) {
  return id ? allStores(shopping).find((s) => s.id === id) || null : null;
}

/** Laden zu einem gesprochenen oder getippten Namen („Aldi", „netto", „bei Rewe"). */
export function storeByName(shopping, name) {
  const n = normalize(name);
  if (!n) return null;
  const list = allStores(shopping);
  return list.find((s) => normalize(s.name) === n) || list.find((s) => n.includes(normalize(s.name))) || null;
}

export function addStore(shopping, name) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  const existing = storeByName(shopping, clean);
  if (existing && normalize(existing.name) === normalize(clean)) return existing;
  const s = { id: uid('s-'), name: clean };
  shopping.stores.push(s);
  return s;
}

export function removeStore(shopping, id) {
  shopping.stores = shopping.stores.filter((s) => s.id !== id);
  for (const it of shopping.items) if (it.store === id) it.store = null;
}

export const keyOf = (name) => normalize(name);

export function remember(shopping, name, dept = null) {
  const k = keyOf(name);
  if (!k) return null;
  const cur = shopping.catalog[k] || { name: String(name).trim(), dept: null, count: 0, last: 0 };
  cur.name = String(name).trim();
  cur.count++;
  cur.last = Date.now();
  if (dept && DEPT_RANK[dept] != null) cur.dept = dept;
  shopping.catalog[k] = cur;
  return cur;
}

export function setDept(shopping, name, dept, { create = true } = {}) {
  const k = keyOf(name);
  if (!k || DEPT_RANK[dept] == null) return;
  if (shopping.catalog[k]) shopping.catalog[k].dept = dept;
  else if (create) shopping.catalog[k] = { name, dept, count: 0, last: Date.now() };
  for (const it of shopping.items) if (keyOf(it.name) === k) it.dept = dept;
}

/**
 * Eintrag hinzufügen. Steht dasselbe Produkt schon im selben Laden auf der Liste,
 * wird nur die Menge erhöht. Rückgabe: { item, merged }.
 */
export function addItem(shopping, { name, store = null, qty = 0, dept = null, keep = true }) {
  const clean = String(name || '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const k = keyOf(clean);
  const known = shopping.catalog[k];
  const same = shopping.items.find((it) => keyOf(it.name) === k && (it.store || null) === (store || null));
  // keep: false für übernommene Altbestände — die sollen nicht zu Vorschlägen werden.
  if (keep) remember(shopping, clean, dept);
  if (same) {
    same.qty = Math.max(same.qty || 1, 1) + Math.max(qty || 1, 1);
    return { item: same, merged: true };
  }
  const item = {
    id: uid('i-'),
    name: clean,
    qty: Math.max(0, Math.round(qty || 0)),
    store: store || null,
    dept: dept || known?.dept || null,
    createdAt: Date.now(),
  };
  shopping.items.push(item);
  return { item, merged: false };
}

/** Gruppen für die Anzeige: „ohne Laden" zuerst, dann die Läden in fester Reihenfolge. */
export function groupItems(shopping) {
  const byDept = (a, b) => (DEPT_RANK[a.dept || 'other'] ?? 6) - (DEPT_RANK[b.dept || 'other'] ?? 6) || a.createdAt - b.createdAt;
  const stores = allStores(shopping);
  const ids = new Set(stores.map((s) => s.id));
  const groups = [];
  const loose = shopping.items.filter((it) => !it.store || !ids.has(it.store)).sort((a, b) => a.createdAt - b.createdAt);
  if (loose.length) groups.push({ key: 'none', store: null, items: loose });
  for (const s of stores) {
    const items = shopping.items.filter((it) => it.store === s.id).sort(byDept);
    if (items.length) groups.push({ key: s.id, store: s, items });
  }
  return groups;
}

/** Abteilungs-Zwischenüberschriften innerhalb einer Gruppe. */
export function withDeptHeads(items) {
  const out = [];
  let last = null;
  for (const it of items) {
    const d = it.dept || 'other';
    if (d !== last) {
      out.push({ head: true, key: `h-${d}`, dept: DEPTS[DEPT_RANK[d]] });
      last = d;
    }
    out.push({ head: false, key: it.id, item: it });
  }
  return out;
}

export function suggestProducts(shopping, query, limit = 6) {
  const q = String(query || '').trim();
  if (!q) return [];
  const list = Object.values(shopping.catalog);
  const onList = new Set(shopping.items.map((it) => keyOf(it.name)));
  return search(list, q, { text: (p) => p.name, limit: limit + onList.size })
    .sort((a, b) => Number(onList.has(keyOf(a.name))) - Number(onList.has(keyOf(b.name))))
    .slice(0, limit);
}

export function sanitizeShopping(raw) {
  const s = emptyShopping();
  if (!raw || typeof raw !== 'object') return s;
  s.flags = raw.flags && typeof raw.flags === 'object' ? { ...raw.flags } : {};
  s.stores = (Array.isArray(raw.stores) ? raw.stores : [])
    .filter((x) => x?.id && String(x.name || '').trim())
    .map((x) => ({ id: String(x.id), name: String(x.name).trim() }));
  for (const [k, v] of Object.entries(raw.catalog || {})) {
    if (!v || !String(v.name || '').trim()) continue;
    s.catalog[k] = {
      name: String(v.name).trim(),
      dept: DEPT_RANK[v.dept] != null ? v.dept : null,
      count: Number(v.count) || 0,
      last: Number(v.last) || 0,
    };
  }
  s.items = (Array.isArray(raw.items) ? raw.items : [])
    .filter((it) => it && String(it.name || '').trim())
    .map((it) => ({
      id: String(it.id || uid('i-')),
      name: String(it.name).trim(),
      qty: Math.max(0, Math.round(Number(it.qty) || 0)),
      store: it.store ? String(it.store) : null,
      dept: DEPT_RANK[it.dept] != null ? it.dept : null,
      createdAt: Number(it.createdAt) || Date.now(),
      ...(ISO.test(it.from || '') ? { from: it.from } : {}),
    }));
  s.recurring = (Array.isArray(raw.recurring) ? raw.recurring : [])
    .filter((r) => r && String(r.name || '').trim() && Number(r.weeks) > 0 && ISO.test(r.next || ''))
    .map((r) => ({
      key: keyOf(r.name),
      name: String(r.name).trim(),
      store: r.store ? String(r.store) : null,
      dept: DEPT_RANK[r.dept] != null ? r.dept : null,
      weeks: Math.max(1, Math.min(52, Math.round(Number(r.weeks)))),
      next: r.next,
    }));
  return s;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------- Wiederkehrend & verfügbar ab

export function recurringOf(shopping, name) {
  return (shopping.recurring || []).find((r) => r.key === keyOf(name)) || null;
}

/** Alle `weeks` Wochen (0 = aus). Die nächste Fälligkeit liegt `weeks` Wochen nach heute. */
export function setRecurring(shopping, item, weeks, today) {
  shopping.recurring ||= [];
  shopping.recurring = shopping.recurring.filter((r) => r.key !== keyOf(item.name));
  const w = Math.max(0, Math.min(52, Math.round(Number(weeks) || 0)));
  if (!w) return null;
  const r = { key: keyOf(item.name), name: item.name, store: item.store || null, dept: item.dept || null, weeks: w, next: addDaysIso(today, w * 7) };
  shopping.recurring.push(r);
  return r;
}

/** Fällige Produkte auf die Liste setzen (falls nicht schon drauf). Rückgabe: Namen. */
export function applyRecurring(shopping, today) {
  const added = [];
  for (const r of shopping.recurring || []) {
    if (r.next > today) continue;
    const onList = shopping.items.some((it) => keyOf(it.name) === r.key);
    if (!onList) {
      addItem(shopping, { name: r.name, store: r.store, dept: r.dept });
      added.push(r.name);
    }
    while (r.next <= today) r.next = addDaysIso(r.next, r.weeks * 7);
  }
  return added;
}

/** Nächster Tag mit Wochentag `wd` (0 = Montag) ab heute, heute eingeschlossen. */
export function nextWeekday(today, wd) {
  const d = new Date(`${today}T12:00:00`);
  const cur = (d.getDay() + 6) % 7;
  return addDaysIso(today, (wd - cur + 7) % 7);
}

function addDaysIso(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
