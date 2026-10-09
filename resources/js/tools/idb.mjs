// Gemeinsame IndexedDB der Werkzeuge (`wp-tools`), getrennt von den Haushaltsdaten.
// - photos: Bilder (Blob) je Schlüssel, z. B. Fotos aus dem Aquarium-Bestand
// - kv:     kleine Werte, die auch der Service Worker lesen muss (Erinnerungsplan)
// - inbox:  Antworten auf Benachrichtigungen, die der Service Worker entgegennimmt
// Der Service Worker (public/sw.js) öffnet dieselbe Datenbank mit derselben Version.

const DB = 'wp-tools';
const VERSION = 1;

let pending = null;

function open() {
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('inbox')) db.createObjectStore('inbox', { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { pending = null; reject(req.error); };
  });
  return pending;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const idbGet = (store, key) => run(store, 'readonly', (s) => s.get(key)).catch(() => undefined);
export const idbSet = (store, key, value) => run(store, 'readwrite', (s) => s.put(value, key));
export const idbDel = (store, key) => run(store, 'readwrite', (s) => s.delete(key)).catch(() => {});
export const idbKeys = (store) => run(store, 'readonly', (s) => s.getAllKeys()).catch(() => []);

/** Alle Einträge der Inbox holen und leeren (in einem Rutsch). */
export async function drainInbox() {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const t = db.transaction('inbox', 'readwrite');
      const s = t.objectStore('inbox');
      const req = s.getAll();
      req.onsuccess = () => s.clear();
      t.oncomplete = () => resolve(req.result || []);
      t.onerror = () => reject(t.error);
    });
  } catch {
    return [];
  }
}
