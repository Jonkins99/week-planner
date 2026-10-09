// Aquarium-Helfer: KI-Steckbriefe für Tiere und Pflanzen und Maßnahmen-Vorschläge.
// Steckbriefe sind Wissensabfragen: Kette ab Gemini 3.8 Flash, Lite nur als Reserve.
// Maßnahmen brauchen Abwägung: Kette ohne Lite-Modelle.

import { modelChain, schemaOf, S } from '../gemini.mjs';
import { PARAMS, PARAM, fmtRange, fmtWithUnit, co2FromPhKh } from './aqua.mjs';

export const profileModels = () => modelChain('gemini-3.8-flash');
export const adviceModels = () => modelChain('gemini-3.8-flash', { lite: false });

export const KINDS = ['Fisch', 'Garnele', 'Schnecke', 'Krebs', 'Pflanze', 'Moos', 'Sonstiges'];

const range = (what) => S.object({ min: S.number(`${what} min`), max: S.number(`${what} max`) }, ['min', 'max'], what);

export const PROFILE_SYSTEM = `Du bist ein erfahrener Aquarianer und schreibst Steckbriefe für Tiere und Pflanzen im Süßwasser-Aquarium.
Erkenne die gemeinte Art auch bei Umgangssprache, Tippfehlern oder Handelsnamen (z. B. „Neons" = Paracheirodon innesi, „Amanos" = Caridina multidentata).
Schreibe auf Deutsch, sachlich, konkret und praxisnah. Zahlen als Zahlen (Dezimalpunkt). Keine Erfindungen: Wenn etwas unbekannt ist, gib einen typischen, vorsichtigen Bereich an und sage das im Text.
Bei Pflanzen: temp/ph/gh/kh als verträgliche Bereiche, Felder zu Verhalten und Gruppengröße knapp mit „–".
care: 4 bis 7 konkrete Punkte, wie es der Art gut geht. warning: 2 bis 5 Anzeichen, dass es ihr nicht gut geht, jeweils mit Ursache.`;

export const PROFILE_SCHEMA = schemaOf({
  kind: S.enum(KINDS, 'Art der Lebewesen'),
  commonName: S.string('Gängiger deutscher Name'),
  scientificName: S.string('Wissenschaftlicher Name'),
  origin: S.string('Herkunft/Verbreitung'),
  summary: S.string('Zwei bis drei Sätze Überblick'),
  size: S.string('Endgröße, z. B. „3–4 cm" oder bei Pflanzen Wuchshöhe'),
  lifespan: S.string('Lebenserwartung (bei Pflanzen „–")'),
  difficulty: S.enum(['leicht', 'mittel', 'anspruchsvoll'], 'Pflegeaufwand'),
  temp: range('Temperatur °C'),
  ph: range('pH'),
  gh: range('GH °dH'),
  kh: range('KH °dH'),
  minLiters: S.number('Mindestbeckengröße in Litern (Pflanzen: 0)'),
  group: S.string('Gruppengröße/Vergesellschaftung, z. B. „ab 10 Tiere"'),
  behavior: S.string('Verhalten, Schwimmzone, Temperament'),
  compatibility: S.string('Mit wem verträglich, wen meiden'),
  diet: S.string('Ernährung und Fütterungstipps (Pflanzen: Nährstoffbedarf)'),
  light: S.string('Licht (für Pflanzen wichtig, sonst Vorliebe)'),
  co2: S.string('CO₂-Bedarf (Pflanzen) bzw. Empfindlichkeit (Tiere)'),
  placement: S.string('Pflanzen: Platzierung/Wuchs; Tiere: Einrichtung, Verstecke'),
  breeding: S.string('Vermehrung kurz'),
  care: S.array(S.string(), 'So geht es ihr gut: 4–7 Punkte'),
  warning: S.array(S.string(), 'Warnzeichen mit Ursache: 2–5 Punkte'),
}, ['kind', 'commonName', 'scientificName', 'summary', 'difficulty', 'temp', 'ph', 'gh', 'kh', 'care', 'warning']);

export function profilePrompt(name, tank) {
  return `Steckbrief für: „${name}"\nBecken: ${tank.name}${tank.liters ? `, ${tank.liters} Liter` : ''}.`;
}

const cleanRange = (r) => {
  const min = Number(r?.min);
  const max = Number(r?.max);
  return Number.isFinite(min) && Number.isFinite(max) ? { min: Math.min(min, max), max: Math.max(min, max) } : null;
};
const str = (v) => String(v ?? '').trim();
const list = (v) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

export function readProfile(data) {
  if (!data || !str(data.scientificName || data.commonName)) return null;
  return {
    kind: KINDS.includes(data.kind) ? data.kind : 'Sonstiges',
    commonName: str(data.commonName),
    scientificName: str(data.scientificName),
    origin: str(data.origin),
    summary: str(data.summary),
    size: str(data.size),
    lifespan: str(data.lifespan),
    difficulty: ['leicht', 'mittel', 'anspruchsvoll'].includes(data.difficulty) ? data.difficulty : 'mittel',
    temp: cleanRange(data.temp),
    ph: cleanRange(data.ph),
    gh: cleanRange(data.gh),
    kh: cleanRange(data.kh),
    minLiters: Math.max(0, Math.round(Number(data.minLiters) || 0)),
    group: str(data.group),
    behavior: str(data.behavior),
    compatibility: str(data.compatibility),
    diet: str(data.diet),
    light: str(data.light),
    co2: str(data.co2),
    placement: str(data.placement),
    breeding: str(data.breeding),
    care: list(data.care),
    warning: list(data.warning),
  };
}

export const ADVICE_SYSTEM = `Du bist ein erfahrener, ruhiger Aquaristik-Berater. Du bekommst Zielwerte, die letzten Messungen, den Besatz und erkannte Schieflagen eines Süßwasserbeckens.
Leite daraus konkrete, priorisierte Maßnahmen ab. Jede Maßnahme ist ein klarer Handgriff (was, wie viel, wann), keine Allgemeinplätze.
Beachte Zusammenhänge (pH–KH–CO₂, NO₃ und Wasserwechsel, Temperatur und Sauerstoff) und die Bedürfnisse des Besatzes.
Wenn alles im grünen Bereich ist, sag das deutlich und schlage höchstens 1–2 Pflegepunkte vor. Deutsch, knapp.`;

export const ADVICE_SCHEMA = schemaOf({
  summary: S.string('Ein bis zwei Sätze Gesamteinschätzung'),
  actions: S.array(S.object({
    title: S.string('Maßnahme, kurz'),
    detail: S.string('Wie genau, ein bis zwei Sätze'),
    urgency: S.enum(['sofort', 'bald', 'beobachten'], 'Dringlichkeit'),
  }, ['title', 'detail', 'urgency']), '1 bis 6 Maßnahmen, wichtigste zuerst'),
}, ['summary', 'actions']);

const fmtDate = (ts) => new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

export function advicePrompt(tank, measurements, issues, waterChanges) {
  const targets = PARAMS.map((p) => `- ${p.label}: ${fmtRange(p.key, tank.targets[p.key])}`).join('\n');
  const rows = measurements.slice(-12).map((m) => {
    const vals = PARAMS.filter((p) => m.values[p.key] != null).map((p) => `${p.label} ${fmtWithUnit(p.key, m.values[p.key])}`).join(', ');
    const calc = m.values.co2 == null ? co2FromPhKh(m.values.ph, m.values.kh) : null;
    const phase = m.phase === 'before' ? ' [vor Wasserwechsel]' : m.phase === 'after' ? ' [nach Wasserwechsel]' : '';
    return `- ${fmtDate(m.at)}${phase}: ${vals || '–'}${calc != null ? ` (CO₂ rechnerisch ≈ ${calc} mg/l)` : ''}${m.note ? ` – Notiz: ${m.note}` : ''}`;
  }).join('\n');
  const stock = tank.stock.map((s) => `- ${s.qty}× ${s.profile?.commonName || s.name}${s.profile?.scientificName ? ` (${s.profile.scientificName})` : ''}`).join('\n');
  const wc = waterChanges.slice(-5).map((w) => fmtDate(w.at)).join(', ');
  return `Becken: ${tank.name}${tank.liters ? `, ${tank.liters} Liter` : ''}. Wasserwechsel-Rhythmus: alle ${tank.wc.every} Tage. Letzte Wechsel: ${wc || 'unbekannt'}.
Zielwerte:
${targets}
Messungen (älteste zuerst):
${rows || '- keine'}
Besatz:
${stock || '- nicht eingetragen'}
Erkannte Schieflagen:
${issues.map((i) => `- ${i.title}`).join('\n') || '- keine'}`;
}

export function readAdvice(data) {
  const actions = (Array.isArray(data?.actions) ? data.actions : [])
    .map((a) => ({ title: str(a?.title), detail: str(a?.detail), urgency: ['sofort', 'bald', 'beobachten'].includes(a?.urgency) ? a.urgency : 'bald' }))
    .filter((a) => a.title)
    .slice(0, 6);
  const summary = str(data?.summary);
  return summary || actions.length ? { summary, actions, at: Date.now() } : null;
}

export { PARAM };
