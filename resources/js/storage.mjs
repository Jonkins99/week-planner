// Gerätelokale Ablage. Datenstand und UI-Zustand liegen getrennt, die Gemini-Schlüssel
// gesondert — damit eine Datensicherung nie einen Schlüssel enthält.

import { emptyState, sanitizeState } from './model.mjs';
import { keyOf } from './shopping.mjs';

export const DATA_KEY = 'wp-data-v1';
export const UI_KEY = 'wp-ui-v1';
export const GEMINI_KEY = 'wp-gemini-v1';
export const QUOTA_KEY = 'wp-gemini-quota-v1';

export function readJson(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Gespeicherten Stand laden; beim allerersten Start den Grundbestand aus dem Altbestand. */
export async function loadData() {
  const stored = readJson(DATA_KEY);
  if (stored) {
    // Stände vor der Einkaufsliste bekommen einmalig die Listen aus dem Altbestand.
    if (!stored.shopping) {
      try { stored.shopping = (await import('../data/seed.json')).default.shopping; } catch { /* dann eben leer */ }
    }
    // Der übernommene Altbestand gehört nicht zu den gemerkten Produkten (Stand bis Runde 2 schon).
    if (stored.shopping && !stored.shopping.flags?.seedCatalogCleared) {
      try {
        const seedItems = (await import('../data/seed.json')).default.shopping.items;
        const counts = {};
        for (const it of seedItems) counts[keyOf(it.name)] = (counts[keyOf(it.name)] || 0) + Math.max(1, it.qty || 1);
        for (const [k, n] of Object.entries(counts)) {
          if (stored.shopping.catalog?.[k] && (stored.shopping.catalog[k].count || 0) <= n) delete stored.shopping.catalog[k];
        }
      } catch { /* nur Aufräumen */ }
      stored.shopping.flags = { ...(stored.shopping.flags || {}), seedCatalogCleared: true };
    }
    return { state: sanitizeState(stored), seeded: false };
  }
  try {
    const seed = (await import('../data/seed.json')).default;
    const state = sanitizeState(seed);
    writeJson(DATA_KEY, state);
    return { state, seeded: true };
  } catch {
    return { state: emptyState(), seeded: false };
  }
}

let timer = null;
export function saveData(state, delay = 150) {
  clearTimeout(timer);
  timer = setTimeout(() => writeJson(DATA_KEY, state), delay);
}

export function flushData(state) {
  clearTimeout(timer);
  return writeJson(DATA_KEY, state);
}
