// Sicherung als ZIP: daten.json (vollständiger Stand, wird beim Einspielen gelesen) plus
// lesbare Kopien der Rezepte als Markdown — falls die App einmal nicht mehr da ist.

import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { sanitizeState } from './model.mjs';

const slug = (s) => String(s || 'rezept').toLowerCase()
  .replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'rezept';

function recipeMd(r) {
  const out = [`# ${r.title}`, ''];
  if (r.ratingElika || r.ratingJanik) out.push(`Bewertung Elika: ${r.ratingElika || '–'} · Janik: ${r.ratingJanik || '–'}`, '');
  if (r.ingredients.length) out.push('## Zutaten', '', ...r.ingredients.map((x) => `- ${x}`), '');
  if (r.steps.length) out.push('## Zubereitung', '', ...r.steps.map((x, i) => `${i + 1}. ${x}`), '');
  if (r.notes) out.push('## Notizen', '', r.notes, '');
  if (r.video) out.push(`Video: ${r.video}`);
  if (r.source) out.push(`Quelle: ${r.source}`);
  return `${out.join('\n').trim()}\n`;
}

export function backupName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `week-planner-sicherung-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.zip`;
}

export function buildBackupZip(state, meta = {}) {
  const data = { app: 'week-planner', exportedAt: new Date().toISOString(), ...meta, ...JSON.parse(JSON.stringify(state)) };
  const files = {
    'daten.json': strToU8(JSON.stringify(data, null, 1)),
    'LIESMICH.txt': strToU8('Sicherung des Week Planners.\nZum Wiederherstellen in der App unter Einstellungen → „Sicherung einspielen" diese ZIP-Datei auswählen.\nDer Ordner „rezepte" enthält lesbare Kopien aller Rezepte.\n'),
  };
  const used = new Set();
  for (const r of state.recipes || []) {
    let name = slug(r.title);
    while (used.has(name)) name += '-2';
    used.add(name);
    files[`rezepte/${name}.md`] = strToU8(recipeMd(r));
  }
  return zipSync(files, { level: 6 });
}

/** Datei (ZIP oder JSON) lesen und den Stand daraus prüfen. */
export async function readBackupFile(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let text;
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const files = unzipSync(buf);
    const key = Object.keys(files).find((k) => /(^|\/)daten\.json$/.test(k));
    if (!key) throw new Error('In der ZIP-Datei fehlt daten.json.');
    text = strFromU8(files[key]);
  } else {
    text = strFromU8(buf);
  }
  return sanitizeState(JSON.parse(text));
}
