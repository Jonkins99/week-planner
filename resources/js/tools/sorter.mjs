// Datei-Aussortierer: reine Logik (unter Node testbar).
// Einordnung in Kategorien, Bewertung als Löschkandidat, Punkte und Ränge.

export const CATEGORIES = [
  { key: 'screenshots', label: 'Screenshots', icon: 'phone' },
  { key: 'photos', label: 'Fotos', icon: 'images' },
  { key: 'videos', label: 'Videos', icon: 'file-video' },
  { key: 'documents', label: 'Dokumente', icon: 'file-text' },
  { key: 'apps', label: 'Apps', icon: 'zip' },
];

const EXT = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp', 'avif', 'dng', 'raw'],
  video: ['mp4', 'mov', 'mkv', 'webm', '3gp', 'avi', 'm4v'],
  document: ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'odp', 'epub', 'zip', 'rar', '7z', 'json', 'xml', 'html', 'pages', 'numbers', 'key'],
  app: ['apk', 'xapk', 'apks', 'apkm', 'aab', 'exe', 'msi', 'dmg', 'appimage', 'deb'],
};

export const extOf = (name) => (String(name).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

const isScreenshotPath = (path, name) => /screenshot|bildschirmfoto|screen_?recording|screenrecord/i.test(`${path}/${name}`);
export const isDownloadPath = (path) => /(^|\/)(download|downloads|telegram|whatsapp\/media\/whatsapp documents)(\/|$)/i.test(path);
const isCameraPath = (path) => /(^|\/)(dcim\/camera|dcim|camera|kamera)(\/|$)/i.test(path) && !/screenshot/i.test(path);
const isMessengerPath = (path) => /whatsapp|telegram|signal|messenger/i.test(path);

/** Kategorie einer Datei oder null (dann gehört sie zu keiner Kategorie und bleibt außen vor). */
export function categorize(name, path = '', mime = '') {
  const ext = extOf(name);
  if (EXT.app.includes(ext)) return 'apps';
  if (EXT.image.includes(ext) || mime.startsWith('image/')) return isScreenshotPath(path, name) ? 'screenshots' : 'photos';
  if (EXT.video.includes(ext) || mime.startsWith('video/')) return isScreenshotPath(path, name) ? 'screenshots' : 'videos';
  if (EXT.document.includes(ext) || mime === 'application/pdf' || mime.startsWith('text/')) return 'documents';
  return null;
}

/** Ordner, die nie durchsucht werden (System, App-Daten, Vorschaubilder). */
export function skipDir(name, path = '') {
  if (name.startsWith('.')) return true;
  if (/^(android|lost\.dir|\$recycle\.bin|node_modules|system volume information)$/i.test(name)) return true;
  return /(^|\/)android\/(data|obb)(\/|$)/i.test(`${path}/${name}`);
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const DAY = 86400000;

/**
 * Wie sehr eine Datei ein Löschkandidat ist (0–1) und warum.
 * Groß vor klein, alt vor neu, Screenshots/Downloads vor eigenen Fotos,
 * lange unbenutzt vor zuletzt verwendet (der Browser liefert keine Zugriffszeit;
 * das Änderungsdatum steht dafür, dazu merkt sich die App, was zuletzt behalten wurde).
 */
export function scoreFile(f, now = Date.now(), { dupes = null } = {}) {
  const reasons = [];
  const mb = f.size / 1048576;
  const size = clamp01(Math.log10(Math.max(f.size, 1) / 51200) / Math.log10((1024 * 1048576) / 51200));
  const ageDays = Math.max(0, (now - (f.modified || now)) / DAY);
  const age = clamp01(Math.sqrt(ageDays / 1095));
  let source = 0.4;
  if (f.category === 'screenshots') { source = 0.95; reasons.push('Screenshot'); }
  else if (f.category === 'apps') { source = 0.95; reasons.push('Installationsdatei'); }
  else if (isDownloadPath(f.path)) { source = 0.85; reasons.push('Download'); }
  else if (isMessengerPath(f.path)) { source = 0.75; reasons.push('Messenger'); }
  else if (isCameraPath(f.path)) { source = f.category === 'videos' ? 0.35 : 0.12; }
  else if (f.category === 'documents') source = 0.55;
  else if (f.category === 'videos') source = 0.5;
  // „Lange nicht benutzt": ohne Zugriffszeit über das Änderungsdatum
  const idle = clamp01((ageDays - 30) / 700);
  let score = 0.32 * size + 0.24 * age + 0.3 * source + 0.14 * idle;
  if (dupes && dupes.has(f.id)) { score = Math.min(1, score + 0.25); reasons.unshift('Mögliches Duplikat'); }
  if (mb >= 100) reasons.unshift('Riesig');
  else if (mb >= 15) reasons.unshift('Groß');
  if (ageDays >= 730) reasons.push(`${Math.floor(ageDays / 365)} Jahre alt`);
  else if (ageDays >= 365) reasons.push('Über ein Jahr alt');
  else if (ageDays >= 180) reasons.push('Älter als ein halbes Jahr');
  return { score: Math.round(score * 1000) / 1000, reasons: reasons.slice(0, 3) };
}

/** Mögliche Duplikate: gleiche Größe und gleiche Endung (Kopien, doppelt gespeicherte Downloads). */
export function findDupes(files) {
  const groups = new Map();
  for (const f of files) {
    if (f.size < 20480) continue;
    const k = `${f.size}|${extOf(f.name)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const out = new Set();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    // Die älteste Fassung bleibt Original, die übrigen sind Kandidaten.
    list.sort((a, b) => (a.modified || 0) - (b.modified || 0)).slice(1).forEach((f) => out.add(f.id));
  }
  return out;
}

/** Schlüssel für „schon einmal behalten" (überlebt einen neuen Scan, unabhängig vom Datum). */
export const keepKey = (f) => `${f.path}/${f.name}|${f.size}`;

/** Kandidaten sortieren: einmal Behaltenes wird nie wieder vorgeschlagen. */
export function rankCandidates(files, kept = {}, now = Date.now(), limit = 400) {
  const dupes = findDupes(files);
  return files
    .filter((f) => !kept[keepKey(f)])
    .map((f) => ({ ...f, ...scoreFile(f, now, { dupes }) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ------------------------------------------------------------ Punkte & Ränge

export const RANKS = [
  { xp: 0, title: 'Krümelsucher' },
  { xp: 400, title: 'Staubwedler' },
  { xp: 1200, title: 'Ordnungshüter' },
  { xp: 3000, title: 'Speicher-Samurai' },
  { xp: 6500, title: 'Byte-Bezwinger' },
  { xp: 12000, title: 'Gigabyte-Gärtner' },
  { xp: 22000, title: 'Meister der Leere' },
];

export function rankOf(xp) {
  let i = 0;
  while (i + 1 < RANKS.length && xp >= RANKS[i + 1].xp) i++;
  const cur = RANKS[i];
  const next = RANKS[i + 1] || null;
  return { level: i + 1, title: cur.title, next, progress: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1 };
}

/** Punkte für eine Entscheidung: Grundpunkte, Löschen nach Größe, Tempo-Kombo. */
export function pointsFor(decision, size, combo) {
  const base = decision === 'delete' ? 10 + Math.min(150, Math.round(Math.sqrt(size / 1048576) * 12)) : 4;
  return Math.round(base * comboFactor(combo));
}

export const comboFactor = (combo) => 1 + Math.min(4, Math.floor(combo / 5)) * 0.5;

export function emptyStats() {
  return {
    xp: 0, freed: 0, deleted: 0, kept: 0, swipes: 0, sessions: 0, bestSession: 0, bestCombo: 0,
    biggest: null, byCategory: {}, firstAt: null, lastAt: null,
  };
}

export function fmtBytes(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v < 1024) return `${v} B`;
  if (v < 1048576) return `${Math.round(v / 1024)} KB`;
  if (v < 1073741824) return `${(v / 1048576).toLocaleString('de-DE', { maximumFractionDigits: v < 10485760 ? 1 : 0 })} MB`;
  return `${(v / 1073741824).toLocaleString('de-DE', { maximumFractionDigits: 2 })} GB`;
}
