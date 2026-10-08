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
import { readVoice, voiceSchema, NO_STORE } from '../resources/js/shopping-ai.mjs';
import { addPantryItem, pantryTree, emptyPantry } from '../resources/js/pantry.mjs';
import { readBrickMeals, brickSchema } from '../resources/js/pantry-ai.mjs';
import { buildBackupZip, readBackupFile } from '../resources/js/backup.mjs';
import { checkPassword } from '../resources/js/auth.mjs';
import { updateEntry, emptyState, isOrder, addRestaurant } from '../resources/js/model.mjs';
import { suggestDinners, cookHistory, ingredientName, pantryMatch, similarRecipes, previousDinner } from '../resources/js/suggest.mjs';
import { periodOf, shiftPeriod, computeStats, compareStats, fmtDiff } from '../resources/js/stats.mjs';
import { setRecurring, applyRecurring, nextWeekday } from '../resources/js/shopping.mjs';
import { belowMin, placeForProduct, sanitizePantry } from '../resources/js/pantry.mjs';
import { eveningKey, markDue, advance, seekAcross, scrubFactor, sortTracks } from '../resources/js/hp.mjs';
import { NUTRI_SCHEMA, readNutrition, periodDishes } from '../resources/js/nutrition-ai.mjs';

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


  // Überlastung (503) liegt am Modell: nicht den zweiten Schlüssel quälen, sondern weiter.
  calls.length = 0;
  const ok = new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }] }), { status: 200 });
  globalThis.fetch = async (url, init) => {
    const model = url.match(/models\/([^:]+)/)[1];
    calls.push(`${init.headers['x-goog-api-key']}@${model}`);
    if (model === 'gemini-3.5-flash-lite') return new Response(JSON.stringify({ error: { message: 'overloaded' } }), { status: 503 });
    return ok.clone();
  };
  await generateJson({ keys: ['AIzaA', 'AIzaB'], models: ['gemini-3.5-flash-lite', 'gemini-3.8-flash'], prompt: 'x' });
  assert.deepEqual(calls, ['AIzaA@gemini-3.5-flash-lite', 'AIzaA@gemini-3.8-flash']);

  // Ein 400er ohne Schema-Bezug hängt am Schlüssel: nächster Schlüssel, gleiches Modell.
  calls.length = 0;
  globalThis.fetch = async (url, init) => {
    const key = init.headers['x-goog-api-key'];
    calls.push(key);
    if (key === 'AIzaA') return new Response(JSON.stringify({ error: { message: 'Billing not enabled', status: 'FAILED_PRECONDITION' } }), { status: 400 });
    return ok.clone();
  };
  await generateJson({ keys: ['AIzaA', 'AIzaB'], models: ['gemini-3.5-flash-lite'], prompt: 'x' });
  assert.deepEqual(calls, ['AIzaA', 'AIzaB']);

  // Hängt ein Modell, greift der Zeitdeckel und das nächste Modell übernimmt.
  calls.length = 0;
  globalThis.fetch = (url, init) => {
    const model = url.match(/models\/([^:]+)/)[1];
    calls.push(model);
    if (model === 'gemini-3.8-flash') return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' }))));
    return Promise.resolve(ok.clone());
  };
  await generateJson({ keys: ['AIzaA'], models: ['gemini-3.8-flash', 'gemini-3.7-flash'], prompt: 'x', timeoutMs: 50 });
  assert.deepEqual(calls, ['gemini-3.8-flash', 'gemini-3.7-flash']);
});

test('Gemini-Schemas: keine leeren Enum-Werte', () => {
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node.enum)) assert.ok(node.enum.length && node.enum.every((v) => String(v).length), JSON.stringify(node.enum));
    Object.values(node).forEach(walk);
  };
  walk(voiceSchema(['Lidl', 'Edeka']));
  walk(voiceSchema([]));
  walk(brickSchema([{ name: 'Reis', qty: 2, place: 'freezer/bricks/component' }]));
  walk(NUTRI_SCHEMA);
  assert.equal(readVoice({ items: [{ name: 'Milch', quantity: 0, store: NO_STORE, dept: 'Kühlung' }] })[0].store, '');
});

test('Seed: Altbestand vollständig', () => {
  const seed = sanitizeState(JSON.parse(readFileSync(new URL('../resources/data/seed.json', import.meta.url))));
  assert.equal(seed.recipes.length, 64);
  const n = Object.values(seed.plan).reduce((a, d) => a + Object.values(d.slots).reduce((b, l) => b + l.length, 0), 0);
  assert.equal(n, 504);
  assert.equal(seed.shopping.items.length, 15);
});

test('Rest von gestern und Bestellung', () => {
  const plan = {};
  addEntry(plan, '2026-10-06', 'dinner', { title: 'Lasagne' });
  const rest = addEntry(plan, '2026-10-07', 'lunch', { title: 'Rest von gestern Abend', leftover: true });
  assert.equal(previousDinner(plan, '2026-10-07')[0].title, 'Lasagne');
  const restaurants = [];
  const r = addRestaurant(restaurants, 'Pizzeria Roma');
  assert.equal(addRestaurant(restaurants, 'pizzeria roma'), r);
  const o = addEntry(plan, '2026-10-07', 'dinner', { title: 'Bestellt', order: { rid: r.id, amount: '23,5', instead: 'Curry' } });
  assert.equal(o.order.amount, 23.5);
  assert.ok(isOrder(o) && isOrder({ title: 'Bestellen' }) && !isOrder({ title: 'Bestellen', recipeId: 'x' }));
  const s = sanitizeState({ plan, restaurants });
  assert.equal(s.plan['2026-10-07'].slots.lunch[0].leftover, true);
  assert.equal(s.plan['2026-10-07'].slots.dinner[0].order.rid, r.id);
  assert.equal(s.restaurants.length, 1);
  updateEntry(plan, '2026-10-07', 'lunch', rest.id, { leftover: false });
  assert.equal(plan['2026-10-07'].slots.lunch[0].leftover, undefined);
});

test('Statistik: Zeiträume, Quote, Erstmals, Vergleich', () => {
  assert.equal(periodOf('month', '2026-10-08').start, '2026-10-01');
  assert.equal(periodOf('month', '2026-02-10').end, '2026-02-28');
  assert.equal(shiftPeriod('month', '2026-01-15', -1), '2025-12-01');
  assert.equal(periodOf('week', '2026-10-08').start, '2026-10-05');
  assert.equal(shiftPeriod('year', '2026-05-01', 1), '2027-01-01');
  const recipes = [newRecipe({ id: 'r1', title: 'Curry', ratingElika: 5, ratingJanik: 4 })];
  const plan = {};
  addEntry(plan, '2026-08-20', 'dinner', { title: 'Curry', recipeId: 'r1' });
  addEntry(plan, '2026-09-02', 'dinner', { title: 'Curry', recipeId: 'r1' });
  addEntry(plan, '2026-09-03', 'dinner', { title: 'Bestellt', order: { rid: 'o1', amount: 30 } });
  addEntry(plan, '2026-09-04', 'dinner', { title: 'Bestellen' });
  addEntry(plan, '2026-09-05', 'dinner', { title: 'Neues Gericht' });
  addEntry(plan, '2026-09-06', 'lunch', { title: 'Rest', leftover: true });
  const st = computeStats({ plan, recipes, restaurants: [{ id: 'o1', name: 'Roma' }] }, periodOf('month', '2026-09-01'), { today: '2026-10-08' });
  assert.equal(st.dinnerDays, 4);
  assert.equal(st.orderDays, 2);
  assert.equal(st.orderRate, 0.5);
  assert.equal(st.spend, 30);
  assert.equal(st.restaurants[0].name, 'Roma');
  assert.equal(st.meals, 2);
  assert.deepEqual(st.firsts.map((f) => f.title), ['Neues Gericht']);
  const prev = computeStats({ plan, recipes }, periodOf('month', '2026-08-01'), { today: '2026-10-08' });
  const cmp = compareStats(st, prev);
  assert.equal(cmp.find((r) => r.key === 'orderRate').dir, 'up');
  assert.equal(fmtDiff(cmp.find((r) => r.key === 'spend')), '+30,00 €');
});

test('Vorschläge, Kochhistorie, Zutaten, Dubletten', () => {
  const recipes = ['Curry', 'Lasagne', 'Pizza', 'Chili sin Carne'].map((t, i) => newRecipe({ id: `r${i}`, title: t, ratingElika: 5 - i }));
  const plan = {};
  addEntry(plan, '2026-10-07', 'dinner', { title: 'Curry', recipeId: 'r0' });
  addEntry(plan, '2026-10-01', 'dinner', { title: 'Pizza', recipeId: 'r2' });
  addEntry(plan, '2026-10-12', 'dinner', { title: 'Pizza', recipeId: 'r2' });
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const list = suggestDinners({ recipes, plan, iso: '2026-10-09', today: '2026-10-08', random });
  assert.ok(!list.some((x) => x.recipeId === 'r0'), 'kürzlich gekocht fällt weg');
  assert.ok(list.length >= 2 && list.length <= 10);
  const h = cookHistory(plan, 'r2', '2026-10-08');
  assert.deepEqual([h.count, h.last, h.next, h.daysSince], [1, '2026-10-01', '2026-10-12', 7]);
  assert.equal(ingredientName('200 g Spaghetti (Vollkorn)'), 'Spaghetti');
  assert.equal(ingredientName('2 EL Olivenöl'), 'Olivenöl');
  assert.equal(ingredientName('1 Zwiebel, gewürfelt'), 'Zwiebel');
  assert.equal(ingredientName('Salz, Pfeffer'), 'Salz, Pfeffer');
  const pantry = [{ name: 'Reis', qty: 2, place: 'dry' }, { name: 'Kokosmilch', qty: 0, place: 'dry' }];
  assert.equal(pantryMatch('250 g Basmati-Reis', pantry)?.name, 'Reis');
  assert.equal(pantryMatch('1 Dose Kokosmilch', pantry), null);
  assert.equal(similarRecipes(recipes, 'chili sin carne')[0].recipe.id, 'r3');
  assert.equal(similarRecipes(recipes, 'Gemüsepfanne').length, 0);
});

test('Einkauf: Wiederholung, verfügbar ab; Vorrat: Mindestbestand', () => {
  const sh = emptyShopping();
  const { item } = addItem(sh, { name: 'Kaffee', store: 'aldi' });
  setRecurring(sh, item, 2, '2026-10-08');
  assert.equal(sh.recurring[0].next, '2026-10-22');
  sh.items = [];
  assert.deepEqual(applyRecurring(sh, '2026-10-21'), []);
  assert.deepEqual(applyRecurring(sh, '2026-10-22'), ['Kaffee']);
  assert.equal(sh.items[0].store, 'aldi');
  assert.equal(sh.recurring[0].next, '2026-11-05');
  assert.deepEqual(applyRecurring(sh, '2026-11-06'), []);
  assert.equal(sanitizeShopping(JSON.parse(JSON.stringify(sh))).recurring[0].weeks, 2);
  assert.equal(nextWeekday('2026-10-08', 3), '2026-10-08');
  assert.equal(nextWeekday('2026-10-08', 0), '2026-10-12');
  assert.ok(belowMin({ qty: 1, min: 2 }) && !belowMin({ qty: 2, min: 2 }) && !belowMin({ qty: 0 }));
  assert.equal(sanitizePantry({ items: [{ name: 'Reis', qty: 1, min: 3 }] }).items[0].min, 3);
  assert.equal(placeForProduct({ items: [] }, 'Erbsen', 'frozen'), 'freezer/other');
});

test('Hörbuch: Abend-Startpunkt, Weiterschalten, Spulen', () => {
  assert.equal(eveningKey(new Date(2026, 9, 8, 21, 30).getTime()), '2026-10-08');
  assert.equal(eveningKey(new Date(2026, 9, 9, 1, 10).getTime()), '2026-10-08');
  assert.equal(eveningKey(new Date(2026, 9, 9, 14, 0).getTime()), null);
  const mark = { evening: '2026-10-08', applied: false };
  assert.ok(!markDue(mark, new Date(2026, 9, 9, 2, 0).getTime()));
  assert.ok(markDue(mark, new Date(2026, 9, 9, 7, 0).getTime()));
  const counts = { 1: 2, 2: 0, 3: 1, 4: 0, 5: 0, 6: 0, 7: 1 };
  assert.deepEqual(advance(counts, { book: 1, track: 0 }), { book: 1, track: 1, time: 0 });
  assert.deepEqual(advance(counts, { book: 1, track: 1 }), { book: 3, track: 0, time: 0 });
  assert.deepEqual(advance(counts, { book: 7, track: 0 }), { book: 1, track: 0, time: 0 });
  const dur = { 1: { 0: 600, 1: 600 } };
  assert.deepEqual(seekAcross(dur, counts, { book: 1, track: 0, time: 500 }, 300), { book: 1, track: 1, time: 200 });
  assert.deepEqual(seekAcross(dur, counts, { book: 1, track: 1, time: 60 }, -120), { book: 1, track: 0, time: 540 });
  assert.equal(scrubFactor(0).factor, 1);
  assert.ok(scrubFactor(250).factor < 0.25);
  assert.deepEqual(sortTracks([{ name: 'Kap 10.mp3' }, { name: 'Kap 2.mp3' }]).map((t) => t.name), ['Kap 2.mp3', 'Kap 10.mp3']);
});

test('Nährwerte: Gerichte je Mahlzeit, Antwort säubern', () => {
  const plan = {};
  addEntry(plan, '2026-09-01', 'dinner', { title: 'Curry' });
  addEntry(plan, '2026-09-02', 'dinner', { title: 'Curry' });
  addEntry(plan, '2026-09-02', 'breakfast', { title: 'Müsli' });
  const d = periodDishes(plan, [], { start: '2026-09-01', end: '2026-09-30' });
  assert.equal(d.dinner[0].count, 2);
  const n = readNutrition({ meals: [{ meal: 'dinner', values: { kcal: 650.4, protein: 30, carbs: 70, fat: 20, fiber: 8 } }], overall: { kcal: 500 }, comment: 'Gut.' });
  assert.equal(n.meals[0].kcal, 650);
  assert.equal(n.meals[0].label, 'Abendessen');
  assert.equal(n.overall.kcal, 500);
});

await Promise.all(pending);
console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(failed ? 1 : 0);
