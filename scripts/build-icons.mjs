// Erzeugt aus public/icons/logo.svg alle PNG-Varianten für Manifest, Android und iOS.
//   node scripts/build-icons.mjs

import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = readFileSync(join(dir, 'logo.svg'), 'utf8');

// Maskable: Hintergrund randlos, Motiv auf die sichere Zone (80 %) verkleinert.
const maskable = svg
  .replace('rx="112"', 'rx="0"')
  .replace('<g id="mark">', '<g id="mark" transform="translate(51.2 51.2) scale(0.8)">');

const jobs = [
  ['icon-192.png', svg, 192],
  ['icon-512.png', svg, 512],
  ['maskable-192.png', maskable, 192],
  ['maskable-512.png', maskable, 512],
  ['apple-touch-icon.png', maskable, 180],
  ['favicon-48.png', svg, 48],
];

for (const [name, source, size] of jobs) {
  await sharp(Buffer.from(source), { density: 300 }).resize(size, size).png().toFile(join(dir, name));
}
writeFileSync(join(dir, 'maskable.svg'), maskable);
console.log(`${jobs.length} Icons nach ${dir}`);
