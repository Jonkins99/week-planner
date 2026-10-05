// Übernimmt Rezepte und Wochenplan-Historie aus einem Backup der App „My Recipe Box"
// (RecetteTek, Dateiendung .rtk = ZIP) nach resources/data/seed.json.
// Die App lädt diese Datei beim allerersten Start als Grundbestand.
//
//   node scripts/import-myrecipebox.mjs <backup.rtk | entpackter Ordner>

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertBackup } from '../resources/js/legacy-import.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error('Aufruf: node scripts/import-myrecipebox.mjs <backup.rtk | Ordner>');
  process.exit(1);
}

let dir = resolve(src);
let temp = null;
if (!statSync(dir).isDirectory()) {
  temp = mkdtempSync(join(tmpdir(), 'rtk-'));
  execFileSync('unzip', ['-o', '-q', dir, '-d', temp]);
  dir = temp;
}

const read = (name) => {
  const p = join(dir, name);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
};

const seed = convertBackup({ recipes: read('recipes_0.json'), calendar: read('calendar.json'), shopping: read('shopping.json') });
const out = join(here, '..', 'resources', 'data', 'seed.json');
writeFileSync(out, JSON.stringify(seed));
if (temp) rmSync(temp, { recursive: true, force: true });

const entries = Object.values(seed.plan).reduce((n, d) => n + Object.values(d.slots).reduce((m, l) => m + l.length, 0), 0);
console.log(`${seed.recipes.length} Rezepte, ${Object.keys(seed.plan).length} Tage, ${entries} Einträge, ${seed.shopping.items.length} Einkaufsposten -> ${out}`);
