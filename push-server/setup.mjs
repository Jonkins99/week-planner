// Weckdienst in einem Rutsch einrichten (oder reparieren):
//   cd push-server
//   node setup.mjs                    # KV-Speicher, Schlüssel, Deploy – nur was noch fehlt
//   node setup.mjs --neue-schluessel  # zusätzlich neues VAPID-Schlüsselpaar (überschreibt das Secret)
//
// Trägt die KV-id und den öffentlichen Schlüssel selbst in wrangler.toml ein und reicht den
// privaten Schlüssel direkt an `wrangler secret put` weiter (er landet in keiner Datei).
// Nach neuen Schlüsseln muss jedes Handy im Aquarium einmal „Einrichten" antippen.
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const TOML = join(DIR, 'wrangler.toml');
const newKeys = process.argv.includes('--neue-schluessel');

function wrangler(args, { input, show = false } = {}) {
  const r = spawnSync('npx', ['--yes', 'wrangler', ...args], {
    cwd: DIR,
    encoding: 'utf8',
    input,
    stdio: show ? 'inherit' : ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  return { ok: r.status === 0, out: `${r.stdout || ''}\n${r.stderr || ''}` };
}

function fail(msg, out = '') {
  console.error(`\n✗ ${msg}`);
  if (out.trim()) console.error(out.trim());
  process.exit(1);
}

let toml = readFileSync(TOML, 'utf8');
const setToml = (re, value) => {
  toml = toml.replace(re, (_, a, b) => `${a}${value}${b}`);
  writeFileSync(TOML, toml);
};

// 1. Angemeldet?
console.log('1/4 Cloudflare-Anmeldung prüfen …');
if (/not authenticated|You are not logged in/i.test(wrangler(['whoami']).out)) {
  console.log('    Bitte im Browser bei Cloudflare anmelden.');
  if (!wrangler(['login'], { show: true }).ok) fail('Anmeldung bei Cloudflare gescheitert.');
}

// 2. KV-Speicher
console.log('2/4 KV-Speicher „PUSH" …');
const kvMatch = toml.match(/binding = "PUSH"\s*\nid = "([^"]*)"/);
if (!kvMatch || !/^[0-9a-f]{32}$/.test(kvMatch[1])) {
  let id = null;
  const list = wrangler(['kv', 'namespace', 'list']);
  try {
    const all = JSON.parse(list.out.slice(list.out.indexOf('['), list.out.lastIndexOf(']') + 1));
    id = all.find((n) => n.title === 'PUSH' || /-PUSH$/.test(n.title))?.id || null;
  } catch { /* noch keiner da */ }
  if (id) {
    console.log(`    vorhandenen Speicher übernommen (${id})`);
  } else {
    const made = wrangler(['kv', 'namespace', 'create', 'PUSH']);
    id = made.out.match(/\b([0-9a-f]{32})\b/)?.[1];
    if (!id) fail('KV-Speicher konnte nicht angelegt werden:', made.out);
    console.log(`    neu angelegt (${id})`);
  }
  setToml(/(binding = "PUSH"\s*\nid = ")[^"]*(")/, id);
} else {
  console.log(`    schon eingetragen (${kvMatch[1]})`);
}

// 3. VAPID-Schlüssel
console.log('3/4 Schlüssel …');
const hasPublic = /VAPID_PUBLIC = "B[A-Za-z0-9_-]{80,}"/.test(toml);
if (newKeys || !hasPublic) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]).toString('base64url');
  const secret = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d });
  const put = wrangler(['secret', 'put', 'VAPID_PRIVATE_JWK'], { input: secret });
  if (!put.ok) fail('Privater Schlüssel konnte nicht hinterlegt werden:', put.out);
  setToml(/(VAPID_PUBLIC = ")[^"]*(")/, raw);
  console.log('    neues Schlüsselpaar erzeugt, privater Teil als Secret hinterlegt');
} else {
  console.log('    öffentlicher Schlüssel schon eingetragen (neu erzeugen: --neue-schluessel)');
}

// 4. Hochladen
console.log('4/4 Hochladen …');
const dep = wrangler(['deploy']);
if (!dep.ok) fail('Deploy gescheitert:', dep.out);
const url = dep.out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0];
if (!url) {
  console.log(dep.out.trim());
  console.log('\n✓ Hochgeladen. Die Adresse steht oben in der Ausgabe (…workers.dev).');
  process.exit(0);
}

try {
  const res = await fetch(`${url}/vapid`);
  const { key } = await res.json();
  if (key !== toml.match(/VAPID_PUBLIC = "([^"]*)"/)[1]) throw new Error('Schlüssel stimmt nicht');
  console.log(`\n✓ Weckdienst läuft: ${url}`);
} catch {
  console.log(`\n✓ Hochgeladen: ${url}`);
  console.log('  (Die erste Antwort kann ein paar Sekunden dauern – die Adresse einfach im Browser öffnen, dort muss {"ok":true,…} stehen.)');
}
console.log('  Diese Adresse am Handy unter Aquarium → Zahnrad → Weckdienst eintragen und „Einrichten" antippen.');
