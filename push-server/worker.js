// Weckdienst für die Erinnerungen der Werkzeuge (Cloudflare Worker, kostenloser Tarif).
//
// Der Dienst kennt keine Inhalte, nur Zeitpunkte: Die App meldet „weck mich um …", der
// Worker schickt zu diesen Zeiten einen leeren Web-Push. Der Service Worker der App wacht
// davon auf (auch bei geschlossener App und gesperrtem Handy) und zeigt die fälligen
// Erinnerungen aus seinem eigenen Plan (IndexedDB) als Android-Benachrichtigung.
//
// Speicher: KV-Namespace `PUSH` mit
//   devices        → ["<id>", …]
//   dev:<id>       → { sub, times: [ms…], updated }
// Die Geräte-ID ist ein zufälliges Geheimnis der App (wer sie kennt, darf Zeiten setzen).
// Ein Cron-Trigger läuft jede Minute und verschickt, was fällig ist.
//
// Zweite Aufgabe: Postfach des Werkzeugs „Verkaufen" zwischen Handy und Laptop.
//   sell:<box>:<id>          → Artikel (kleines JSON: Phase, Hinweis, Fragen, Antworten, Entwurf …)
//   sellimg:<box>:<id>:<n>   → Foto n (JPEG, roh)
//   sellbox:<box>            → { device } — welches Handy bei Neuigkeiten geweckt wird
// <box> ist ein zufälliger Code der App, den nur Handy und Laptop kennen.

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const MAX_TIMES = 400;
const DAY = 86400000;

const cors = (res) => {
  const h = new Headers(res.headers);
  h.set('access-control-allow-origin', '*');
  h.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  h.set('access-control-allow-headers', 'content-type');
  h.set('access-control-max-age', '86400');
  return new Response(res.body, { status: res.status, headers: h });
};

const json = (data, status = 200) => cors(new Response(JSON.stringify(data), { status, headers: JSON_HEADERS }));
const validId = (id) => typeof id === 'string' && /^[a-z0-9-]{16,64}$/i.test(id);

/** Zeitliste säubern: Zahlen, nicht älter als 1 Tag, sortiert, ohne Doppelte, gedeckelt. */
export function cleanTimes(list, now = Date.now()) {
  return [...new Set((Array.isArray(list) ? list : []).map(Number).filter((t) => Number.isFinite(t) && t > now - DAY && t < now + 60 * DAY))]
    .sort((a, b) => a - b)
    .slice(0, MAX_TIMES);
}

/** Aufteilen in fällig (≤ now) und später. */
export function splitDue(times, now = Date.now()) {
  const due = times.filter((t) => t <= now);
  return { due, rest: times.filter((t) => t > now) };
}

// ---------------------------------------------------------------- VAPID (RFC 8292)

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uText = (s) => b64u(new TextEncoder().encode(s));

let keyCache = null;
async function signingKey(env) {
  if (keyCache) return keyCache;
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  keyCache = await crypto.subtle.importKey('jwk', { ...jwk, key_ops: ['sign'], ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return keyCache;
}

async function vapidHeader(env, endpoint) {
  const aud = new URL(endpoint).origin;
  const head = b64uText(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64uText(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:week-planner@example.invalid' }));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(env), new TextEncoder().encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}

/** Leeren Push schicken (kein Inhalt → keine Verschlüsselung nötig). */
async function sendPush(env, sub) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    // Lange Lebensdauer: Ist das Handy gerade offline oder im Tiefschlaf, stellt der
    // Push-Dienst den Weckruf nach, statt ihn nach einer Stunde zu verwerfen.
    headers: { authorization: await vapidHeader(env, sub.endpoint), ttl: '21600', urgency: 'high', 'content-length': '0' },
  });
  return res.status;
}

// ---------------------------------------------------------------- Speicher

async function readDevices(env) {
  return (await env.PUSH.get('devices', 'json')) || [];
}

async function readDevice(env, id) {
  return env.PUSH.get(`dev:${id}`, 'json');
}

async function writeDevice(env, id, dev) {
  await env.PUSH.put(`dev:${id}`, JSON.stringify({ ...dev, updated: Date.now() }));
}

async function body(req) {
  try { return await req.json(); } catch { return {}; }
}

// ---------------------------------------------------------------- Abläufe

async function tick(env) {
  const now = Date.now();
  const ids = await readDevices(env);
  let gone = false;
  for (const id of ids) {
    const dev = await readDevice(env, id);
    if (!dev?.sub) continue;
    const { due, rest } = splitDue(dev.times || [], now);
    if (!due.length) continue;
    let status = 0;
    try { status = await sendPush(env, dev.sub); } catch { status = 0; }
    if (status === 404 || status === 410) {
      await env.PUSH.delete(`dev:${id}`);
      gone = true;
      continue;
    }
    // Bei vorübergehenden Fehlern im nächsten Durchlauf erneut versuchen (max. 10 Minuten).
    const keep = status >= 200 && status < 300 ? rest : [...due.filter((t) => now - t < 10 * 60000), ...rest];
    await writeDevice(env, id, { ...dev, times: keep, last: { at: now, status } });
  }
  if (gone) {
    const alive = [];
    for (const id of ids) if (await env.PUSH.get(`dev:${id}`)) alive.push(id);
    await env.PUSH.put('devices', JSON.stringify(alive));
  }
}

/** Kurzbericht eines Geräts (ohne Abo-Daten). */
export function deviceStatus(dev, now = Date.now()) {
  if (!dev) return { known: false };
  const times = (dev.times || []).filter((t) => t > now - 10 * 60000).sort((a, b) => a - b);
  return { known: true, subscribed: !!dev.sub?.endpoint, next: times[0] || null, count: times.length, last: dev.last || null, updated: dev.updated || null };
}

// ---------------------------------------------------------------- Verkaufen (Postfach)

const SELL_MAX_PHOTOS = 20;
const SELL_PHOTO_MAX = 4 * 1024 * 1024;
const SELL_ITEM_MAX = 200 * 1024;
const SELL_PHOTO_TTL = 90 * DAY / 1000;
// Phasen, in denen das Handy etwas tun oder wissen sollte → Weckruf.
export const SELL_ATTENTION = ['frage-offen', 'entwurf', 'online', 'fehler'];

export const validSellId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{2,40}$/i.test(id);

/** Änderung in einen Artikel einmischen (oberste Ebene, null löscht ein Feld). */
export function mergeSellItem(old, patch, now = Date.now()) {
  const out = { ...(old || {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    if (k === 'id' || k === 'created') continue;
    if (v === null) delete out[k];
    else out[k] = v;
  }
  out.created ||= now;
  out.updated = now;
  return out;
}

const sellKey = (box, id) => `sell:${box}:${id}`;
const photoKey = (box, id, n) => `sellimg:${box}:${id}:${n}`;

async function sellWake(env, box) {
  const link = await env.PUSH.get(`sellbox:${box}`, 'json');
  if (!validId(link?.device)) return false;
  const dev = await readDevice(env, link.device);
  if (!dev?.sub) return false;
  await writeDevice(env, link.device, { ...dev, times: cleanTimes([...(dev.times || []), Date.now() + 5000]) });
  return true;
}

async function sellItems(env, box) {
  const out = [];
  let cursor;
  do {
    const page = await env.PUSH.list({ prefix: `sell:${box}:`, cursor });
    for (const k of page.keys) {
      const it = await env.PUSH.get(k.name, 'json');
      if (it) out.push(it);
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out.sort((a, b) => (a.created || 0) - (b.created || 0));
}

async function handleSell(req, env, url) {
  const q = url.searchParams;
  if (req.method === 'GET' && url.pathname === '/sell/items') {
    const box = q.get('box');
    if (!validId(box)) return json({ error: 'box' }, 400);
    return json({ items: await sellItems(env, box) });
  }
  if (url.pathname === '/sell/photo') {
    const box = q.get('box');
    const id = q.get('id');
    const n = Number(q.get('n'));
    if (!validId(box) || !validSellId(id) || !(n >= 1 && n <= SELL_MAX_PHOTOS)) return json({ error: 'param' }, 400);
    if (req.method === 'GET') {
      const got = await env.PUSH.getWithMetadata(photoKey(box, id, n), 'arrayBuffer');
      if (!got.value) return json({ error: 'not found' }, 404);
      return cors(new Response(got.value, { headers: { 'content-type': got.metadata?.type || 'image/jpeg', 'cache-control': 'private, max-age=86400' } }));
    }
    if (req.method === 'PUT') {
      const buf = await req.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > SELL_PHOTO_MAX) return json({ error: 'size' }, 413);
      const type = /^image\/(jpeg|png|webp)$/.test(req.headers.get('content-type') || '') ? req.headers.get('content-type') : 'image/jpeg';
      await env.PUSH.put(photoKey(box, id, n), buf, { metadata: { type }, expirationTtl: SELL_PHOTO_TTL });
      return json({ ok: true });
    }
  }
  if (url.pathname === '/sell/item') {
    if (req.method === 'GET' || req.method === 'DELETE') {
      const box = q.get('box');
      const id = q.get('id');
      if (!validId(box) || !validSellId(id)) return json({ error: 'param' }, 400);
      if (req.method === 'GET') {
        const it = await env.PUSH.get(sellKey(box, id), 'json');
        return it ? json(it) : json({ error: 'not found' }, 404);
      }
      const it = await env.PUSH.get(sellKey(box, id), 'json');
      const count = Math.min(SELL_MAX_PHOTOS, Number(it?.photos) || SELL_MAX_PHOTOS);
      for (let n = 1; n <= count; n++) await env.PUSH.delete(photoKey(box, id, n));
      await env.PUSH.delete(sellKey(box, id));
      return json({ ok: true });
    }
    if (req.method === 'POST') {
      const text = await req.text();
      if (text.length > SELL_ITEM_MAX) return json({ error: 'size' }, 413);
      let data;
      try { data = JSON.parse(text); } catch { return json({ error: 'json' }, 400); }
      if (!validId(data.box) || !validSellId(data.id)) return json({ error: 'param' }, 400);
      const old = await env.PUSH.get(sellKey(data.box, data.id), 'json');
      const item = mergeSellItem(old || { id: data.id }, data.patch);
      await env.PUSH.put(sellKey(data.box, data.id), JSON.stringify(item));
      const woke = data.patch?.phase && data.patch.phase !== old?.phase && SELL_ATTENTION.includes(data.patch.phase)
        ? await sellWake(env, data.box).catch(() => false) : false;
      return json({ ok: true, item, woke });
    }
  }
  if (req.method === 'POST' && url.pathname === '/sell/box') {
    const data = await body(req);
    if (!validId(data.box)) return json({ error: 'box' }, 400);
    if (data.device != null && !validId(data.device)) return json({ error: 'device' }, 400);
    if (data.device) await env.PUSH.put(`sellbox:${data.box}`, JSON.stringify({ device: data.device }));
    else await env.PUSH.delete(`sellbox:${data.box}`);
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}

async function handle(req, env) {
  if (req.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
  const url = new URL(req.url);
  if (req.method === 'GET' && url.pathname === '/vapid') return json({ key: env.VAPID_PUBLIC });
  if (req.method === 'GET' && url.pathname === '/') {
    let keys = 'ok';
    try { await signingKey(env); } catch { keys = 'VAPID_PRIVATE_JWK fehlt oder ist kein gültiger Schlüssel – node setup.mjs --neue-schluessel'; }
    if (!/^B[A-Za-z0-9_-]{80,}$/.test(env.VAPID_PUBLIC || '')) keys = 'VAPID_PUBLIC fehlt – node setup.mjs --neue-schluessel';
    return json({ ok: keys === 'ok', service: 'week-planner-push', keys });
  }
  // Diagnose für die App: Ist das Gerät bekannt, wann wird es geweckt, wie lief der letzte Weckruf?
  if (req.method === 'GET' && url.pathname === '/status') {
    const id = url.searchParams.get('id');
    if (!validId(id)) return json({ error: 'id' }, 400);
    return json(deviceStatus(await readDevice(env, id)));
  }

  if (url.pathname.startsWith('/sell/')) return handleSell(req, env, url);

  const data = await body(req);
  if (!validId(data.id)) return json({ error: 'id' }, 400);

  if (req.method === 'POST' && url.pathname === '/register') {
    const sub = data.subscription;
    if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint)) return json({ error: 'subscription' }, 400);
    const dev = (await readDevice(env, data.id)) || { times: [] };
    await writeDevice(env, data.id, { ...dev, sub: { endpoint: sub.endpoint, keys: sub.keys || null } });
    const ids = await readDevices(env);
    if (!ids.includes(data.id)) await env.PUSH.put('devices', JSON.stringify([...ids, data.id].slice(-20)));
    return json({ ok: true });
  }

  const dev = await readDevice(env, data.id);
  if (!dev) return json({ error: 'unknown' }, 404);

  if (req.method === 'PUT' && url.pathname === '/times') {
    await writeDevice(env, data.id, { ...dev, times: cleanTimes(data.times) });
    return json({ ok: true });
  }
  if (req.method === 'POST' && url.pathname === '/wake') {
    await writeDevice(env, data.id, { ...dev, times: cleanTimes([...(dev.times || []), data.at]) });
    return json({ ok: true });
  }
  if (req.method === 'POST' && url.pathname === '/test') {
    const status = await sendPush(env, dev.sub);
    return json({ ok: status >= 200 && status < 300, status });
  }
  return json({ error: 'not found' }, 404);
}

export default {
  fetch: (req, env) => handle(req, env).catch((e) => json({ error: String(e?.message || e) }, 500)),
  scheduled: (event, env, ctx) => ctx.waitUntil(tick(env)),
};
