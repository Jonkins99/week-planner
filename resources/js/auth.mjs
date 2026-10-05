// Zugangssperre: einmal das Passwort eingeben, danach ist das Gerät freigeschaltet.
// Im Code steht nur ein gesalzener SHA-256-Hash, nicht das Passwort selbst. Das ist
// kein echter Schutz (alles läuft im Browser), hält aber Gelegenheitsbesucher fern.
// Auf localhost (Entwicklung) entfällt die Sperre.

const SALT = 'week-planner|2026|';
export const PASS_HASH = '2badeb7b6b055331cb253a223d99c7698b5787842cb35b186924f1c03bede001';
export const AUTH_KEY = 'wp-auth-v1';

export function isLocalHost(host = globalThis.location?.hostname || '') {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host.endsWith('.localhost');
}

export async function hashPassword(pw) {
  const data = new TextEncoder().encode(SALT + String(pw || '').trim().toLowerCase());
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function checkPassword(pw) {
  return (await hashPassword(pw)) === PASS_HASH;
}

export function isUnlocked(storage = globalThis.localStorage) {
  if (isLocalHost()) return true;
  try { return storage.getItem(AUTH_KEY) === PASS_HASH; } catch { return false; }
}

export function rememberUnlock(storage = globalThis.localStorage) {
  try { storage.setItem(AUTH_KEY, PASS_HASH); } catch { /* dann eben beim nächsten Mal erneut */ }
}
