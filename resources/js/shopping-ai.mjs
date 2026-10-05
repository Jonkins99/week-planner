// KI für die Einkaufsliste: Abteilungen zuordnen und gesprochene Listen verstehen.
// Beides ist Klassifikation bzw. Extraktion mit festem Schema — Gemini 3.5 Flash Lite
// reicht, bei Auslastung greift dieselbe Modellkette wie beim Rezept-Import.

import { modelChain, schemaOf, S } from './gemini.mjs';
import { DEPTS, deptByLabel } from './shopping.mjs';

export const SHOP_MODEL = 'gemini-3.5-flash-lite';
export const shopModels = () => modelChain(SHOP_MODEL);

const DEPT_LABELS = DEPTS.map((d) => d.label);
const DEPT_RULES = `Abteilungen (genau diese Schreibweise):
- Obst & Gemüse: frisches Obst, Gemüse, Salat, Kräuter, Kartoffeln, Pilze
- Kühlung: Milch, Joghurt, Käse, Butter, Eier, Wurst, frisches Fleisch und Fisch, Tofu, frische Nudeln, Aufstriche aus dem Kühlregal
- TK: alles Tiefgekühlte (TK-Gemüse, Pizza, Eis, Pommes)
- Nährmittel: Nudeln, Reis, Mehl, Zucker, Konserven, Gewürze, Öl, Saucen, Brot, Müsli, Getränke, Kaffee
- Snacks & Süßes: Chips, Schokolade, Süßigkeiten, Kekse, Nüsse
- Haushalt: Putzmittel, Papierwaren, Drogerie, Körperpflege, Tierbedarf
- Sonstiges: alles, was nicht eindeutig passt`;

export const CLASSIFY_SYSTEM = `Du ordnest Einkaufsprodukte aus einem deutschen Supermarkt genau einer Abteilung zu.
${DEPT_RULES}
Antworte für jedes Produkt in derselben Reihenfolge und mit unverändertem Namen.`;

export const CLASSIFY_SCHEMA = schemaOf({
  items: S.array(S.object({ name: S.string('Produktname wie übergeben'), dept: S.enum(DEPT_LABELS, 'Abteilung') }, ['name', 'dept']), 'Zuordnungen'),
}, ['items']);

export function classifyPrompt(names) {
  return `Produkte:\n${names.map((n) => `- ${n}`).join('\n')}`;
}

/** Antwort -> Map normName→deptKey (nur gültige Abteilungen). */
export function readClassification(data) {
  const out = [];
  for (const it of Array.isArray(data?.items) ? data.items : []) {
    const dept = deptByLabel(it?.dept);
    if (it?.name && dept) out.push({ name: String(it.name), dept });
  }
  return out;
}

export function voiceSystem(storeNames) {
  return `Du hörst eine gesprochene Einkaufsliste auf Deutsch (freie Rede, evtl. mit Füllwörtern, Korrekturen und Hinweisen zu Läden).
Mache daraus einzelne Einträge.
- name: Produkt kurz und natürlich, Singular- oder übliche Packungsform, erster Buchstabe groß („Milch", „Bananen", „Tomaten passiert"). Keine Mengen im Namen.
- quantity: Stückzahl oder Packungen als Ganzzahl, wenn genannt („zwei Packungen Butter" -> 2), sonst 0. Gewichte wie „500 Gramm Hack" gehören als Zusatz in den Namen („Hackfleisch 500 g") und quantity bleibt 0.
- store: einer dieser Läden in genau dieser Schreibweise, wenn für das Produkt (oder für eine Gruppe von Produkten) ein Laden genannt wurde, sonst leerer String: ${storeNames.join(', ')}.
- dept: die passende Abteilung.
${DEPT_RULES}
Wird etwas zurückgenommen („nee, doch keine Eier"), lass es weg. Ist nichts Verwertbares zu hören, gib eine leere Liste zurück.`;
}

export function voiceSchema(storeNames) {
  return schemaOf({
    items: S.array(S.object({
      name: S.string('Produkt'),
      quantity: S.number('Anzahl oder 0'),
      store: S.enum(['', ...storeNames], 'Laden oder leer'),
      dept: S.enum(DEPT_LABELS, 'Abteilung'),
    }, ['name', 'quantity', 'store', 'dept']), 'Einträge'),
  }, ['items']);
}

export function readVoice(data) {
  return (Array.isArray(data?.items) ? data.items : [])
    .map((it) => ({
      name: String(it?.name || '').replace(/\s+/g, ' ').trim(),
      qty: Math.max(0, Math.round(Number(it?.quantity) || 0)),
      store: String(it?.store || '').trim(),
      dept: deptByLabel(it?.dept),
    }))
    .filter((it) => it.name);
}
