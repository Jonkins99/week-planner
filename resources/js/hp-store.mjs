// Ablage der Hörbuch-Dateien. Einmal ausgewählt, bleiben sie dauerhaft verfügbar:
// - Am Rechner (File System Access) merkt sich die App nur den Ort der Dateien; nach einem
//   Neustart fragt der Browser höchstens einmal nach Zugriff.
// - Auf dem Handy wird jede Datei einmalig in den privaten Speicher der App kopiert (Origin
//   Private File System) und von dort abgespielt – dann fragt der Browser nie wieder.
//   Früher gemerkte Dateigriffe werden nach der nächsten Freigabe still dorthin übernommen.
// Die Liste der Bände liegt in IndexedDB (Datenbank `wp-hp`).

import { sortTracks } from './hp.mjs';

const DB = 'wp-hp';
const STORE = 'books';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'book' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(out?.result ?? out); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

const isMobile = () => navigator.userAgentData?.mobile ?? /Android|iPhone|iPad/i.test(navigator.userAgent);
export const canPickHandles = () => typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function' && !isMobile();
export const canCopy = () => !!navigator.storage?.getDirectory;

/** Alle Bände: { [book]: { book, mode, tracks: [{ name, size }] } } (ohne Dateigriffe). */
export async function loadLibrary() {
  try {
    const all = await tx('readonly', (s) => s.getAll());
    const out = {};
    for (const b of all || []) out[b.book] = b;
    return out;
  } catch {
    return {};
  }
}

async function bookDir(book, create = true) {
  const root = await navigator.storage.getDirectory();
  const hp = await root.getDirectoryHandle('hp', { create });
  return hp.getDirectoryHandle(`band-${book}`, { create });
}

/** Über den Dateidialog des Browsers gewählte Dateigriffe merken. */
export async function saveHandles(book, handles) {
  const tracks = [];
  for (const h of sortTracks(handles)) {
    const f = await h.getFile();
    tracks.push({ name: h.name, size: f.size, handle: h });
  }
  await removeBook(book);
  await tx('readwrite', (s) => s.put({ book, mode: 'handle', tracks }));
  return tracks.length;
}

/** Ausgewählte Dateien einmalig in den App-Speicher kopieren. */
export async function copyFiles(book, files, onProgress = () => {}) {
  try { await navigator.storage.persist?.(); } catch { /* nur Bitte */ }
  await removeBook(book);
  const dir = await bookDir(book);
  const list = sortTracks([...files]);
  const total = list.reduce((n, f) => n + f.size, 0) || 1;
  let done = 0;
  const tracks = [];
  for (const [i, f] of list.entries()) {
    const name = `${String(i + 1).padStart(3, '0')}-${f.name}`.replace(/[\\/:*?"<>|]/g, '_');
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(f);
    await w.close();
    done += f.size;
    onProgress(done / total, i + 1, list.length);
    tracks.push({ name: f.name, size: f.size, stored: name });
  }
  await tx('readwrite', (s) => s.put({ book, mode: 'opfs', tracks }));
  return tracks.length;
}

export async function removeBook(book) {
  try {
    const root = await navigator.storage.getDirectory();
    const hp = await root.getDirectoryHandle('hp', { create: true });
    await hp.removeEntry(`band-${book}`, { recursive: true });
  } catch { /* gab es nicht */ }
  try { await tx('readwrite', (s) => s.delete(book)); } catch { /* egal */ }
}

/**
 * Datei eines Titels holen. Bei gemerkten Dateigriffen ggf. um Zugriff bitten
 * (braucht eine Nutzergeste, also aus einem Klick heraus aufrufen).
 */
export async function trackFile(library, book, track) {
  const entry = library[book];
  const t = entry?.tracks?.[track];
  if (!t) throw new Error('Für diesen Band sind keine Dateien hinterlegt.');
  if (entry.mode === 'handle') {
    const h = t.handle;
    if ((await h.queryPermission?.({ mode: 'read' })) !== 'granted') {
      const res = await h.requestPermission?.({ mode: 'read' });
      if (res && res !== 'granted') throw new Error('Kein Zugriff auf die Hörbuch-Dateien.');
    }
    return h.getFile();
  }
  const dir = await bookDir(book, false);
  return (await dir.getFileHandle(t.stored)).getFile();
}

/** Muss der Browser für diesen Band (gemerkte Dateigriffe) erst wieder nach Zugriff fragen? */
export async function needsPrompt(library, book) {
  const entry = library[book];
  if (entry?.mode !== 'handle') return false;
  try { return (await entry.tracks[0]?.handle?.queryPermission?.({ mode: 'read' })) !== 'granted'; } catch { return false; }
}

/**
 * Gemerkte Dateigriffe in den App-Speicher übernehmen, damit der Browser nie wieder fragt
 * (Chrome auf Android merkt sich den Zugriff nicht über einen Neustart hinaus). Der Zugriff
 * muss in dieser Sitzung schon erteilt sein. Ohne genug Platz bleibt alles, wie es ist.
 */
export async function adoptHandles(library, book, onProgress = () => {}) {
  const entry = library[book];
  if (entry?.mode !== 'handle' || !canCopy()) return false;
  const total = entry.tracks.reduce((n, t) => n + (t.size || 0), 0) || 1;
  const info = await storageInfo();
  if (info?.quota && info.quota - info.usage < total * 1.15) return false;
  try { await navigator.storage.persist?.(); } catch { /* nur Bitte */ }
  try {
    const root = await navigator.storage.getDirectory();
    await (await root.getDirectoryHandle('hp', { create: true })).removeEntry(`band-${book}`, { recursive: true });
  } catch { /* gab es nicht */ }
  const dir = await bookDir(book);
  const tracks = [];
  let done = 0;
  try {
    for (const [i, t] of entry.tracks.entries()) {
      const f = await t.handle.getFile();
      const name = `${String(i + 1).padStart(3, '0')}-${t.name}`.replace(/[\\/:*?"<>|]/g, '_');
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(f);
      await w.close();
      done += f.size;
      onProgress(done / total, i + 1, entry.tracks.length);
      tracks.push({ name: t.name, size: f.size, stored: name });
    }
  } catch (e) {
    try { await (await (await navigator.storage.getDirectory()).getDirectoryHandle('hp')).removeEntry(`band-${book}`, { recursive: true }); } catch { /* egal */ }
    throw e;
  }
  await tx('readwrite', (s) => s.put({ book, mode: 'opfs', tracks }));
  return true;
}

/** Speicherplatz (für den Hinweis in den Einstellungen). */
export async function storageInfo() {
  try {
    const e = await navigator.storage.estimate();
    return { usage: e.usage || 0, quota: e.quota || 0 };
  } catch {
    return null;
  }
}
