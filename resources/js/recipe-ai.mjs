// KI-Import: aus einem eingefügten Rezepttext (Reel-Beschreibung, Website, Chat)
// einen strukturierten Datensatz machen.
//
// Modellwahl: Die Aufgabe ist reine Extraktion mit festem Antwortschema plus leichtes
// Kürzen der Arbeitsschritte, kein kreatives Schreiben. Das liegt klar im Können der
// Lite-Modelle; Gemini 3.5 Flash Lite ist deshalb erste Wahl (schnell, ~500 Anfragen
// am Tag im freien Kontingent). Ist es überlastet oder erschöpft, läuft dieselbe Kette
// wie in der jhdl: die vollwertigen Flash-Modelle, danach die übrige Lite-Reserve.

import { modelChain, schemaOf, S } from './gemini.mjs';
import { clampRating } from './model.mjs';

export const IMPORT_MODEL = 'gemini-3.5-flash-lite';
export const importModels = () => modelChain(IMPORT_MODEL);

export const SYSTEM = `Du bist ein präziser Rezept-Redakteur für ein privates Kochbuch eines routinierten Hobbykoch-Paares.
Du bekommst einen unsortierten Text (z. B. Instagram-Beschreibung, Website-Kopie, Chat-Nachricht) und machst daraus ein sauberes Rezept auf Deutsch.

Regeln:
- title: kurzer, natürlicher Gerichtname ohne Emojis, Hashtags oder Werbefloskeln („Cremige Gnocchi-Pfanne mit Spinat"). Erfinde nichts, was nicht im Text steht.
- ingredients: eine Zutat pro Eintrag, Menge zuerst, Einheiten abgekürzt („200 g Mehl", „1 EL Olivenöl", „2 Knoblauchzehen", „Salz, Pfeffer"). Gruppiere nicht, keine Überschriften. Übersetze fremdsprachige Zutaten ins Deutsche.
- steps: knappe Stichpunkte im Infinitiv, so kurz wie möglich, ohne Erklärungen für Selbstverständliches. Schreibe „Karotten anbraten", nicht „Brate die Karotten an, indem du …". Mehrere triviale Handgriffe dürfen in einem Stichpunkt stehen („Zwiebel würfeln, glasig dünsten"). Temperaturen, Garzeiten und wichtige Kniffe bleiben erhalten („Im Airfryer 12 Min. bei 200 °C").
- servings: Portionsangabe, falls im Text vorhanden („2 Portionen"), sonst leerer String.
- notes: nur wirklich hilfreiche Zusatzinfos aus dem Text (Nährwerte, Varianten, Tipps) in ein bis drei kurzen Zeilen, sonst leerer String.
- video: eine Instagram- oder YouTube-Adresse, falls im Text enthalten, sonst leerer String.
- source: eine sonstige Quell-Adresse (Website), falls enthalten, sonst leerer String.
- isRecipe: false, wenn der Text gar kein Rezept enthält.`;

export const SCHEMA = schemaOf({
  isRecipe: S.bool('Enthält der Text ein Rezept?'),
  title: S.string('Name des Gerichts'),
  servings: S.string('Portionen oder leer'),
  ingredients: S.array(S.string('Eine Zutat mit Menge'), 'Zutatenliste'),
  steps: S.array(S.string('Ein knapper Arbeitsschritt'), 'Zubereitung in Stichpunkten'),
  notes: S.string('Kurze Zusatzinfos oder leer'),
  video: S.string('Instagram-/YouTube-Adresse oder leer'),
  source: S.string('Quell-Adresse oder leer'),
}, ['isRecipe', 'title', 'servings', 'ingredients', 'steps', 'notes', 'video', 'source']);

export function buildPrompt(text) {
  return `Text:\n"""\n${String(text || '').trim().slice(0, 20000)}\n"""`;
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** Modellantwort säubern; wirft, wenn kein Rezept erkennbar ist. */
export function sanitizeImport(data) {
  if (!data || data.isRecipe === false) throw new Error('Im Text wurde kein Rezept gefunden.');
  const title = clean(data.title);
  if (!title) throw new Error('Die KI hat keinen Titel erkannt.');
  const list = (v) => (Array.isArray(v) ? v : []).map(clean).filter(Boolean);
  const notes = [clean(data.servings), String(data.notes || '').trim()].filter(Boolean).join('\n');
  return {
    title,
    ingredients: list(data.ingredients),
    steps: list(data.steps).map((s) => s.replace(/^\d+[.)]\s*/, '')),
    notes,
    video: clean(data.video),
    source: clean(data.source),
  };
}

export const acceptImport = (data) => !!data && (data.isRecipe === false || !!clean(data.title));

