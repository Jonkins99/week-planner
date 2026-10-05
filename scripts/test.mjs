// Logik-Tests ohne Framework: node scripts/test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mondayOf, isoWeek, addDays, rangeLabel } from '../resources/js/dates.mjs';
import { search, normalize, distance } from '../resources/js/search.mjs';
import { addEntry, moveEntry, duplicateEntry, removeEntry, addExtraSlot, sanitizeState, sortRecipes, newRecipe, splitLines, averageRating } from '../resources/js/model.mjs';
import { weekText } from '../resources/js/whatsapp.mjs';
import { videoEmbed, findVideoUrl } from '../resources/js/video.mjs';
import { sanitizeImport } from '../resources/js/recipe-ai.mjs';
import { generateJson } from '../resources/js/gemini.mjs';
import { addItem, groupItems, emptyShopping, addStore, removeStore, setDept, suggestProducts, storeByName, sanitizeShopping } from '../resources/js/shopping.mjs';
import { readVoice } from '../resources/js/shopping-ai.mjs';
import { addPantryItem, pantryTree, emptyPantry } from '../resources/js/pantry.mjs';
import { readBrickMeals } from '../resources/js/pantry-ai.mjs';
import { buildBackupZip, readBackupFile } from '../resources/js/backup.mjs';
import { checkPassword } from '../resources/js/auth.mjs';
import { updateEntry, emptyState } from '../resources/js/model.mjs';

let failed = 0;
const pending = [];
function test(name, fn) {
  pending.push((async () => {
    try { await fn(); console.log(`ok   ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}\n     ${e.message}`); }
  })());
}

test('Datum: Montag und KW', () => {
  assert.equal(mondayOf('2026-10-05'), '2026-10-05');
  assert.equal(mondayOf('2026-10-11'), '2026-10-05');
  assert.equal(isoWeek('2026-10-05'), 41);
  assert.equal(isoWeek('2026-01-01'), 1);
  assert.equal(isoWeek('2027-01-01'), 53);
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
  assert.equal(rangeLabel('2026-09-28'), '28. Sep. – 4. Okt.');
});

test('Suche: Teilstring, Umlaute, Tippfehler, Wortreihenfolge', () => {
  const items = ['Spaghetti aglio, olio e peperoncino', 'Käse-(Schinken)-Knusperklößchen', 'Hackbraten', 'Nudeln mit Käsesoße, Lauchzwiebeln und Hack', 'Gyrossuppe'].map((title) => ({ title }));
  assert.equal(search(items, 'spag')[0].title, items[0].title);
  assert.equal(search(items, 'klosschen')[0].title, items[1].title);
  assert.equal(search(items, 'kase')[0].title.startsWith('Käse'), true);
  assert.deepEqual(search(items, 'hack').map((x) => x.title), ['Hackbraten', 'Nudeln mit Käsesoße, Lauchzwiebeln und Hack']);
  assert.equal(search(items, 'spagetti')[0].title, items[0].title);
  assert.equal(search(items, 'hack nudeln')[0].title, items[3].title);
  assert.equal(search(items, 'suppe')[0].title, 'Gyrossuppe');
  assert.equal(search(items, 'xyz').length, 0);
  assert.equal(normalize('Soße'), 'sosse');
  assert.equal(distance('kitten', 'sitting', 3), 3);
});

test('Plan: eintragen, verschieben, duplizieren, entfernen', () => {
  const plan = {};
  const a = addEntry(plan, '2026-10-05', 'dinner', { title: 'Manti' });
  const b = addEntry(plan, '2026-10-05', 'dinner', { title: 'Salat' });
  moveEntry(plan, { iso: '2026-10-05', slot: 'dinner', id: b.id }, { iso: '2026-10-05', slot: 'dinner', index: 0 });
  assert.deepEqual(plan['2026-10-05'].slots.dinner.map((e) => e.title), ['Salat', 'Manti']);
  moveEntry(plan, { iso: '2026-10-05', slot: 'dinner', id: a.id }, { iso: '2026-10-06', slot: 'lunch', index: null });
  assert.equal(plan['2026-10-06'].slots.lunch[0].title, 'Manti');
  const c = duplicateEntry(plan, { iso: '2026-10-06', slot: 'lunch', id: a.id }, { iso: '2026-10-07', slot: 'dinner' });
  assert.notEqual(c.id, a.id);
  removeEntry(plan, '2026-10-05', 'dinner', b.id);
  assert.equal(plan['2026-10-05'], undefined);
  const x = addExtraSlot(plan, '2026-10-08', 'Snack');
  addEntry(plan, '2026-10-08', x.id, { title: 'Obst' });
  assert.equal(sanitizeState({ plan, recipes: [] }).plan['2026-10-08'].slots[x.id][0].title, 'Obst');
});

test('WhatsApp-Text', () => {
  const plan = {};
  addEntry(plan, '2026-10-05', 'breakfast', { title: 'Rührei' });
  addEntry(plan, '2026-10-05', 'dinner', { title: 'Manti', recipeId: 'r1' });
  addEntry(plan, '2026-10-07', 'lunch', { title: 'Reste' });
  const x = addExtraSlot(plan, '2026-10-07', 'Snack');
  addEntry(plan, '2026-10-07', x.id, { title: 'Obst' });
  const t = weekText(plan, '2026-10-05', (e) => (e.recipeId ? 'Manti (Rezept)' : e.title));
  assert.match(t, /^\*Wochenplan KW 41\* · 05\.10\.–11\.10\./);
  assert.match(t, /\*Montag, 05\.10\.\*\n🌅 Rührei\n🌙 Manti \(Rezept\)/);
  assert.match(t, /\*Mittwoch, 07\.10\.\*\n☀️ Reste\n🍴 Snack · Obst/);
  assert.doesNotMatch(t, /Dienstag/);
  assert.equal(weekText({}, '2026-10-05'), '');
});

test('Notiz landet nicht im Export', () => {
  const plan = {};
  addEntry(plan, '2026-10-05', 'dinner', { title: 'Manti', note: 'Doppelte Menge als Meal Prep' });
  assert.doesNotMatch(weekText(plan, '2026-10-05'), /Meal Prep/);
});

test('Einkauf: Gruppen, Sortierung, Zusammenführen', () => {
  const sh = emptyShopping();
  addItem(sh, { name: 'Spülmittel', store: 'rossmann', dept: 'household' });
  addItem(sh, { name: 'Milch', store: 'lidl', dept: 'chilled' });
  addItem(sh, { name: 'Bananen', store: 'lidl', dept: 'produce' });
  addItem(sh, { name: 'Zettel' });
  const m = addItem(sh, { name: 'milch', store: 'lidl' });
  assert.equal(m.merged, true);
  assert.equal(m.item.qty, 2);
  const g = groupItems(sh);
  assert.deepEqual(g.map((x) => x.key), ['none', 'lidl', 'rossmann']);
  assert.deepEqual(g[1].items.map((i) => i.name), ['Bananen', 'Milch']);
  setDept(sh, 'Zettel', 'household');
  assert.equal(sh.items.find((i) => i.name === 'Zettel').dept, 'household');
  assert.equal(addItem(sh, { name: 'Zettel', store: 'aldi' }).item.dept, 'household');
  const k = addStore(sh, 'Kaufland');
  addItem(sh, { name: 'Brot', store: k.id });
  assert.equal(storeByName(sh, 'bei kaufland').id, k.id);
  removeStore(sh, k.id);
  assert.equal(sh.items.find((i) => i.name === 'Brot').store, null);
  assert.equal(suggestProducts(sh, 'ban')[0].name, 'Bananen');
  assert.equal(sanitizeShopping(JSON.parse(JSON.stringify(sh))).items.length, sh.items.length);
  assert.deepEqual(readVoice({ items: [{ name: ' Eier ', quantity: 10, store: 'Aldi', dept: 'Kühlung' }, { name: '' }] }), [{ name: 'Eier', qty: 10, store: 'Aldi', dept: 'chilled' }]);
});

test('Nur Elika / Nur Janik im Export', () => {
  const plan = {};
  const a = addEntry(plan, '2026-10-05', 'dinner', { title: 'Lasagne' });
  addEntry(plan, '2026-10-05', 'dinner', { title: 'Proteintopf', who: 'J' });
  updateEntry(plan, '2026-10-05', 'dinner', a.id, { who: 'E' });
  assert.match(weekText(plan, '2026-10-05'), /🌙 E: Lasagne\n🌙 J: Proteintopf/);
  updateEntry(plan, '2026-10-05', 'dinner', a.id, { who: null });
  assert.equal(plan['2026-10-05'].slots.dinner[0].who, undefined);
});

test('Vorrat: Baum, Zusammenführen, Brick-Antwort', () => {
  const p = emptyPantry();
  addPantryItem(p, { name: 'Reis', place: 'freezer/bricks/component', qty: 4 });
  addPantryItem(p, { name: 'Bolognese', place: 'freezer/bricks/component', qty: 2 });
  addPantryItem(p, { name: 'Chili', place: 'freezer/bricks/dish' });
  assert.equal(addPantryItem(p, { name: 'reis', place: 'freezer/bricks/component' }).item.qty, 5);
  const tree = pantryTree(p);
  assert.deepEqual(tree.map((m) => m.key), ['freezer', 'fridge', 'dry']);
  assert.equal(tree[0].places[1].items.length, 2);
  assert.equal(pantryTree(p, 'bolo').length, 1);
  const meals = readBrickMeals({ meals: [{ title: 'Bolo-Reis', bricks: [{ name: 'Reis', count: 1 }, { name: 'Bolognese', count: 1 }], tip: 'x' }, { title: 'Nur eins', bricks: [{ name: 'Reis', count: 1 }] }] }, p.items);
  assert.equal(meals.length, 1);
});

test('Sicherung als ZIP: hin und zurück', async () => {
  const st = emptyState();
  st.recipes.push({ ...newRecipe({ title: 'Käse-Spätzle' }) });
  addEntry(st.plan, '2026-10-05', 'dinner', { title: 'Käse-Spätzle', who: 'E' });
  addItem(st.shopping, { name: 'Milch', store: 'lidl' });
  addPantryItem(st.pantry, { name: 'Reis', place: 'freezer/bricks/component' });
  const zip = buildBackupZip(st);
  const back = await readBackupFile({ arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) });
  assert.equal(back.recipes[0].title, 'Käse-Spätzle');
  assert.equal(back.plan['2026-10-05'].slots.dinner[0].who, 'E');
  assert.equal(back.shopping.items[0].name, 'Milch');
  assert.equal(back.pantry.items[0].name, 'Reis');
});

test('Passwort', async () => {
  assert.equal(await checkPassword('janik'), true);
  assert.equal(await checkPassword('Janik '), true);
  assert.equal(await checkPassword('elika'), false);
});

test('Video-Adressen', () => {
  assert.equal(videoEmbed('https://youtube.com/shorts/2KyDrqiiZdU?si=x').embedUrl.startsWith('https://www.youtube-nocookie.com/embed/2KyDrqiiZdU'), true);
  assert.equal(videoEmbed('https://youtube.com/shorts/2KyDrqiiZdU').portrait, true);
  assert.equal(videoEmbed('https://www.instagram.com/reel/DWWhbRhD8F0/?igsh=abc').embedUrl, 'https://www.instagram.com/reel/DWWhbRhD8F0/embed/');
  assert.equal(videoEmbed('https://www.chefkoch.de/rezepte/1').embedUrl, null);
  assert.equal(findVideoUrl('siehe https://www.instagram.com/reel/DRZZU04DIxg und so'), 'https://www.instagram.com/reel/DRZZU04DIxg');
});

test('Rezepte: Sortierung und Zeilen', () => {
  const list = [newRecipe({ title: 'B', ratingElika: 4 }), newRecipe({ title: 'A' }), newRecipe({ title: 'C', ratingElika: 5, ratingJanik: 4 })];
  assert.deepEqual(sortRecipes(list, 'rating').map((r) => r.title), ['C', 'B', 'A']);
  assert.deepEqual(sortRecipes(list, 'alpha').map((r) => r.title), ['A', 'B', 'C']);
  assert.equal(averageRating(list[2]), 4.5);
  assert.deepEqual(splitLines('- 200 g Mehl\n\n1. Eier\n• Salz'), ['200 g Mehl', 'Eier', 'Salz']);
});

test('KI-Antwort säubern', () => {
  const r = sanitizeImport({ isRecipe: true, title: ' Gnocchi ', servings: '2 Portionen', ingredients: ['500 g Gnocchi', ''], steps: ['1. Gnocchi anbraten'], notes: '', video: '', source: '' });
  assert.equal(r.title, 'Gnocchi');
  assert.deepEqual(r.ingredients, ['500 g Gnocchi']);
  assert.deepEqual(r.steps, ['Gnocchi anbraten']);
  assert.equal(r.notes, '2 Portionen');
  assert.throws(() => sanitizeImport({ isRecipe: false }));
});

test('Gemini: Schlüsselrotation bei 429', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const key = init.headers['x-goog-api-key'];
    calls.push(`${key}@${url.split('/models/')[1].split(':')[0]}`);
    if (key === 'AIzaERSTER') {
      return new Response(JSON.stringify({ error: { message: 'Quota exceeded', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } }), { status: 429 });
    }
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }] }), { status: 200 });
  };
  const out = await generateJson({ keys: ['AIzaERSTER', 'AIzaZWEITER'], models: ['gemini-3.5-flash-lite', 'gemini-3.8-flash'], prompt: 'x' });
  assert.deepEqual(out, { ok: true });
  assert.deepEqual(calls, ['AIzaERSTER@gemini-3.5-flash-lite', 'AIzaZWEITER@gemini-3.5-flash-lite']);
});

test('Seed: Altbestand vollständig', () => {
  const seed = sanitizeState(JSON.parse(readFileSync(new URL('../resources/data/seed.json', import.meta.url))));
  assert.equal(seed.recipes.length, 64);
  const n = Object.values(seed.plan).reduce((a, d) => a + Object.values(d.slots).reduce((b, l) => b + l.length, 0), 0);
  assert.equal(n, 504);
  assert.equal(seed.shopping.items.length, 15);
});

await Promise.all(pending);
console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(failed ? 1 : 0);
