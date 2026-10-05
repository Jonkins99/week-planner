// Brick-Kombinationen: aus den eingefrorenen LEGO-Bricks vollständige Mahlzeiten bauen.
// Hier zählt Geschmack und Kombinatorik, nicht nur Extraktion — deshalb startet die
// Kette bei Gemini 3.8 Flash und lässt die Lite-Modelle ganz weg.

import { modelChain, schemaOf, S } from './gemini.mjs';
import { isBrick, placeOf } from './pantry.mjs';

export const BRICK_MODEL = 'gemini-3.8-flash';
export const brickModels = () => modelChain(BRICK_MODEL, { lite: false });

export const BRICK_SYSTEM = `Du bist ein kreativer, bodenständiger Koch und planst schnelle Mahlzeiten aus eingefrorenen Portionen („LEGO-Bricks").
Es gibt zwei Arten: ganze Gerichte und Komponenten (z. B. Reis, Bolognese, Hähnchen, Gemüse, Saucen).
Schlage genau 5 vollständige, geschmacklich stimmige Mahlzeiten vor. Jede nutzt 2 oder 3 verschiedene Bricks aus der Liste.
Regeln:
- Verwende nur Bricks aus der Liste, mit exakt dem angegebenen Namen, und nie mehr Stück als vorrätig.
- Eine Mahlzeit soll satt machen und ausgewogen sein (Sättigungsbeilage, Protein, Gemüse oder Sauce).
- Variiere über die 5 Vorschläge hinweg; jeder Vorschlag soll anders schmecken.
- title: kurzer, appetitlicher Name. tip: ein Satz, was frisch dazu passt oder wie man es kombiniert (z. B. „Mit Frühlingszwiebeln und Sojasauce verfeinern").`;

export const BRICK_SCHEMA = schemaOf({
  meals: S.array(S.object({
    title: S.string('Name der Mahlzeit'),
    bricks: S.array(S.object({ name: S.string('Brick-Name wie in der Liste'), count: S.number('Stück') }, ['name', 'count']), '2 bis 3 Bricks'),
    tip: S.string('Ein Satz Tipp'),
  }, ['title', 'bricks', 'tip']), 'Genau 5 Mahlzeiten'),
}, ['meals']);

export function brickPrompt(items) {
  const lines = items.filter((it) => isBrick(it) && it.qty > 0)
    .map((it) => `- ${it.name} (${placeOf(it.place).label}, ${it.qty} Stück)`);
  return `Vorrätige Bricks:\n${lines.join('\n')}`;
}

export function readBrickMeals(data, items) {
  const names = new Map(items.filter(isBrick).map((it) => [it.name.toLowerCase(), it]));
  return (Array.isArray(data?.meals) ? data.meals : [])
    .map((m) => ({
      title: String(m?.title || '').trim(),
      tip: String(m?.tip || '').trim(),
      bricks: (Array.isArray(m?.bricks) ? m.bricks : [])
        .map((b) => ({ item: names.get(String(b?.name || '').toLowerCase().trim()), count: Math.max(1, Math.round(Number(b?.count) || 1)) }))
        .filter((b) => b.item),
    }))
    .filter((m) => m.title && m.bricks.length >= 2)
    .slice(0, 5);
}
