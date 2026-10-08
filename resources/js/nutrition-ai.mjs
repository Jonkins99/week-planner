// Nährwert-Schätzung für einen Zeitraum: Gemini schätzt aus den eingetragenen Gerichten
// (bei Rezepten mit Zutaten) Durchschnittswerte je Mahlzeit. Es geht um eine grobe
// Orientierung, nicht um Genauigkeit — daher volle Modellkette inklusive Lite-Reserve.

import { modelChain, schemaOf, S } from './gemini.mjs';
import { isOrder } from './model.mjs';
import { dishKey } from './suggest.mjs';

export const NUTRI_MODEL = 'gemini-3.8-flash';
export const nutriModels = () => modelChain(NUTRI_MODEL);

export const NUTRI_SYSTEM = `Du bist Ernährungsberater und schätzt Nährwerte von Hausmannskost realistisch für eine erwachsene Portion.
Du bekommst die Gerichte eines Zeitraums, getrennt nach Mahlzeit, mit Häufigkeit und (falls vorhanden) Zutaten.
Schätze für jede Mahlzeitart den Durchschnitt pro Mahlzeit (eine Portion) und zusätzlich den Durchschnitt über alle Mahlzeiten.
Bestellte Gerichte sind als „Bestellt" markiert: rechne dafür mit typischem Lieferessen.
Werte: kcal, Eiweiß (g), Kohlenhydrate (g), Fett (g), Ballaststoffe (g), jeweils als ganze Zahlen.
comment: ein bis zwei kurze, freundliche Sätze zur Ausgewogenheit auf Deutsch (ohne Belehrung).`;

const values = () => S.object({
  kcal: S.number('Kilokalorien'),
  protein: S.number('Eiweiß in g'),
  carbs: S.number('Kohlenhydrate in g'),
  fat: S.number('Fett in g'),
  fiber: S.number('Ballaststoffe in g'),
}, ['kcal', 'protein', 'carbs', 'fat', 'fiber']);

export const NUTRI_SCHEMA = schemaOf({
  meals: S.array(S.object({
    meal: S.enum(['breakfast', 'lunch', 'dinner', 'extra'], 'Mahlzeitart'),
    values: values(),
  }, ['meal', 'values']), 'Je Mahlzeitart'),
  overall: values(),
  comment: S.string('Kurzer Kommentar'),
}, ['meals', 'overall', 'comment']);

const LABEL = { breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen', extra: 'Zusätzliche Mahlzeiten' };

/** Gerichte eines Zeitraums nach Mahlzeit gruppiert: { breakfast: [{ title, count, ingredients }] … } */
export function periodDishes(plan, recipes, { start, end }, titleOf = (e) => e.title) {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const out = {};
  for (const [iso, day] of Object.entries(plan)) {
    if (iso < start || iso > end) continue;
    for (const [slot, list] of Object.entries(day.slots || {})) {
      const meal = ['breakfast', 'lunch', 'dinner'].includes(slot) ? slot : 'extra';
      for (const e of list) {
        const order = isOrder(e);
        const key = order ? 'order' : dishKey(e);
        const group = (out[meal] ||= new Map());
        const cur = group.get(key) || {
          title: order ? 'Bestellt (Lieferessen)' : titleOf(e, iso),
          count: 0,
          ingredients: !order && e.recipeId ? (byId.get(e.recipeId)?.ingredients || []).slice(0, 14) : [],
        };
        cur.count++;
        group.set(key, cur);
      }
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, m]) => [k, [...m.values()]]));
}

export function nutriSignature(dishes) {
  return Object.entries(dishes).map(([k, list]) => `${k}:${list.map((d) => `${d.title}×${d.count}`).join(',')}`).join('|');
}

export function nutriPrompt(dishes) {
  const parts = [];
  for (const [meal, list] of Object.entries(dishes)) {
    if (!list.length) continue;
    parts.push(`## ${LABEL[meal]}`);
    for (const d of list.slice(0, 60)) {
      parts.push(`- ${d.title} (${d.count}×)${d.ingredients.length ? `: ${d.ingredients.join('; ')}` : ''}`);
    }
  }
  return parts.join('\n').slice(0, 24000);
}

const num = (v) => Math.max(0, Math.round(Number(v) || 0));
const clean = (v) => ({ kcal: num(v?.kcal), protein: num(v?.protein), carbs: num(v?.carbs), fat: num(v?.fat), fiber: num(v?.fiber) });

export function readNutrition(data) {
  const meals = (Array.isArray(data?.meals) ? data.meals : [])
    .filter((m) => LABEL[m?.meal])
    .map((m) => ({ meal: m.meal, label: LABEL[m.meal], ...clean(m.values) }))
    .filter((m) => m.kcal > 0);
  const order = ['breakfast', 'lunch', 'dinner', 'extra'];
  meals.sort((a, b) => order.indexOf(a.meal) - order.indexOf(b.meal));
  return { meals, overall: clean(data?.overall), comment: String(data?.comment || '').trim() };
}

export const acceptNutrition = (data) => num(data?.overall?.kcal) > 0;
