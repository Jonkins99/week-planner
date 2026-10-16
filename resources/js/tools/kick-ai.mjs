// KI-Einschätzung für den Kicktipp-Helfer: Gemini bekommt je Spiel Form, Torschnitte,
// Tabellenplätze, Quoten und das Poisson-Modell und nennt die drei wahrscheinlichsten
// Ergebnisse mit grober Prozent-Chance. Mehrere Spiele gehen in einer Anfrage raus.

import { modelChain, schemaOf, S } from '../gemini.mjs';
import { LEAGUES, compLabel, fmtAvg, pct } from './kick.mjs';

export const KICK_MODEL = 'gemini-3.8-flash';
export const kickModels = () => modelChain(KICK_MODEL);
export const KICK_BATCH = 10;

export const KICK_SYSTEM = `Du bist ein nüchterner Fußball-Analyst und hilfst beim Tippspiel (Kicktipp).
Du bekommst für mehrere Spiele: Wettbewerb, Heim- und Auswärtsteam, Tabellenplätze, die letzten Pflichtspiele beider Teams (aus Sicht des Teams: S/U/N, eigene Tore zuerst, H = Heim, A = auswärts), Torschnitte, Wettquoten (Wahrscheinlichkeiten ohne Marge) und ein Poisson-Modell.
Schätze für jedes Spiel die drei wahrscheinlichsten Endergebnisse nach 90 Minuten mit ungefährer Wahrscheinlichkeit in Prozent (ganze Zahlen, realistisch: einzelne Ergebnisse liegen fast immer zwischen 5 und 20 Prozent).
Die Quoten sind die beste Grundlage; weiche nur ab, wenn Form, Torschnitte oder die Lage (Pokal, Rotation, Auswärtsschwäche) klar dafür sprechen. Dein eigenes Wissen über Kader und Verletzungen darfst du vorsichtig einbeziehen.
note: ein kurzer deutscher Satz (höchstens 70 Zeichen) mit dem wichtigsten Grund, ohne Floskeln.
Gib für jedes Spiel genau die id aus der Eingabe zurück.`;

export const KICK_SCHEMA = schemaOf({
  matches: S.array(S.object({
    id: S.string('id des Spiels aus der Eingabe'),
    tips: S.array(S.object({
      home: S.number('Tore Heimteam'),
      away: S.number('Tore Auswärtsteam'),
      percent: S.number('Wahrscheinlichkeit in Prozent'),
    }, ['home', 'away', 'percent']), 'Genau drei Ergebnisse, wahrscheinlichstes zuerst'),
    note: S.string('Kurzer Grund, höchstens 70 Zeichen'),
  }, ['id', 'tips', 'note']), 'Je Spiel ein Eintrag'),
}, ['matches']);

const posText = (pos) => pos.filter((p) => p.rank).map((p) => `${p.label ? `${p.label} ` : ''}${p.rank}.`).join(', ') || 'unbekannt';
const formText = (games) => games.slice(0, 10).map((g) => `${g.res} ${g.gf}:${g.ga} ${g.home ? 'H' : 'A'} ${g.opp} (${compLabel(g.comp)})`).join('; ') || 'keine Daten';
const avgText = (st) => [3, 5, 10].map((n) => (st?.[n] ? `${n}: ${fmtAvg(st[n].gf)}/${fmtAvg(st[n].ga)}` : null)).filter(Boolean).join(', ') || 'keine Daten';

/** Ein Spiel als Textblock. `c` = { match, home: { pos, games, stats }, away: …, model }. */
export function kickMatchText(c) {
  const m = c.match;
  const lg = LEAGUES.find((l) => l.key === m.league);
  const when = new Date(m.at).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const lines = [
    `### id ${m.id}: ${m.home.full || m.home.name} – ${m.away.full || m.away.name}`,
    `${lg?.label || ''}${(m.league === 'cl' || m.league === 'dfb') && m.phase ? ` (${m.phase})` : ''}, ${when}`,
    `Plätze: ${m.home.name} ${posText(c.home.pos)} | ${m.away.name} ${posText(c.away.pos)}`,
    `Form ${m.home.name}: ${formText(c.home.games)}`,
    `Form ${m.away.name}: ${formText(c.away.games)}`,
    `Tore/Gegentore im Schnitt der letzten n Spiele – ${m.home.name}: ${avgText(c.home.stats)} | ${m.away.name}: ${avgText(c.away.stats)}`,
  ];
  if (m.odds) lines.push(`Quoten: Heimsieg ${pct(m.odds.home)}, Remis ${pct(m.odds.draw)}, Auswärtssieg ${pct(m.odds.away)}${m.odds.line != null ? `, über ${m.odds.line} Tore ${pct(m.odds.over)}` : ''}`);
  else lines.push('Quoten: keine');
  if (c.model) lines.push(`Poisson-Modell: erwartete Tore ${c.model.lh.toFixed(2)} : ${c.model.la.toFixed(2)}, häufigste Ergebnisse ${c.model.top.map((t) => `${t.h}:${t.a} ${pct(t.p)}`).join(', ')}`);
  return lines.join('\n');
}

export const kickPrompt = (cards) => `Spiele:\n\n${cards.map(kickMatchText).join('\n\n')}`.slice(0, 30000);

const goals = (v) => Math.max(0, Math.min(9, Math.round(Number(v) || 0)));

/** Antwort säubern: { [id]: { tips: [{ h, a, pct }], note } }. */
export function readKick(data, ids = null) {
  const out = {};
  for (const x of Array.isArray(data?.matches) ? data.matches : []) {
    const id = String(x?.id || '').replace(/^id\s*/i, '').trim();
    if (!id || (ids && !ids.includes(id))) continue;
    const seen = new Set();
    const tips = (Array.isArray(x.tips) ? x.tips : [])
      .map((t) => ({ h: goals(t?.home), a: goals(t?.away), pct: Math.max(1, Math.min(60, Math.round(Number(t?.percent) || 0))) }))
      .filter((t) => { const k = `${t.h}:${t.a}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((p, q) => q.pct - p.pct)
      .slice(0, 3);
    if (!tips.length) continue;
    out[id] = { tips, note: String(x.note || '').trim().slice(0, 90) };
  }
  return out;
}

export const acceptKick = (ids) => (data) => Object.keys(readKick(data, ids)).length >= Math.ceil(ids.length / 2);
