// Kicktipp-Helfer: Logik ohne Oberfläche.
//
// Datenquelle ist die öffentliche Schnittstelle von ESPN (ohne Schlüssel, CORS offen):
// - Spielplan je Wettbewerb und Tag (inkl. Wettquoten von DraftKings, wenn vorhanden)
// - Spielplan je Verein über alle Wettbewerbe (Form, Torschnitte, Heimatliga)
// - Tabellen je Liga bzw. der CL-Ligaphase
// Aus den Quoten wird ein Poisson-Modell geschätzt (erwartete Tore je Team). Es liefert die
// Ergebnis-Wahrscheinlichkeiten und den Tipp mit den meisten erwarteten Kicktipp-Punkten.

export const LEAGUES = [
  { key: 'bl1', slug: 'ger.1', label: '1. Bundesliga', short: 'BL' },
  { key: 'bl2', slug: 'ger.2', label: '2. Bundesliga', short: '2. BL' },
  { key: 'cl', slug: 'uefa.champions', label: 'Champions League', short: 'CL' },
  { key: 'dfb', slug: 'ger.dfb_pokal', label: 'DFB-Pokal', short: 'Pokal' },
];

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const CORE = 'https://site.api.espn.com/apis/v2/sports/soccer';

export const espn = {
  scoreboard: (slug, ymd) => `${SITE}/${slug}/scoreboard?dates=${ymd}`,
  schedule: (teamId, season) => `${SITE}/all/teams/${teamId}/schedule${season ? `?season=${season}` : ''}`,
  standings: (slug) => `${CORE}/${slug}/standings`,
  logo: (teamId) => `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/${teamId}.png&w=48&h=48`,
};

export const DEFAULT_RULES = { exact: 4, diff: 3, tendency: 2 };

// ---------------------------------------------------------------- Zeitfenster

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

/** Heute und die folgenden Tage: { days: ['20261016', …], from, to } (lokale Zeit). */
export function matchWindow(now = Date.now(), count = 3) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < count; i++) days.push(ymd(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + count);
  return { days, from: start.getTime(), to: end.getTime() };
}

// ---------------------------------------------------------------- Namen

// ESPN liefert englische Kurznamen. Die geläufigen deutschen Namen, wie sie in Kicktipp stehen.
const DE_NAMES = {
  cologne: 'Köln', 'fc cologne': 'Köln', bayern: 'Bayern', 'bayern munich': 'Bayern', hamburg: 'HSV', 'hamburg sv': 'HSV',
  gladbach: "M'gladbach", 'borussia mönchengladbach': "M'gladbach", '1. fc nürnberg': 'Nürnberg', nuremberg: 'Nürnberg',
  osnabruck: 'Osnabrück', 'e braunschweig': 'Braunschweig', 'greuther furth': 'Fürth', 'd dresden': 'Dresden',
  karlsruher: 'Karlsruhe', 'munich 1860': '1860 München', '1860 munich': '1860 München', dusseldorf: 'Düsseldorf',
  'fortuna dusseldorf': 'Düsseldorf', 'union berlin': 'Union', 'rb leipzig': 'Leipzig', 'holstein kiel': 'Kiel',
  hertha: 'Hertha', 'st. pauli': 'St. Pauli', 'hannover': 'Hannover', 'rot-weiss essen': 'RW Essen', saarbrucken: 'Saarbrücken',
  'alemannia aachen': 'Aachen', 'sc verl': 'Verl', 'wehen wiesbaden': 'Wiesbaden', ulm: 'Ulm', 'ssv ulm': 'Ulm', munster: 'Münster',
  'preussen munster': 'Münster', 'rot-weiss oberhausen': 'RW Oberhausen',
  internazionale: 'Inter', 'inter milan': 'Inter', 'ac milan': 'AC Mailand', milan: 'AC Mailand', napoli: 'Neapel',
  'as roma': 'AS Rom', roma: 'AS Rom', juventus: 'Juventus', lazio: 'Lazio Rom', 'slavia prague': 'Slavia Prag',
  'sparta prague': 'Sparta Prag', 'bodo/glimt': 'Bodø/Glimt', fenerbahce: 'Fenerbahçe', besiktas: 'Beşiktaş',
  copenhagen: 'Kopenhagen', 'fc copenhagen': 'Kopenhagen', 'red bull salzburg': 'Salzburg', salzburg: 'Salzburg',
  'atletico madrid': 'Atlético', 'atlético madrid': 'Atlético', 'tottenham hotspur': 'Tottenham', tottenham: 'Tottenham',
  'manchester city': 'Man City', 'man city': 'Man City', 'manchester united': 'Man United', 'man united': 'Man United',
  'paris saint-germain': 'Paris SG', psg: 'Paris SG', 'sporting cp': 'Sporting', 'club brugge': 'Brügge', 'brugge': 'Brügge',
  'olympiacos': 'Olympiakos', 'crvena zvezda': 'Roter Stern', 'red star belgrade': 'Roter Stern', 'qarabag': 'Qarabağ',
  'dinamo zagreb': 'Dinamo Zagreb', 'shakhtar donetsk': 'Schachtar', 'young boys': 'Young Boys', 'sturm graz': 'Sturm Graz',
  'feyenoord rotterdam': 'Feyenoord', 'psv eindhoven': 'PSV', 'athletic club': 'Bilbao', 'real sociedad': 'San Sebastián',
};

export function deName(name) {
  const s = String(name || '').trim();
  return DE_NAMES[s.toLowerCase()] || s;
}

// ---------------------------------------------------------------- Quoten

/** Amerikanische Quote („+310", „-150", „EVEN") → rohe Wahrscheinlichkeit. */
export function americanToProb(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().toUpperCase();
  const n = s === 'EVEN' || s === 'EV' ? 100 : Number(s.replace('+', ''));
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) < 100) return null;
  return n > 0 ? 100 / (n + 100) : -n / (-n + 100);
}

const pick = (side) => side?.close?.odds ?? side?.open?.odds ?? null;

/** Quoten eines Spiels → { home, draw, away, line, over } (ohne Buchmacher-Marge) oder null. */
export function readOdds(o) {
  if (!o) return null;
  const h = americanToProb(pick(o.moneyline?.home) ?? o.homeTeamOdds?.moneyLine);
  const a = americanToProb(pick(o.moneyline?.away) ?? o.awayTeamOdds?.moneyLine);
  const d = americanToProb(pick(o.moneyline?.draw) ?? o.drawOdds?.moneyLine);
  if (!h || !a || !d) return null;
  const sum = h + d + a;
  const out = { home: h / sum, draw: d / sum, away: a / sum, line: null, over: null };
  const line = Number(o.overUnder);
  const ov = americanToProb(pick(o.total?.over));
  const un = americanToProb(pick(o.total?.under));
  if (Number.isFinite(line) && line > 0 && ov && un) {
    out.line = line;
    out.over = ov / (ov + un);
  }
  return out;
}

// ---------------------------------------------------------------- Spiele

const numScore = (s) => {
  const v = s && typeof s === 'object' ? s.value ?? s.displayValue : s;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function readTeam(x) {
  const t = x?.team || {};
  return {
    id: String(t.id || ''),
    name: deName(t.shortDisplayName || t.displayName || t.name),
    full: t.displayName || t.name || '',
    abbr: t.abbreviation || '',
  };
}

/** Ein Spiel aus dem Tages-Spielplan. */
export function readEvent(e, league) {
  const c = e?.competitions?.[0];
  if (!c || !Array.isArray(c.competitors)) return null;
  const h = c.competitors.find((x) => x.homeAway === 'home');
  const a = c.competitors.find((x) => x.homeAway === 'away');
  if (!h || !a) return null;
  const st = c.status?.type || e.status?.type || {};
  const state = st.state || 'pre';
  return {
    id: String(e.id),
    league: league.key,
    at: Date.parse(e.date),
    home: readTeam(h),
    away: readTeam(a),
    state,
    detail: state === 'in' ? (c.status?.displayClock || st.shortDetail || '') : (st.shortDetail || ''),
    score: state === 'pre' ? null : [numScore(h.score) ?? 0, numScore(a.score) ?? 0],
    phase: e.season?.slug || '',
    odds: readOdds(Array.isArray(c.odds) ? c.odds[0] : null),
  };
}

export function readScoreboard(json, league) {
  return (json?.events || []).map((e) => readEvent(e, league)).filter(Boolean);
}

// ---------------------------------------------------------------- Vereine

const COMP = {
  'ger.1': 'BL', 'ger.2': '2. BL', 'ger.3': '3. Liga', 'uefa.champions': 'CL', 'uefa.champions_qual': 'CL-Q',
  'uefa.europa': 'EL', 'uefa.europa_qual': 'EL-Q', 'uefa.europa.conf': 'ECL', 'uefa.europa.conf_qual': 'ECL-Q',
  'ger.dfb_pokal': 'Pokal', 'ger.super_cup': 'Supercup', 'uefa.super_cup': 'Supercup', 'fifa.cwc': 'Klub-WM',
  'eng.1': 'PL', 'esp.1': 'LaLiga', 'ita.1': 'Serie A', 'fra.1': 'Ligue 1', 'por.1': 'Liga', 'ned.1': 'Eredivisie',
  'bel.1': 'Pro League', 'aut.1': 'Bundesliga AT', 'sui.1': 'Super League', 'tur.1': 'Süper Lig', 'sco.1': 'Premiership',
};

export const isLeagueSlug = (slug) => /^[a-z]{3}\.\d$/.test(String(slug || ''));
export const compLabel = (slug) => COMP[slug] || (isLeagueSlug(slug) ? 'Liga' : 'Pokal');

/**
 * Beendete Pflichtspiele eines Vereins aus seinem Spielplan (neueste zuerst):
 * [{ id, at, comp, home, gf, ga, res: 'S'|'U'|'N', opp }]. Testspiele fallen weg.
 */
export function readSchedule(json, teamId) {
  const id = String(teamId);
  const out = [];
  for (const e of json?.events || []) {
    const c = e?.competitions?.[0];
    const slug = e?.league?.slug || '';
    if (!c || /friendly/i.test(slug)) continue;
    const st = c.status?.type || {};
    if (st.state !== 'post') continue;
    const me = c.competitors?.find((x) => String(x.team?.id) === id);
    const them = c.competitors?.find((x) => String(x.team?.id) !== id);
    if (!me || !them) continue;
    const gf = numScore(me.score);
    const ga = numScore(them.score);
    if (gf == null || ga == null) continue;
    out.push({
      id: String(e.id),
      at: Date.parse(e.date),
      comp: slug,
      home: me.homeAway === 'home',
      gf,
      ga,
      res: gf > ga ? 'S' : gf < ga ? 'N' : 'U',
      opp: readTeam(them).name,
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Zwei Spiellisten zusammenführen (ohne Doppelte, neueste zuerst). */
export function mergeGames(...lists) {
  const seen = new Map();
  for (const g of lists.flat()) if (g && !seen.has(g.id)) seen.set(g.id, g);
  return [...seen.values()].sort((a, b) => b.at - a.at);
}

/** Heimatliga eines Vereins: die häufigste Liga in seinen Spielen. */
export function domesticLeague(games) {
  const n = new Map();
  for (const g of games) if (isLeagueSlug(g.comp)) n.set(g.comp, (n.get(g.comp) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

/** Tore und Gegentore im Schnitt der letzten n Spiele: { 3: { gf, ga, n }, 5: …, 10: … }. */
export function goalStats(games, sizes = [3, 5, 10]) {
  const out = {};
  for (const size of sizes) {
    const part = games.slice(0, size);
    out[size] = part.length
      ? { gf: part.reduce((s, g) => s + g.gf, 0) / part.length, ga: part.reduce((s, g) => s + g.ga, 0) / part.length, n: part.length }
      : null;
  }
  return out;
}

// ---------------------------------------------------------------- Tabellen

/** Tabelle → { [teamId]: { rank, pts, played } }. */
export function readStandings(json) {
  const out = {};
  for (const child of json?.children || []) {
    for (const e of child?.standings?.entries || []) {
      const stat = (name) => Number(e.stats?.find((s) => s.name === name)?.value ?? e.stats?.find((s) => s.name === name)?.displayValue);
      const rank = stat('rank');
      if (!e.team?.id || !Number.isFinite(rank)) continue;
      out[String(e.team.id)] = { rank, pts: stat('points') || 0, played: stat('gamesPlayed') || 0 };
    }
  }
  return out;
}

/**
 * Plätze, die zu einem Spiel gezeigt werden: [{ label, rank }].
 * Liga: Platz in dieser Liga. CL-Ligaphase: CL-Platz. CL-K.-o.-Runde: Platz in der Heimatliga
 * und Endplatz der Ligaphase. DFB-Pokal: Platz in der Heimatliga.
 */
export function positionsFor(match, teamId, { tables = {}, domestic = null } = {}) {
  const lg = LEAGUES.find((l) => l.key === match.league);
  const rankIn = (slug) => tables[slug]?.[teamId]?.rank ?? null;
  const home = domestic && tables[domestic] ? { label: domestic.startsWith('ger.') ? compLabel(domestic) : 'Liga', rank: rankIn(domestic) } : null;
  if (lg.key === 'bl1' || lg.key === 'bl2') return [{ label: '', rank: rankIn(lg.slug) }];
  if (lg.key === 'cl') {
    const cl = { label: 'CL', rank: rankIn('uefa.champions') };
    if (!match.phase || match.phase === 'league-phase') return [{ label: '', rank: cl.rank }];
    return [home, cl].filter(Boolean);
  }
  return home ? [home] : [];
}

// ---------------------------------------------------------------- Modell

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
const MAX_GOALS = 9;

function poissonRow(l) {
  const row = new Array(MAX_GOALS + 1);
  for (let k = 0; k <= MAX_GOALS; k++) row[k] = Math.exp(-l) * l ** k / FACT[k];
  return row;
}

/** Wahrscheinlichkeit je Ergebnis: m[h][a] (normiert). */
export function scoreMatrix(lh, la) {
  const ph = poissonRow(lh);
  const pa = poissonRow(la);
  const m = ph.map((x) => pa.map((y) => x * y));
  const sum = m.flat().reduce((s, v) => s + v, 0);
  return m.map((r) => r.map((v) => v / sum));
}

export function outcomeOf(m, line = null) {
  let home = 0; let draw = 0; let away = 0; let over = 0;
  for (let h = 0; h < m.length; h++) {
    for (let a = 0; a < m[h].length; a++) {
      const p = m[h][a];
      if (h > a) home += p; else if (h < a) away += p; else draw += p;
      if (line != null && h + a > line) over += p;
    }
  }
  return { home, draw, away, over: line != null ? over : null };
}

const GRID = Array.from({ length: 78 }, (_, i) => +(0.15 + i * 0.05).toFixed(2));

/** Erwartete Tore so wählen, dass das Modell die Quoten (1/X/2, über/unter) möglichst trifft. */
export function fitLambdas(odds) {
  const rows = GRID.map(poissonRow);
  let best = null;
  for (let i = 0; i < GRID.length; i++) {
    for (let j = 0; j < GRID.length; j++) {
      const ph = rows[i]; const pa = rows[j];
      let home = 0; let draw = 0; let over = 0; let sum = 0;
      for (let h = 0; h <= MAX_GOALS; h++) {
        for (let a = 0; a <= MAX_GOALS; a++) {
          const p = ph[h] * pa[a];
          sum += p;
          if (h > a) home += p; else if (h === a) draw += p;
          if (odds.line != null && h + a > odds.line) over += p;
        }
      }
      home /= sum; draw /= sum; over /= sum;
      const away = 1 - home - draw;
      let err = (home - odds.home) ** 2 + (draw - odds.draw) ** 2 + (away - odds.away) ** 2;
      if (odds.over != null) err += 0.5 * (over - odds.over) ** 2;
      if (!best || err < best.err) best = { lh: GRID[i], la: GRID[j], err };
    }
  }
  return { lh: best.lh, la: best.la };
}

/** Ohne Quoten: erwartete Tore aus den Torschnitten der letzten 10 Spiele (mit Heimvorteil). */
export function lambdasFromForm(homeStats, awayStats) {
  const hs = homeStats?.[10] || homeStats?.[5];
  const as = awayStats?.[10] || awayStats?.[5];
  const base = (x, fb) => (x != null ? x : fb);
  const lh = (base(hs?.gf, 1.4) + base(as?.ga, 1.4)) / 2 * 1.08;
  const la = (base(as?.gf, 1.15) + base(hs?.ga, 1.15)) / 2 * 0.92;
  const clamp = (v) => Math.min(4, Math.max(0.2, v));
  return { lh: clamp(lh), la: clamp(la) };
}

/** Kicktipp-Punkte eines Tipps bei einem Ergebnis (Tordifferenz zählt nicht bei Unentschieden). */
export function pointsFor(tip, res, rules = DEFAULT_RULES) {
  const [th, ta] = tip;
  const [rh, ra] = res;
  if (th === rh && ta === ra) return rules.exact;
  const sign = (x) => Math.sign(x);
  if (sign(th - ta) !== sign(rh - ra)) return 0;
  if (th !== ta && th - ta === rh - ra) return rules.diff;
  return rules.tendency;
}

export function expectedPoints(m, tip, rules = DEFAULT_RULES) {
  let ep = 0;
  for (let h = 0; h < m.length; h++) for (let a = 0; a < m[h].length; a++) ep += m[h][a] * pointsFor(tip, [h, a], rules);
  return ep;
}

/** Der Tipp mit den meisten erwarteten Punkten: { h, a, ep }. */
export function bestTip(m, rules = DEFAULT_RULES) {
  let best = null;
  for (let h = 0; h <= 5; h++) {
    for (let a = 0; a <= 5; a++) {
      const ep = expectedPoints(m, [h, a], rules);
      if (!best || ep > best.ep + 1e-9) best = { h, a, ep };
    }
  }
  return best;
}

/** Die n wahrscheinlichsten Ergebnisse: [{ h, a, p }]. */
export function topScores(m, n = 3) {
  const all = [];
  for (let h = 0; h < m.length; h++) for (let a = 0; a < m[h].length; a++) all.push({ h, a, p: m[h][a] });
  return all.sort((x, y) => y.p - x.p).slice(0, n);
}

/** Modell eines Spiels: aus Quoten, sonst aus der Form. */
export function modelFor(match, homeStats, awayStats, rules = DEFAULT_RULES) {
  const source = match.odds ? 'odds' : homeStats?.[5] && awayStats?.[5] ? 'form' : null;
  if (!source) return null;
  const { lh, la } = source === 'odds' ? fitLambdas(match.odds) : lambdasFromForm(homeStats, awayStats);
  const m = scoreMatrix(lh, la);
  const o = outcomeOf(m);
  return { source, lh, la, home: o.home, draw: o.draw, away: o.away, top: topScores(m, 3), tip: bestTip(m, rules) };
}

// ---------------------------------------------------------------- Anzeige

export const fmtAvg = (v) => (v == null ? '–' : v.toFixed(1).replace('.', ','));
export const pct = (p) => `${Math.round(p * 100)}%`;
