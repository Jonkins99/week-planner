// Benachrichtigungen der Werkzeuge (derzeit: Aquarium-Erinnerungen).
//
// Eine Web-App kann ohne eigenen Server keine Meldung zu einer festen Uhrzeit „vorbestellen".
// Deshalb drei Wege, die sich ergänzen:
// 1. Solange die App offen ist oder im Hintergrund noch läuft, prüft ein Takt die fälligen
//    Erinnerungen und zeigt sie als Systembenachrichtigung (mit Knöpfen) und in der App
//    als Vollbild-Hinweis.
// 2. Der Service Worker bekommt den Plan der nächsten Tage (IndexedDB) und zeigt fällige
//    Meldungen beim regelmäßigen Hintergrund-Abgleich (Periodic Background Sync, nur bei
//    installierter App; wie oft, entscheidet Chrome).
// 3. Beim nächsten Öffnen erscheint alles Liegengebliebene sofort.
// Antworten über die Knöpfe einer Benachrichtigung landen über den Service Worker in der
// Inbox (IndexedDB) und werden von der App übernommen.

import { idbGet, idbSet, drainInbox } from './idb.mjs';

export const notifSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const notifPermission = () => (notifSupported() ? Notification.permission : 'unsupported');

export async function askPermission() {
  if (!notifSupported()) return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

async function registration() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return (await navigator.serviceWorker.getRegistration()) || null;
  } catch {
    return null;
  }
}

/** Eine Benachrichtigung zeigen. `p` = { key, title, body, actions, level, url }. */
export async function showNotification(p) {
  if (notifPermission() !== 'granted') return false;
  const opts = {
    body: p.body,
    tag: p.key,
    renotify: true,
    requireInteraction: p.level > 0 || p.sticky,
    icon: './icons/icon-192.png',
    badge: './icons/favicon-48.png',
    vibrate: p.level >= 2 ? [400, 120, 400, 120, 800] : p.level === 1 ? [300, 100, 300] : [180],
    data: { key: p.key, url: p.url || './?tool=aqua' },
    actions: p.actions || [],
    silent: false,
  };
  const reg = await registration();
  try {
    if (reg) { await reg.showNotification(p.title, opts); return true; }
    const { actions, ...plain } = opts;
    new Notification(p.title, plain);
    return true;
  } catch {
    return false;
  }
}

/** Plan für den Service Worker ablegen (fertige Texte, damit er nichts rechnen muss). */
export async function writeSchedule(list) {
  try {
    // Eine laufende Probe des Weckdienstes bleibt erhalten.
    const probe = (((await idbGet('kv', 'aqua-schedule')) || {}).list || []).filter((x) => x.kind === 'test' && x.at > Date.now() - 300000);
    await idbSet('kv', 'aqua-schedule', { at: Date.now(), list: [...list, ...probe] });
  } catch { /* ohne Plan nur Takt in der App */ }
}

/** Hintergrund-Abgleich anmelden (nur installierte App, Chrome entscheidet über die Häufigkeit). */
export async function registerPeriodic() {
  const reg = await registration();
  if (!reg?.periodicSync) return 'unsupported';
  try {
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (st.state !== 'granted') return st.state;
    await reg.periodicSync.register('tool-reminders', { minInterval: 15 * 60000 });
    return 'granted';
  } catch {
    return 'error';
  }
}

/** Antworten aus Benachrichtigungen abholen: [{ key, action, at }]. */
export const takeAnswers = () => drainInbox();

/** Nachrichten des Service Workers (Antwort auf eine Benachrichtigung bei offener App). */
export function onWorkerMessage(fn) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'tool-answer' || e.data?.type === 'tool-open') fn(e.data);
  });
}

// ------------------------------------------------------------ Weckdienst (Web Push)
// Damit Erinnerungen auch bei geschlossener App und gesperrtem Handy kommen, meldet die
// App ihre Weckzeiten an einen kleinen eigenen Dienst (push-server/, Cloudflare Worker).
// Der schickt zur Zeit einen leeren Push, der Service Worker zeigt dann die Meldung.

const PUSH_TIMES = 'wp-push-times-v1';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

export async function pushConfig() {
  return (await idbGet('kv', 'push-config')) || null;
}

const keyBytes = (b64) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);

/** Gerät beim Weckdienst anmelden (oder die Anmeldung auffrischen). */
export async function enablePush(url) {
  const base = String(url || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) throw new Error('Die Adresse des Weckdienstes muss mit https:// beginnen.');
  if (!pushSupported()) throw new Error('Dieser Browser unterstützt keine Push-Benachrichtigungen.');
  if ((await askPermission()) !== 'granted') throw new Error('Benachrichtigungen sind nicht erlaubt.');
  const reg = await navigator.serviceWorker.ready;
  const res = await fetch(`${base}/vapid`);
  if (!res.ok) throw new Error('Der Weckdienst antwortet nicht.');
  const { key } = await res.json();
  if (!key || /HIER_/.test(key)) throw new Error('Der Weckdienst hat noch keinen Schlüssel (VAPID_PUBLIC).');
  let sub = await reg.pushManager.getSubscription();
  const want = keyBytes(key);
  const same = sub?.options?.applicationServerKey && new Uint8Array(sub.options.applicationServerKey).every((b, i) => b === want[i]);
  if (sub && !same) { await sub.unsubscribe(); sub = null; }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want });
  const old = await pushConfig();
  const id = old?.url === base && old?.id ? old.id : newId();
  const r = await fetch(`${base}/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, subscription: sub.toJSON() }) });
  if (!r.ok) throw new Error('Die Anmeldung beim Weckdienst ist gescheitert.');
  await idbSet('kv', 'push-config', { url: base, id, endpoint: sub.endpoint, at: Date.now() });
  try { localStorage.removeItem(PUSH_TIMES); } catch { /* egal */ }
  return { url: base, id };
}

/** Beim Start: Ist das Abo noch dasselbe? Sonst still neu anmelden. */
export async function refreshPush() {
  const cfg = await pushConfig();
  if (!cfg || !pushSupported() || notifPermission() !== 'granted') return cfg;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub || sub.endpoint !== cfg.endpoint) return await enablePush(cfg.url);
  } catch { /* nächster Start */ }
  return cfg;
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    await (await reg.pushManager.getSubscription())?.unsubscribe();
  } catch { /* egal */ }
  await idbSet('kv', 'push-config', null);
}

/** Weckzeiten übermitteln (nur, wenn sie sich geändert haben). */
export async function syncWakeTimes(times) {
  const cfg = await pushConfig();
  if (!cfg) return false;
  const list = [...new Set(times.filter((t) => t > Date.now() - 60000))].sort((a, b) => a - b);
  const sig = `${cfg.id}|${list.join(',')}`;
  let last = '';
  try { last = localStorage.getItem(PUSH_TIMES) || ''; } catch { /* egal */ }
  if (last === sig) return true;
  try {
    const r = await fetch(`${cfg.url}/times`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: cfg.id, times: list }) });
    if (r.status === 404) { await enablePush(cfg.url); return false; }
    if (r.ok) { try { localStorage.setItem(PUSH_TIMES, sig); } catch { /* egal */ } }
    return r.ok;
  } catch {
    return false;
  }
}

/** Probe-Weckruf: kommt nach spätestens einer Minute als Benachrichtigung. */
export async function testWake(delayMs = 60000) {
  const cfg = await pushConfig();
  if (!cfg) throw new Error('Weckdienst ist nicht eingerichtet.');
  const at = Date.now() + delayMs;
  const plan = (await idbGet('kv', 'aqua-schedule')) || { list: [] };
  plan.list = [...(plan.list || []).filter((x) => x.kind !== 'test'),
    { key: `push-test:${at}`, kind: 'test', at, level: 0, title: 'Weckdienst funktioniert', body: 'Diese Meldung kam über den Weckdienst – so erscheinen die Erinnerungen auch bei geschlossener App.', actions: [] }];
  await idbSet('kv', 'aqua-schedule', plan);
  const r = await fetch(`${cfg.url}/wake`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: cfg.id, at }) });
  if (!r.ok) throw new Error('Der Weckdienst hat die Probe abgelehnt.');
  return at;
}

// ------------------------------------------------------------ Diagnose
// Vergleicht, was der Weckdienst zuletzt verschickt hat, mit dem, was auf diesem Handy
// angekommen ist (der Service Worker vermerkt jeden Push in kv „push-log").

const clock = (t) => new Date(t).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Befund aus Dienst-Status und Handy-Protokoll: { tone: 'ok'|'warn'|'error', lines: [], fix }. */
export function diagnosePush({ server, phone, permission = 'granted', now = Date.now() }) {
  const lines = [];
  if (permission !== 'granted') return { tone: 'error', lines: ['Benachrichtigungen sind für die App nicht erlaubt.'], fix: 'permission' };
  if (!server) return { tone: 'error', lines: ['Der Weckdienst ist nicht erreichbar (Adresse prüfen, Netz prüfen).'], fix: 'server' };
  if (server === 'outdated') return { tone: 'warn', lines: ['Der Weckdienst läuft noch in einer älteren Fassung ohne Diagnose. Bitte neu veröffentlichen (push-server: npx wrangler deploy).'], fix: 'deploy' };
  if (!server.known || !server.subscribed) return { tone: 'error', lines: ['Der Weckdienst kennt dieses Handy nicht (mehr).'], fix: 'register' };
  lines.push(server.next ? `Nächster Weckruf: ${clock(server.next)} (${server.count} geplant)` : 'Zurzeit ist kein Weckruf geplant.');
  const sent = server.last;
  if (sent) lines.push(`Zuletzt verschickt: ${clock(sent.at)} – ${sent.status >= 200 && sent.status < 300 ? 'vom Push-Dienst angenommen' : `abgelehnt (Status ${sent.status || 'Netzfehler'})`}`);
  else lines.push('Der Weckdienst hat noch keinen Weckruf verschickt.');
  lines.push(phone?.at ? `Zuletzt auf diesem Handy angekommen: ${clock(phone.at)}` : 'Auf diesem Handy ist noch kein Weckruf angekommen.');
  if (sent && sent.status && (sent.status < 200 || sent.status >= 300)) return { tone: 'error', lines, fix: 'register' };
  // Verschickt, aber nicht (oder viel später) angekommen: Android hat den Push zurückgehalten.
  if (sent && sent.status >= 200 && sent.status < 300 && (!phone?.at || phone.at < sent.at - 60000) && now - sent.at > 3 * 60000) {
    return { tone: 'warn', lines, fix: 'battery' };
  }
  return { tone: 'ok', lines, fix: sent ? null : 'probe' };
}

/** Status beim Weckdienst und Protokoll des Handys holen und auswerten. */
export async function pushDiagnosis() {
  const cfg = await pushConfig();
  if (!cfg) return { tone: 'error', lines: ['Der Weckdienst ist auf diesem Handy nicht eingerichtet.'], fix: 'register' };
  let server = null;
  try {
    const r = await fetch(`${cfg.url}/status?id=${encodeURIComponent(cfg.id)}`, { cache: 'no-store' });
    if (r.ok) server = await r.json();
    else if (r.status === 400) server = 'outdated';
  } catch { /* nicht erreichbar */ }
  let sameSub = true;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    sameSub = !!sub && sub.endpoint === cfg.endpoint;
  } catch { /* egal */ }
  const res = diagnosePush({ server, phone: await idbGet('kv', 'push-log'), permission: notifPermission() });
  if (!sameSub && res.tone === 'ok') return { tone: 'error', lines: [...res.lines, 'Das Push-Abo dieses Handys hat sich geändert.'], fix: 'register' };
  return res;
}
