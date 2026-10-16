// Service Worker: macht die App installierbar und offline nutzbar.
// Seitenaufrufe: erst Netz, bei Funkloch der zuletzt geladene Stand.
// Gebaute Dateien (gehashte Namen) und Schriften: aus dem Cache, im Hintergrund erneuert.
// Fremde Hosts (Gemini, YouTube, Instagram) laufen unberührt am Cache vorbei.

const CACHE = 'week-planner-v8';

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

async function showDueReminders({ fallback = false } = {}) {
  const plan = await dbRun('kv', 'readonly', (s) => s.get('aqua-schedule')).catch(() => null);
  const list = plan && Array.isArray(plan.list) ? plan.list : [];
  const shown = (await dbRun('kv', 'readonly', (s) => s.get('aqua-shown')).catch(() => null)) || {};
  // Der Weckruf kommt pünktlich zur vollen Minute; kleine Uhrabweichungen zulassen.
  const now = Date.now() + 90000;
  let count = 0;
  for (const item of list) {
    if (item.at > now || item.done) continue;
    if (item.kind === 'feed' && now - item.at > 6 * 3600000) continue;
    if (shown[item.key] && shown[item.key] >= item.at) continue;
    await self.registration.showNotification(item.title, notifyOptions(item));
    shown[item.key] = item.at;
    count++;
  }
  if (count) await dbRun('kv', 'readwrite', (s) => s.put(shown, 'aqua-shown')).catch(() => {});
  // Chrome verlangt bei jedem Push eine sichtbare Meldung. Steht nichts an (schon erledigt),
  // genügt ein stiller Hinweis, der sich gleich wieder schließt.
  if (!count && fallback) {
    const open = await self.registration.getNotifications();
    if (!open.length) {
      await self.registration.showNotification('Aquarium', { body: 'Alles erledigt.', tag: 'aqua-idle', silent: true, icon: './icons/icon-192.png' });
      setTimeout(() => self.registration.getNotifications({ tag: 'aqua-idle' }).then((ns) => ns.forEach((n) => n.close())), 3000);
    }
  }
  return count;
}

// Antwort aus einer Benachrichtigung gleich im eigenen Plan umsetzen, damit auch bei
// geschlossener App alles stimmt: „Erledigt" stoppt, „Später" verschiebt und weckt erneut.
async function applyAnswer(key, action) {
  const plan = await dbRun('kv', 'readonly', (s) => s.get('aqua-schedule')).catch(() => null);
  if (!plan || !Array.isArray(plan.list)) return;
  const item = plan.list.find((x) => x.key === key);
  if (!item) return;
  const now = Date.now();
  if (action === 'done') item.done = now;
  if (action === 'snooze') {
    if (item.kind === 'wc') {
      const due = new Date(item.at);
      const next = new Date(now + 86400000);
      next.setHours(due.getHours(), due.getMinutes(), 0, 0);
      item.at = next.getTime();
      item.snoozes = (item.snoozes || 0) + 1;
      const v = item.variants && item.variants[Math.min(item.snoozes, item.variants.length - 1)];
      if (v) Object.assign(item, v);
    } else {
      item.at = now + 3600000;
    }
    const cfg = await dbRun('kv', 'readonly', (s) => s.get('push-config')).catch(() => null);
    if (cfg && cfg.url && cfg.id) {
      await fetch(`${cfg.url}/wake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: cfg.id, at: item.at }) }).catch(() => {});
    }
  }
  await dbRun('kv', 'readwrite', (s) => s.put(plan, 'aqua-schedule')).catch(() => {});
}

// Jeder angekommene Weckruf wird vermerkt: Die Diagnose in der App vergleicht das mit dem,
// was der Weckdienst verschickt hat, und erkennt so, ob Android den Push verschluckt.
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const count = await showDueReminders({ fallback: true }).catch(() => -1);
    await dbRun('kv', 'readwrite', (s) => s.put({ at: Date.now(), count }, 'push-log')).catch(() => {});
  })());
});

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
      await applyAnswer(key, event.action);
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
