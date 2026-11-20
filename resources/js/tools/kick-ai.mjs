// KI-Einschätzung für den Kicktipp-Helfer: Gemini bekommt je Spiel Form, Torschnitte,
// Tabellenplätze, Quoten und das Poisson-Modell und nennt die drei wahrscheinlichsten
// Ergebnisse mit grober Prozent-Chance. Mehrere Spiele gehen in einer Anfrage raus.

import { modelChain, schemaOf, S } from '../gemini.mjs';
import { LEAGUES, compLabel, fmtAvg, pct, tierText } from './kick.mjs';

export const KICK_MODEL = 'gemini-3.8-flash';
export const kickModels = () => modelChain(KICK_MODEL);
export const KICK_BATCH = 10;

export const KICK_SYSTEM = `Du bist ein nüchterner Fußball-Analyst und hilfst beim Tippspiel (Kicktipp).
Du bekommst für mehrere Spiele: Wettbewerb, Heim- und Auswärtsteam, Tabellenplätze, die letzten Pflichtspiele beider Teams (aus Sicht des Teams: S/U/N, eigene Tore zuerst, H = Heim, A = auswärts), Torschnitte, Wettquoten (Wahrscheinlichkeiten ohne Marge) und ein Poisson-Modell.
Schätze für jedes Spiel die drei wahrscheinlichsten Endergebnisse nach 90 Minuten mit ungefährer Wahrscheinlichkeit in Prozent (ganze Zahlen, realistisch: einzelne Ergebnisse liegen fast immer zwischen 5 und 20 Prozent).
Die Quoten sind die beste Grundlage; weiche nur ab, wenn Form, Torschnitte oder die Lage (Pokal, Rotation, Auswärtsschwäche) klar dafür sprechen. Dein eigenes Wissen über Kader, Klasse und Verletzungen darfst du einbeziehen.
Ohne Quoten zählt zuerst die Spielklasse: Torschnitte und Form entstehen gegen Gegner der eigenen Liga und sind über Ligagrenzen hinweg NICHT vergleichbar. Ein Bundesligist ist gegen Dritt- oder Viertligisten fast immer klarer Favorit (Sieg meist 65–85 %), auch auswärts; Ergebnisse wie 0:2, 1:3, 0:3 oder 1:2 für den Höherklassigen sind dann typisch. Ein Sieg des Unterklassigen gehört höchstens mit kleiner Prozentzahl auf Platz 3.
Die Ergebnisse sind immer Heimteam:Auswärtsteam (das zuerst genannte Team ist das Heimteam).
Wähle nicht reflexhaft 2:1 oder 1:2: richte die Ergebnisse an den erwarteten Toren aus (bei klarem Favoriten eher 0:2/2:0 oder 3:1/1:3, bei torarmen Spielen 1:0/0:1/1:1).
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
    `Spielklasse: ${m.home.name} ${tierText(c.tiers?.home)} | ${m.away.name} ${tierText(c.tiers?.away)}`,
    `Plätze: ${m.home.name} ${posText(c.home.pos)} | ${m.away.name} ${posText(c.away.pos)}`,
    `Form ${m.home.name}: ${formText(c.home.games)}`,
    `Form ${m.away.name}: ${formText(c.away.games)}`,
    `Tore/Gegentore im Schnitt der letzten n Spiele – ${m.home.name}: ${avgText(c.home.stats)} | ${m.away.name}: ${avgText(c.away.stats)}`,
  ];
  if (m.odds) lines.push(`Quoten: Heimsieg ${pct(m.odds.home)}, Remis ${pct(m.odds.draw)}, Auswärtssieg ${pct(m.odds.away)}${m.odds.line != null ? `, über ${m.odds.line} Tore ${pct(m.odds.over)}` : ''}`);
  else lines.push('Quoten: keine');
  if (c.model) lines.push(`Poisson-Modell (${c.model.source === 'odds' ? 'aus den Quoten' : 'grob aus Torschnitten und Spielklasse'}): erwartete Tore ${c.model.lh.toFixed(2)} : ${c.model.la.toFixed(2)}, häufigste Ergebnisse ${c.model.top.map((t) => `${t.h}:${t.a} ${pct(t.p)}`).join(', ')}`);
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

// ------------------------------------------------------------------ Gemerkte Einschätzungen
// Eine Einschätzung wird je Spiel genau einmal geholt und bleibt bis nach dem Spiel liegen
// (`kick` = Anstoß). Spiele, die in einer Antwort fehlten, werden frühestens nach RETRY erneut
// angefragt, damit der 5-Minuten-Takt nicht jedes Mal Gemini weckt.

const DAY = 86400000;
export const KICK_RETRY = 6 * 3600000;

/** Welche Karten brauchen noch eine KI-Einschätzung? `force` übergeht die Wartezeit. */
export function kickAiTodo(cards, data, now = Date.now(), force = false) {
  return cards.filter((c) => c.state === 'pre' && !data.ai?.[c.id]
    && (force || !data.aiTry?.[c.id] || now - data.aiTry[c.id] > KICK_RETRY));
}

/** Abgelaufene Einschätzungen und Fehlversuche entfernen (verändert `data`). */
export function pruneKickAi(data, now = Date.now()) {
  for (const [k, v] of Object.entries(data.ai || {})) {
    if (v?.kick ? now > v.kick + DAY : now - (v?.at || 0) > 7 * DAY) delete data.ai[k];
  }
  for (const [k, t] of Object.entries(data.aiTry || {})) if (now - t > DAY) delete data.aiTry[k];
  return data;
}
