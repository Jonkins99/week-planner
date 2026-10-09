// Service Worker: macht die App installierbar und offline nutzbar.
// Seitenaufrufe: erst Netz, bei Funkloch der zuletzt geladene Stand.
// Gebaute Dateien (gehashte Namen) und Schriften: aus dem Cache, im Hintergrund erneuert.
// Fremde Hosts (Gemini, YouTube, Instagram) laufen unberührt am Cache vorbei.

const CACHE = 'week-planner-v6';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', res.clone());
        return res;
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const net = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});

// ------------------------------------------------------------ Erinnerungen der Werkzeuge
// Die App legt den Plan der nächsten Tage mit fertigen Texten in IndexedDB (`wp-tools`, kv
// „aqua-schedule"). Hier wird er beim Hintergrund-Abgleich gelesen; Antworten aus den
// Knöpfen einer Benachrichtigung landen in der Inbox, die App übernimmt sie beim Öffnen.

function toolsDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('wp-tools', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('inbox')) db.createObjectStore('inbox', { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbRun(store, mode, fn) {
  const db = await toolsDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => { db.close(); resolve(req && req.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

function notifyOptions(item) {
  const level = item.level || 0;
  return {
    body: item.body,
    tag: item.key,
    renotify: true,
    requireInteraction: level > 0,
    icon: './icons/icon-192.png',
    badge: './icons/favicon-48.png',
    vibrate: level >= 2 ? [400, 120, 400, 120, 800] : level === 1 ? [300, 100, 300] : [180],
    data: { key: item.key, url: './?tool=aqua' },
    actions: item.actions || [],
  };
}

async function showDueReminders() {
  const plan = await dbRun('kv', 'readonly', (s) => s.get('aqua-schedule')).catch(() => null);
  if (!plan || !Array.isArray(plan.list)) return;
  const shown = (await dbRun('kv', 'readonly', (s) => s.get('aqua-shown')).catch(() => null)) || {};
  const answered = new Set(((await dbRun('inbox', 'readonly', (s) => s.getAll()).catch(() => [])) || []).map((a) => a.key));
  const now = Date.now();
  let changed = false;
  for (const item of plan.list) {
    if (item.at > now || answered.has(item.key)) continue;
    if (item.kind === 'feed' && now - item.at > 6 * 3600000) continue;
    if (shown[item.key] && shown[item.key] >= item.at) continue;
    await self.registration.showNotification(item.title, notifyOptions(item));
    shown[item.key] = now;
    changed = true;
  }
  if (changed) await dbRun('kv', 'readwrite', (s) => s.put(shown, 'aqua-shown')).catch(() => {});
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'tool-reminders') event.waitUntil(showDueReminders());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'tool-check') event.waitUntil(showDueReminders());
});

self.addEventListener('notificationclick', (event) => {
  const n = event.notification;
  const key = n.data && n.data.key;
  const url = new URL((n.data && n.data.url) || './', self.registration.scope).href;
  n.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (event.action && key) {
      await dbRun('inbox', 'readwrite', (s) => s.add({ key, action: event.action, at: Date.now() })).catch(() => {});
      all.forEach((c) => c.postMessage({ type: 'tool-answer', key, action: event.action }));
      return;
    }
    const client = all.find((c) => c.url.startsWith(self.registration.scope));
    if (client) {
      await client.focus();
      client.postMessage({ type: 'tool-open', key });
      return;
    }
    await self.clients.openWindow(`${url}${url.includes('?') ? '&' : '?'}alert=${encodeURIComponent(key || '')}`);
  })());
});
