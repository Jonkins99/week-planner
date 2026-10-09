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

import { idbSet, drainInbox } from './idb.mjs';

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
  try { await idbSet('kv', 'aqua-schedule', { at: Date.now(), list }); } catch { /* ohne Plan nur Takt in der App */ }
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
