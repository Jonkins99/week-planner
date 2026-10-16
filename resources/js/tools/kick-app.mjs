// Kicktipp-Helfer: Alpine-Komponente `kick`. Eigenständig neben der Haushalts-App:
// eigene Daten (`wp-kick-v1`: getippt-Haken, KI-Einschätzungen, Punkteregeln, eingeklappte
// Wettbewerbe) und ein eigener Zwischenspeicher der ESPN-Antworten (`wp-kick-cache-v1`).
// Gebaut für den halben Handybildschirm (Split View neben Kicktipp): eine Karte je Spiel,
// getippte Spiele schrumpfen auf eine Zeile.

import {
  LEAGUES, DEFAULT_RULES, espn, matchWindow, readScoreboard, readSchedule, mergeGames, domesticLeague, goalStats,
  readStandings, positionsFor, modelFor, scoreMatrix, bestTip, compLabel, isLeagueSlug, fmtAvg, pct,
} from './kick.mjs';
import { KICK_SYSTEM, KICK_SCHEMA, KICK_BATCH, kickModels, kickPrompt, readKick, acceptKick } from './kick-ai.mjs';
import { generateJson, QuotaBook, normalizeKeys } from '../gemini.mjs';
import { readJson, writeJson, GEMINI_KEY, QUOTA_KEY } from '../storage.mjs';

const DATA = 'wp-kick-v1';
const CACHE = 'wp-kick-cache-v1';
const DAYS = 3;
const MIN = 60000;
const HOUR = 3600000;
const TTL = { today: 5 * MIN, day: 60 * MIN, team: 6 * HOUR, table: 3 * HOUR, ai: 12 * HOUR };

const quota = new QuotaBook({ load: () => readJson(QUOTA_KEY, {}), save: (v) => writeJson(QUOTA_KEY, v) });
const geminiKeys = () => normalizeKeys(readJson(GEMINI_KEY, {})?.keys || []);

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const PHASES = {
  'league-phase': 'Ligaphase', 'knockout-round-playoffs': 'Play-offs', 'round-of-16': 'Achtelfinale', quarterfinals: 'Viertelfinale',
  semifinals: 'Halbfinale', final: 'Finale', 'first-round': '1. Runde', 'second-round': '2. Runde', 'round-of-32': '1. Runde',
};
const phaseLabel = (slug) => PHASES[slug] || String(slug || '').replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// Erwartete Tore je Spiel (das Anpassen an die Quoten ist der teure Teil) bleiben gemerkt.
const fits = new Map();

async function getJson(url, ms = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function pool(items, size, fn) {
  let i = 0;
  const worker = async () => { while (i < items.length) { const it = items[i++]; await fn(it); } };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

const emptyData = () => ({ done: {}, ai: {}, rules: { ...DEFAULT_RULES }, collapsed: {} });
const emptyCache = () => ({ sb: {}, teams: {}, tables: {} });

function sideOf(team, games, pos) {
  const stats = goalStats(games);
  return {
    id: team.id,
    name: team.name,
    logo: team.id ? espn.logo(team.id) : '',
    pos: pos.filter((p) => p.rank),
    form: games.slice(0, 5).map((g) => ({
      key: g.id, res: g.res, score: `${g.gf}:${g.ga}`, opp: g.opp, venue: g.home ? 'H' : 'A', tag: isLeagueSlug(g.comp) ? '' : compLabel(g.comp),
    })),
    stats,
    gf: [3, 5, 10].map((n) => fmtAvg(stats[n]?.gf)),
    ga: [3, 5, 10].map((n) => fmtAvg(stats[n]?.ga)),
    known: games.length > 0,
  };
}

export function registerKick(Alpine) {
  Alpine.data('kick', () => ({
    KT_LEAGUES: LEAGUES,
    ktData: emptyData(),
    ktCards: [],
    ktBusy: false,
    ktError: '',
    ktUpdated: 0,
    ktAiBusy: false,
    ktAiStatus: '',
    ktAiError: '',
    ktShowRules: false,
    ktPeek: {},
    _ktCache: emptyCache(),
    _ktLoading: null,
    _ktAiFailed: 0,
    _ktTimer: null,

    init() {
      const d = readJson(DATA, null);
      if (d && typeof d === 'object') this.ktData = { ...emptyData(), ...d, rules: { ...DEFAULT_RULES, ...(d.rules || {}) } };
      const c = readJson(CACHE, null);
      if (c && typeof c === 'object') this._ktCache = { ...emptyCache(), ...c };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.isOpen('kick')) this.ktLoad();
      });
    },

    ktSave() {
      clearTimeout(this._ktSaveT);
      this._ktSaveT = setTimeout(() => writeJson(DATA, this.ktData), 150);
    },

    ktOpen() {
      if (!this.isOpen('kick')) this.openLayer('kick');
      if (!this.ktCards.length) this.ktBuild();
      this.ktLoad();
      clearInterval(this._ktTimer);
      this._ktTimer = setInterval(() => {
        if (!this.isOpen('kick')) { clearInterval(this._ktTimer); return; }
        if (document.visibilityState === 'visible') this.ktLoad();
      }, 5 * MIN);
    },

    // ---------------------------------------------------------------- Laden

    ktLoad(force = false) {
      if (this._ktLoading) return this._ktLoading;
      this._ktLoading = this.ktFetch(force).finally(() => { this._ktLoading = null; });
      return this._ktLoading;
    },

    async ktFetch(force) {
      this.ktBusy = true;
      this.ktError = '';
      const cache = this._ktCache;
      const now = Date.now();
      const win = matchWindow(now, DAYS);
      const failed = [];
      const fresh = (entry, ttl) => entry && now - entry.at < (force ? Math.min(ttl, 2 * MIN) : ttl);
      try {
        // 1. Spielpläne je Wettbewerb und Tag
        const jobs = LEAGUES.flatMap((lg) => win.days.map((day, i) => ({ lg, day, key: `${lg.key}|${day}`, ttl: i === 0 ? TTL.today : TTL.day })));
        await pool(jobs.filter((j) => !fresh(cache.sb[j.key], j.ttl)), 6, async (j) => {
          try {
            cache.sb[j.key] = { at: Date.now(), list: readScoreboard(await getJson(espn.scoreboard(j.lg.slug, j.day)), j.lg) };
          } catch { failed.push(j.key); }
        });
        const matches = this.ktMatches(win);

        // 2. Vereine (Form über alle Wettbewerbe, notfalls mit der Vorsaison aufgefüllt)
        const teamIds = [...new Set(matches.flatMap((m) => [m.home.id, m.away.id]).filter(Boolean))];
        await pool(teamIds.filter((id) => !fresh(cache.teams[id], TTL.team)), 6, async (id) => {
          try {
            const json = await getJson(espn.schedule(id));
            let games = readSchedule(json, id);
            if (games.length < 10) {
              const year = Number(json?.season?.year) || new Date().getFullYear();
              try { games = mergeGames(games, readSchedule(await getJson(espn.schedule(id, year - 1)), id)); } catch { /* dann eben weniger */ }
            }
            cache.teams[id] = { at: Date.now(), games: games.slice(0, 12), domestic: domesticLeague(games) };
          } catch { failed.push(id); }
        });

        // 3. Tabellen: die eigenen Ligen, die CL und die Heimatligen der Pokal- und CL-Teams
        const slugs = new Set();
        for (const m of matches) {
          const lg = LEAGUES.find((l) => l.key === m.league);
          if (lg.key !== 'dfb') slugs.add(lg.slug);
          if (lg.key === 'dfb' || lg.key === 'cl') {
            for (const id of [m.home.id, m.away.id]) { const dom = cache.teams[id]?.domestic; if (dom) slugs.add(dom); }
          }
        }
        await pool([...slugs].filter((s) => !fresh(cache.tables[s], TTL.table)), 4, async (slug) => {
          try { cache.tables[slug] = { at: Date.now(), table: readStandings(await getJson(espn.standings(slug))) }; } catch { cache.tables[slug] ||= { at: Date.now() - TTL.table + 30 * MIN, table: {} }; }
        });

        this.ktPrune(win, teamIds, slugs);
        writeJson(CACHE, cache);
        if (failed.length && !matches.length) this.ktError = 'Keine Verbindung zu den Spieldaten. Es wird der letzte Stand gezeigt.';
        else if (failed.length) this.ktError = 'Nicht alle Daten ließen sich laden.';
        this.ktUpdated = Date.now();
      } catch (e) {
        this.ktError = e?.message || 'Laden ist gescheitert.';
      } finally {
        this.ktBusy = false;
        this.ktBuild();
      }
      this.ktRunAi();
    },

    ktMatches(win = matchWindow(Date.now(), DAYS)) {
      const seen = new Set();
      const out = [];
      for (const lg of LEAGUES) {
        for (const day of win.days) {
          for (const m of this._ktCache.sb[`${lg.key}|${day}`]?.list || []) {
            if (seen.has(m.id) || m.at < win.from || m.at >= win.to) continue;
            seen.add(m.id);
            out.push(m);
          }
        }
      }
      return out.sort((a, b) => a.at - b.at);
    },

    ktPrune(win, teamIds, slugs) {
      const c = this._ktCache;
      const keepDays = new Set(win.days);
      for (const k of Object.keys(c.sb)) if (!keepDays.has(k.split('|')[1])) delete c.sb[k];
      const ids = new Set(teamIds);
      for (const k of Object.keys(c.teams)) if (!ids.has(k) && Date.now() - c.teams[k].at > 3 * 86400000) delete c.teams[k];
      for (const k of Object.keys(c.tables)) if (!slugs.has(k) && Date.now() - c.tables[k].at > 3 * 86400000) delete c.tables[k];
      const live = new Set(this.ktMatches(win).map((m) => m.id));
      for (const k of Object.keys(this.ktData.ai)) if (!live.has(k) && Date.now() - (this.ktData.ai[k].at || 0) > 7 * 86400000) delete this.ktData.ai[k];
      for (const k of Object.keys(this.ktData.done)) if (!live.has(k) && Date.now() - this.ktData.done[k] > 14 * 86400000) delete this.ktData.done[k];
    },

    // ---------------------------------------------------------------- Aufbereiten

    ktBuild() {
      const c = this._ktCache;
      const tables = Object.fromEntries(Object.entries(c.tables).map(([k, v]) => [k, v.table || {}]));
      const rules = this.ktData.rules;
      this.ktCards = this.ktMatches().map((m) => {
        const tH = c.teams[m.home.id];
        const tA = c.teams[m.away.id];
        const gH = tH?.games || [];
        const gA = tA?.games || [];
        const home = sideOf(m.home, gH, positionsFor(m, m.home.id, { tables, domestic: tH?.domestic }));
        const away = sideOf(m.away, gA, positionsFor(m, m.away.id, { tables, domestic: tA?.domestic }));
        const sig = `${m.id}|${m.odds ? `${m.odds.home.toFixed(3)}${m.odds.draw.toFixed(3)}${m.odds.line}${m.odds.over?.toFixed(3)}` : `${gH.length}/${gA.length}/${gH[0]?.id}/${gA[0]?.id}`}`;
        let model = fits.get(sig);
        if (!model) {
          model = modelFor(m, home.stats, away.stats, rules);
          fits.set(sig, model);
        } else if (model) {
          model = { ...model, tip: bestTip(scoreMatrix(model.lh, model.la), rules) };
        }
        const d = new Date(m.at);
        const hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        return {
          id: m.id,
          league: m.league,
          at: m.at,
          when: `${WD[d.getDay()]} ${hm}`,
          phase: m.league === 'cl' || m.league === 'dfb' ? phaseLabel(m.phase) : '',
          state: m.state,
          detail: m.detail,
          score: m.score ? `${m.score[0]}:${m.score[1]}` : '',
          home,
          away,
          odds: m.odds ? [
            { k: '1', p: m.odds.home, label: pct(m.odds.home) },
            { k: 'X', p: m.odds.draw, label: pct(m.odds.draw) },
            { k: '2', p: m.odds.away, label: pct(m.odds.away) },
          ] : null,
          model,
          tip: model?.tip ? `${model.tip.h}:${model.tip.a}` : '',
          ep: model?.tip ? model.tip.ep.toFixed(1).replace('.', ',') : '',
          xg: model ? `${fmtAvg(model.lh)} : ${fmtAvg(model.la)}` : '',
          raw: m,
          sides: { home: gH, away: gA },
        };
      });
    },

    get ktGroups() {
      return LEAGUES.map((lg) => {
        const cards = this.ktCards.filter((c) => c.league === lg.key);
        return { ...lg, cards, open: cards.filter((c) => !this.ktData.done[c.id] && c.state === 'pre').length };
      }).filter((g) => g.cards.length);
    },

    get ktRange() {
      const win = matchWindow(Date.now(), DAYS);
      const f = (t) => new Date(t).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
      return `${f(win.from)} – ${f(win.to - 1)}`;
    },

    get ktStamp() {
      if (!this.ktUpdated) return '';
      return `Stand ${new Date(this.ktUpdated).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
    },

    ktCollapsed(key) {
      return !!this.ktData.collapsed[key];
    },

    ktToggleLeague(key) {
      this.ktData.collapsed = { ...this.ktData.collapsed, [key]: !this.ktData.collapsed[key] };
      this.ktSave();
    },

    ktIsDone(id) {
      return !!this.ktData.done[id];
    },

    ktToggleDone(id) {
      const done = { ...this.ktData.done };
      if (done[id]) delete done[id]; else done[id] = Date.now();
      this.ktData.done = done;
      this.ktPeek = { ...this.ktPeek, [id]: false };
      this.ktSave();
    },

    ktCompact(card) {
      return (this.ktIsDone(card.id) || card.state === 'post') && !this.ktPeek[card.id];
    },

    ktTogglePeek(id) {
      this.ktPeek = { ...this.ktPeek, [id]: !this.ktPeek[id] };
    },

    ktAiOf(id) {
      return this.ktData.ai[id] || null;
    },

    ktPosText(side) {
      return side.pos.map((p) => `${p.label ? `${p.label} ` : ''}${p.rank}.`).join(' · ');
    },

    // ---------------------------------------------------------------- Punkteregeln

    ktRule(key, delta) {
      const r = { ...this.ktData.rules };
      r[key] = Math.max(0, Math.min(10, (Number(r[key]) || 0) + delta));
      this.ktData.rules = r;
      this.ktSave();
      this.ktBuild();
    },

    ktResetRules() {
      this.ktData.rules = { ...DEFAULT_RULES };
      this.ktSave();
      this.ktBuild();
    },

    // ---------------------------------------------------------------- KI

    get ktHasKey() {
      return geminiKeys().length > 0;
    },

    ktAiTodo() {
      const now = Date.now();
      return this.ktCards.filter((c) => c.state === 'pre' && (!this.ktData.ai[c.id] || now - this.ktData.ai[c.id].at > TTL.ai));
    },

    async ktRunAi(manual = false) {
      if (this.ktAiBusy) return;
      const keys = geminiKeys();
      if (!keys.length) return;
      if (!manual && Date.now() - this._ktAiFailed < 10 * MIN) return;
      const todo = manual ? this.ktCards.filter((c) => c.state === 'pre') : this.ktAiTodo();
      if (!todo.length) return;
      this.ktAiBusy = true;
      this.ktAiError = '';
      try {
        for (let i = 0; i < todo.length; i += KICK_BATCH) {
          const part = todo.slice(i, i + KICK_BATCH);
          const ids = part.map((c) => c.id);
          this.ktAiStatus = todo.length > KICK_BATCH ? `KI schätzt Spiele ${i + 1}–${i + part.length} von ${todo.length} …` : 'KI schätzt die Spiele …';
          let used = '';
          const data = await generateJson({
            keys, models: kickModels(), quota,
            system: KICK_SYSTEM, schema: KICK_SCHEMA,
            prompt: kickPrompt(part.map((c) => ({
              match: c.raw, model: c.model,
              home: { pos: c.home.pos, games: c.sides.home, stats: c.home.stats },
              away: { pos: c.away.pos, games: c.sides.away, stats: c.away.stats },
            }))),
            temperature: 0.4, maxOutputTokens: 4096, timeoutMs: 45000,
            accept: acceptKick(ids),
            onRetry: ({ next }) => { if (next) this.ktAiStatus = `Weiter mit ${next} …`; },
            onSuccess: ({ model }) => { used = model; },
          });
          const got = readKick(data, ids);
          const ai = { ...this.ktData.ai };
          for (const [id, v] of Object.entries(got)) ai[id] = { ...v, at: Date.now(), model: used };
          this.ktData.ai = ai;
          this.ktSave();
        }
      } catch (e) {
        this._ktAiFailed = Date.now();
        this.ktAiError = e?.message || 'Die KI hat gerade keine Antwort.';
      } finally {
        this.ktAiBusy = false;
        this.ktAiStatus = '';
      }
    },
  }));
}
