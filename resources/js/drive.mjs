// Direktes Hochladen der Sicherung in Google Drive (optional).
// Braucht eine OAuth-Client-ID (Typ „Webanwendung") aus der Google Cloud Console mit der
// Seiten-Adresse als „Autorisierter JavaScript-Ursprung". Berechtigung: drive.file —
// die App sieht ausschließlich die Dateien, die sie selbst angelegt hat.

const GIS = 'https://accounts.google.com/gsi/client';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER = 'Week Planner Sicherungen';

let gisLoading = null;
function loadGis() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ||= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src: GIS, async: true, defer: true });
    s.onload = () => resolve();
    s.onerror = () => { gisLoading = null; reject(new Error('Google-Anmeldung konnte nicht geladen werden.')); };
    document.head.appendChild(s);
  });
  return gisLoading;
}

let cached = null;
async function token(clientId, silent = false) {
  if (cached && cached.clientId === clientId && cached.until > Date.now() + 60000) return cached.token;
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = globalThis.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (res) => {
        if (res?.error || !res?.access_token) { reject(new Error(res?.error_description || 'Google-Anmeldung abgebrochen.')); return; }
        cached = { clientId, token: res.access_token, until: Date.now() + (Number(res.expires_in) || 3000) * 1000 };
        resolve(res.access_token);
      },
      error_callback: (err) => reject(new Error(err?.message || 'Google-Anmeldung abgebrochen.')),
    });
    // Automatisch (ohne Rückfrage): nur wenn die Freigabe schon einmal erteilt wurde.
    client.requestAccessToken({ prompt: silent ? 'none' : cached ? '' : 'consent' });
  });
}

async function api(url, tok, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${tok}`, ...(init.headers || {}) } });
  if (!res.ok) {
    let msg = `Google Drive antwortet mit HTTP ${res.status}.`;
    try { msg = (await res.json())?.error?.message || msg; } catch { /* Status reicht */ }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

/** Ältere Sicherungen im Ordner löschen, sodass nur die neuesten `keep` bleiben. */
async function prune(tok, parent, keep) {
  const q = encodeURIComponent(`'${parent}' in parents and trashed=false and name contains 'week-planner-sicherung'`);
  const list = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=100&fields=files(id,name,createdTime)`, tok);
  const old = (list?.files || []).slice(keep);
  for (const f of old) await api(`https://www.googleapis.com/drive/v3/files/${f.id}`, tok, { method: 'DELETE' });
  return old.length;
}

async function folderId(tok, known) {
  if (known) {
    try {
      const f = await api(`https://www.googleapis.com/drive/v3/files/${known}?fields=id,trashed`, tok);
      if (f?.id && !f.trashed) return f.id;
    } catch { /* neu anlegen */ }
  }
  const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, tok);
  if (found?.files?.[0]?.id) return found.files[0].id;
  const created = await api('https://www.googleapis.com/drive/v3/files?fields=id', tok, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
  });
  return created.id;
}

/**
 * Lädt `blob` als `name` hoch und behält danach nur die neuesten `keep` Sicherungen.
 * Rückgabe: { fileId, folderId, removed }.
 */
export async function uploadToDrive({ clientId, blob, name, folder = null, keep = 3, silent = false }) {
  if (!clientId) throw new Error('Keine Google-Client-ID hinterlegt.');
  const tok = await token(clientId, silent);
  const parent = await folderId(tok, folder);
  const boundary = `wp${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name, parents: [parent], mimeType: 'application/zip' });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\nContent-Type: application/zip\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  const file = await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', tok, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  let removed = 0;
  try { removed = await prune(tok, parent, keep); } catch { /* Aufräumen ist zweitrangig */ }
  return { fileId: file.id, folderId: parent, removed };
}
