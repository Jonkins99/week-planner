// Einmalig: VAPID-Schlüsselpaar für den Weckdienst erzeugen.
//   node gen-vapid.mjs
// Den öffentlichen Schlüssel in wrangler.toml (VAPID_PUBLIC) eintragen, den privaten
// als Secret hinterlegen: npx wrangler secret put VAPID_PRIVATE_JWK  (Wert einfügen).
// Der private Schlüssel gehört in keine Datei im Projekt.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const pub = publicKey.export({ format: 'jwk' });
const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]).toString('base64url');

console.log('VAPID_PUBLIC (in wrangler.toml):');
console.log(raw);
console.log('\nVAPID_PRIVATE_JWK (bei `npx wrangler secret put VAPID_PRIVATE_JWK` einfügen):');
console.log(JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }));
