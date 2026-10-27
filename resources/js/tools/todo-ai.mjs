// To-do-Liste: Freitext-Wiederholung („jeden zweiten Dienstag um 18 Uhr“) per Gemini in
// einen Cron-Ausdruck übersetzen. Kette wie beim Rezept-Import (ab 3.5 Flash Lite).

import { modelChain, schemaOf, S } from '../gemini.mjs';
import { parseCron } from './todo.mjs';

export const TODO_MODEL = 'gemini-3.5-flash-lite';
export const todoModels = () => modelChain(TODO_MODEL);

export const CRON_SYSTEM = `Du übersetzt deutsche Beschreibungen wiederkehrender Aufgaben in einen Cron-Ausdruck mit 5 Feldern: Minute Stunde Tag-im-Monat Monat Wochentag (0 = Sonntag, 1 = Montag … 6 = Samstag).
Erlaubt: *, Zahlen, Listen (1,15), Bereiche (1-5), Schritte (*/2). Zusätzlich: Wochentag „d#n“ = n-ter Wochentag im Monat (2#1 = erster Dienstag), „dL“ = letzter Wochentag im Monat (5L = letzter Freitag), Tag „L“ = letzter Tag des Monats.
„Alle n Wochen“ lässt sich in Cron nicht ausdrücken: dann den Wochentag in cron setzen und weeks = n (sonst weeks = 1).
Ohne Uhrzeit nimm die vorgegebene Standard-Uhrzeit. Ohne Wochentag bei wöchentlich nimm den Wochentag des Startdatums.
label: kurze deutsche Beschreibung für die Anzeige, z. B. „Jeden 2. Dienstag um 18:00“ oder „Alle 2 Wochen montags um 7:00“.
ok = false nur, wenn der Text gar keine Wiederholung beschreibt.`;

export const CRON_SCHEMA = schemaOf({
  cron: S.string('Cron-Ausdruck mit genau 5 Feldern'),
  weeks: S.number('Nur jede n-te Woche (1 = jede Woche)'),
  label: S.string('Kurze deutsche Beschreibung'),
  ok: S.bool('Beschreibt der Text eine Wiederholung?'),
}, ['cron', 'weeks', 'label', 'ok']);

const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export function cronPrompt(text, start = Date.now()) {
  const d = new Date(start);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `Wiederholung: ${String(text).trim().slice(0, 300)}\nStartdatum: ${WD[d.getDay()]}, ${d.toLocaleDateString('de-DE')}\nStandard-Uhrzeit: ${hm}`;
}

/** Antwort prüfen: { cron, weeks, label } oder null. */
export function readCron(data) {
  if (!data || data.ok === false) return null;
  const cron = String(data.cron || '').trim().replace(/\s+/g, ' ');
  if (!parseCron(cron)) return null;
  return { cron, weeks: Math.max(1, Math.min(8, Math.round(Number(data.weeks) || 1))), label: String(data.label || cron).trim().slice(0, 80) };
}

export const acceptCron = (data) => data?.ok === false || !!readCron(data);
