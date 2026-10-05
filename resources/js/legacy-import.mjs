// Umwandlung eines „My Recipe Box"-Backups (RecetteTek) in den eigenen Datenstand.
//
// Mahlzeit-Typen im Kalender: 900 = Frühstück, 800 = Mittag, 700 = Abend. Einträge vor
// Mai 2026 haben gar keinen Typ — damals wurde nur das Hauptgericht geplant, sie landen
// deshalb beim Abendessen.

import { addEntry, clampRating, ensureDay, newRecipe, sanitizeState, splitLines } from './model.mjs';
import { findVideoUrl, videoEmbed } from './video.mjs';
import { normalize } from './search.mjs';
import { addItem, storeByName, addStore, emptyShopping } from './shopping.mjs';

const TYPE_SLOT = { 900: 'breakfast', 800: 'lunch', 700: 'dinner' };

function toTime(v) {
  if (typeof v === 'number') return v;
  const t = Date.parse(String(v || '').replace(' ', 'T'));
  return Number.isFinite(t) ? t : Date.now();
}

export function convertRecipe(r) {
  const notes = String(r.notes || '').trim();
  let video = String(r.video || '').trim();
  let restNotes = notes;
  if (!video || !videoEmbed(video)?.embedUrl) {
    const found = findVideoUrl(notes);
    if (found) {
      video = found;
      restNotes = notes.replace(found, '').replace(/^\s+/, '').trim();
    }
  }
  const rating = clampRating(r.rating || 0);
  const t = toTime(r.lastModifiedDate);
  return newRecipe({
    id: r.uuid,
    title: String(r.title || '').trim(),
    // Die alte App kannte nur eine gemeinsame Bewertung — sie gilt für beide.
    ratingElika: rating,
    ratingJanik: rating,
    ingredients: splitLines(r.ingredients),
    steps: splitLines(r.instructions),
    video,
    notes: [String(r.description || '').trim(), restNotes].filter(Boolean).join('\n\n'),
    source: String(r.url || '').trim(),
    createdAt: t,
    updatedAt: t,
  });
}

/** Einkaufslisten der alten App: eine Liste je Laden. */
export function convertShopping(lists = []) {
  const shopping = emptyShopping();
  for (const list of lists) {
    const items = [...(list.shoppingListItems || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
    if (!items.length) continue;
    const store = storeByName(shopping, list.title) || addStore(shopping, list.title);
    for (const it of items) addItem(shopping, { name: it.title, store: store?.id || null, keep: false });
  }
  return shopping;
}

export function convertBackup({ recipes = [], calendar = [], shopping = [] }) {
  const out = { version: 2, recipes: recipes.filter((r) => String(r.title || '').trim()).map(convertRecipe), plan: {}, shopping: convertShopping(shopping) };
  const ids = new Set(out.recipes.map((r) => r.id));
  const byTitle = new Map(out.recipes.map((r) => [normalize(r.title), r.id]));

  const sorted = [...calendar].sort((a, b) => String(a.date).localeCompare(String(b.date)) || toTime(a.lastModifiedDate) - toTime(b.lastModifiedDate));
  for (const c of sorted) {
    const title = String(c.title || '').trim();
    const iso = String(c.date || '').slice(0, 10);
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    const slot = TYPE_SLOT[c.type] || 'dinner';
    let recipeId = c.recipeUuid && ids.has(c.recipeUuid) ? c.recipeUuid : null;
    if (!recipeId) recipeId = byTitle.get(normalize(title)) || null;
    ensureDay(out.plan, iso);
    const e = addEntry(out.plan, iso, slot, { title, recipeId, note: String(c.notes || '').trim() });
    if (c.uuid) e.id = c.uuid;
  }
  return sanitizeState(out);
}
