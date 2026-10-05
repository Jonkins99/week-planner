// Brücke zur Gemini Developer API (generativelanguage.googleapis.com).
// Bewusst ohne SDK: ein einziger POST mit fetch reicht und kostet kein Bundle.
//
// Übernommen aus jh-draft-league (dort gemini.mjs): mehrere Schlüssel, Modellkette,
// Sperrliste für erschöpfte Kontingente. Die Schlüssel liegen GERÄTELOKAL (localStorage)
// und wandern nie in eine Datensicherung.

// `free`: im kostenlosen Kontingent enthalten (Stand September 2026). Jedes Modell hat
// dort seinen EIGENEN Tageszähler — die Flash-Modelle je rund 20 Anfragen, die Lite-Modelle
// je rund 500. Deshalb lohnt der Wechsel: ist 3.8 für heute leer, hat 3.7 noch alles.
export const GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', hint: 'Aktuellstes Flash — Standard.', free: true },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', hint: 'Eigenes Tageskontingent, kaum schwächer.', free: true },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', hint: 'Eigenes Tageskontingent.', free: true },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', hint: 'Eigenes Tageskontingent.', free: true },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)', hint: 'Vorschau, eigenes Kontingent.', free: true },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', hint: 'Vorgänger — nur für Konten, die es schon genutzt haben.', free: true },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', hint: 'Reserve: ~500 am Tag, knappere Texte.', free: true, lite: true },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', hint: 'Reserve: ~500 am Tag, knappere Texte.', free: true, lite: true },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', hint: 'Letzte Reserve, nur für Altkonten.', free: true, lite: true },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)', hint: 'Nur mit Zahlungsart — stilistisch am stärksten.', free: false },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', hint: 'Vorgänger, nur für Altkonten.', free: true },
];

export const DEFAULT_MODEL = 'gemini-3.8-flash';

// Die Ausweichreihenfolge: erst alle vollwertigen Flash-Modelle (gleiche Textqualität,
// je eigenes Kontingent), dann die Lite-Reserve. Pro-Modelle bleiben draußen — sie sind
// langsam und kosten im freien Kontingent entweder nichts mehr oder sind gesperrt.
export const FALLBACK_ORDER = [
  'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash',
  'gemini-3-flash-preview', 'gemini-2.5-flash',
  'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite',
];

const isLite = (id) => !!GEMINI_MODELS.find((m) => m.id === id)?.lite || /-lite$/.test(String(id || ''));

/**
 * Die Modelle, die eine Anfrage nacheinander probiert: das gewählte zuerst, danach die
 * Ausweichreihenfolge ohne Doppelungen. `fallback: false` heißt nur das gewählte,
 * `lite: false` lässt die Lite-Reserve weg (außer sie ist selbst gewählt).
 */
export function modelChain(primary = DEFAULT_MODEL, { fallback = true, lite = true } = {}) {
  const first = primary || DEFAULT_MODEL;
  if (!fallback) return [first];
  const rest = FALLBACK_ORDER.filter((id) => id !== first && (lite || !isLite(id)));
  return [first, ...rest];
}

// Mehrere Schlüssel: Leerzeichen weg, Doppelte weg, Leere weg.
export function normalizeKeys(input) {
  const list = Array.isArray(input) ? input : [input];
  return [...new Set(list.map((k) => String((k && typeof k === 'object' ? k.key : k) || '').trim()).filter(Boolean))];
}

// Kurzes, nicht umkehrbares Kennzeichen eines Schlüssels — für die Sperrliste und die
// Anzeige, damit der Schlüssel selbst nirgends zusätzlich abgelegt wird.
export function keyTag(key) {
  const s = String(key || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// Das Tageskontingent springt um Mitternacht pazifischer Zeit zurück, nicht um
// Mitternacht bei uns (das ist 9 Uhr morgens deutscher Zeit).
export function nextPacificMidnight(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(now));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  const elapsed = (((get('hour') % 24) * 60 + get('minute')) * 60 + get('second')) * 1000 + (now % 1000);
  return now - elapsed + 86400000;
}

/**
 * Was für ein 429 war das? Die API hängt an die Fehlermeldung eine `QuotaFailure` mit der
 * Kennung des gerissenen Limits (…PerDay… / …PerMinute…) und meist eine `RetryInfo`.
 * Ein Tageslimit ist bis Mitternacht (Pazifik) verbraucht, ein Minutenlimit nach
 * Sekunden wieder frei — das eine heißt „anderes Modell", das andere „kurz warten".
 */
export function classifyQuota({ detail = '', details = [] } = {}, now = Date.now()) {
  const list = Array.isArray(details) ? details : [];
  const ids = list
    .filter((d) => /QuotaFailure/.test(String(d?.['@type'] || '')))
    .flatMap((d) => (d.violations || []).map((v) => `${v.quotaId || ''} ${v.quotaMetric || ''}`))
    .join(' ');
  const delayRaw = list.find((d) => /RetryInfo/.test(String(d?.['@type'] || '')))?.retryDelay
    || (String(detail).match(/retry in ([\d.]+)\s*s/i) || [])[1];
  const delay = delayRaw != null ? Math.ceil(parseFloat(String(delayRaw))) : null;
  const text = `${ids} ${detail}`;
  // „limit: 0" heißt: dieses Modell gibt es für das Projekt gar nicht kostenlos.
  const zero = /limit:\s*0\b/i.test(detail);
  let scope;
  if (zero || /PerDay|per[ _-]?day|daily/i.test(text)) scope = 'day';
  else if (/PerMinute|per[ _-]?minute/i.test(text)) scope = 'minute';
  else scope = delay != null && delay > 120 ? 'day' : 'minute';
  const until = scope === 'day'
    ? nextPacificMidnight(now)
    : now + Math.min(120, Math.max(15, delay ?? 60)) * 1000;
  return { scope, until, delay, zero };
}

/**
 * Gerätelokale Sperrliste: welcher Schlüssel ist mit welchem Modell bis wann erschöpft?
 * Damit fragt die App ein leeres Tageskontingent nicht bei jeder Anfrage erneut an,
 * sondern geht sofort zum nächsten Modell bzw. Schlüssel. `load`/`save` machen sie
 * persistent (localStorage in main.js), ohne dass dieses Modul den Browser kennt.
 */
export class QuotaBook {
  constructor({ load = null, save = null, now = () => Date.now() } = {}) {
    this._save = save;
    this._now = now;
    this.entries = {};
    try { this.entries = { ...(load ? load() || {} : {}) }; } catch (e) { this.entries = {}; }
    this._prune();
  }
  _k(key, model) { return `${keyTag(key)}|${model || '*'}`; }
  _prune() {
    const t = this._now();
    Object.keys(this.entries).forEach((k) => { if (!(this.entries[k]?.until > t)) delete this.entries[k]; });
  }
  _persist() { this._prune(); try { this._save?.(this.entries); } catch (e) { /* nur Komfort */ } }
  block(key, model, until, scope = 'minute', reason = '') {
    this.entries[this._k(key, model)] = { until, scope, reason, model: model || '*', tag: keyTag(key) };
    this._persist();
  }
  entry(key, model) {
    const t = this._now();
    const hit = [this.entries[this._k(key, model)], this.entries[this._k(key, '*')]].filter((e) => e?.until > t);
    return hit.sort((a, b) => b.until - a.until)[0] || null;
  }
  blocked(key, model) { return !!this.entry(key, model); }
  clear() { this.entries = {}; this._persist(); }
  list() { this._prune(); return Object.values(this.entries).sort((a, b) => a.until - b.until); }
}

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

const isGen3 = (model) => /^gemini-3/.test(String(model || ''));

// Zwei Schlüsselformate im Umlauf: die alten `AIza…` gehören in den Header `x-goog-api-key`,
// die neuen `AQ.…` („Authentication Key", seit 2026 das einzige, was AI Studio ausgibt)
// werden dort als Access-Token gelesen und mit ACCESS_TOKEN_TYPE_UNSUPPORTED abgewiesen —
// sie gehören in `Authorization: Bearer`. Schlägt das eine fehl, probiert generateJson
// automatisch das andere, damit ein Formatwechsel bei Google hier nichts umwirft.
function authHeader(apiKey, scheme) {
  return scheme === 'bearer' ? { Authorization: `Bearer ${apiKey}` } : { 'x-goog-api-key': apiKey };
}

function preferredScheme(apiKey) {
  return String(apiKey || '').startsWith('AQ.') ? 'bearer' : 'key';
}

// Alle aktuellen Modelle denken vor der Antwort, und die Denk-Tokens zählen gegen
// `maxOutputTokens`. Ohne Deckel frisst das Denken bei knappem Budget die gesamte Antwort
// auf: die Anfrage gelingt, `parts` bleibt leer, finishReason ist MAX_TOKENS. Die
// 3er-Generation steuert das über `thinkingLevel` (minimal|low|medium|high), die 2.5er über
// ein Token-Budget; beides zusammen in einer Anfrage ist ein Fehler.
function thinkingConfigFor(model, level) {
  if (isGen3(model)) return { thinkingLevel: level || 'low' };
  if (/2\.5/.test(String(model || ''))) return { thinkingBudget: level === 'minimal' ? 0 : 1024 };
  return null;
}

export class GeminiError extends Error {
  // `retryable` unterscheidet das, was beim naechsten Anlauf anders ausgehen kann
  // (Ueberlastung, Kontingent, abgeschnittene oder unlesbare Antwort), von dem, was
  // ohne Zutun nie gelingt (falscher Schluessel, unbekanntes Modell).
  constructor(message, { status = 0, detail = '', retryable = false, model = '', truncated = false, quota = null, keyError = false } = {}) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.detail = detail;
    this.retryable = retryable;
    this.model = model;
    // Abgeschnitten heisst: der naechste Anlauf braucht mehr Platz, nicht nur Geduld.
    this.truncated = truncated;
    // Kontingent gerissen: { scope: 'day'|'minute', until } — ein anderes Modell oder ein
    // anderer Schlüssel hilft sofort, derselbe erst nach `until`.
    this.quota = quota;
    // Der Schlüssel selbst taugt nicht (abgelehnt, API nicht frei) — für JEDES Modell.
    this.keyError = keyError;
  }
}

// Antwort-Schema im OpenAPI-Subset. `propertyOrdering` hilft dem Modell, die Felder in
// einer sinnvollen Reihenfolge zu erzeugen (erst denken, dann formulieren).
export function schemaOf(properties, required = []) {
  return {
    type: 'OBJECT',
    properties,
    required,
    propertyOrdering: Object.keys(properties),
  };
}

export const S = {
  string: (description) => ({ type: 'STRING', description }),
  number: (description) => ({ type: 'NUMBER', description }),
  bool: (description) => ({ type: 'BOOLEAN', description }),
  enum: (values, description) => ({ type: 'STRING', enum: values, description }),
  array: (items, description) => ({ type: 'ARRAY', items, description }),
  object: (properties, required = [], description) => ({ ...schemaOf(properties, required), description }),
};

function extractText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p?.text || '').join('').trim();
}

// Manche Antworten kommen trotz responseMimeType in einen Codeblock gewickelt.
function parseJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new GeminiError('Die Antwort war kein gültiges JSON.', { detail: cleaned.slice(0, 400), retryable: true });
  }
}

// Ein einzelner Anlauf. Die Wiederholung liegt eine Ebene darüber in `generateJson`.
async function attemptGenerate({
  apiKey, model = DEFAULT_MODEL, system, prompt, schema, media = null,
  temperature = 1.15, maxOutputTokens = 4096, signal = null, thinking = null,
}) {
  if (!apiKey) throw new GeminiError('Kein API-Key hinterlegt.');

  const think = thinkingConfigFor(model, thinking);
  // Anhänge stehen vor dem Text: das Modell soll erst hören, dann die Anweisung lesen.
  const parts = [
    ...(media || []).filter((m) => m?.data).map((m) => ({ inlineData: { mimeType: m.mimeType || 'audio/webm', data: m.data } })),
    { text: prompt },
  ];
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      // Die 3er-Generation läuft ausdrücklich auf Temperatur 1.0; abweichende Werte
      // lassen sie bei längeren Texten in Wiederholungen laufen.
      temperature: isGen3(model) ? 1 : temperature,
      topP: 0.95,
      maxOutputTokens,
      responseMimeType: 'application/json',
      ...(schema ? { responseSchema: schema } : {}),
      ...(think ? { thinkingConfig: think } : {}),
    },
    // Rezepte mit Messern, Alkohol oder rohem Fleisch sollen nicht an den
    // Standardfiltern hängen bleiben. Harte Kategorien bleiben unangetastet.
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const url = `${ENDPOINT}/${encodeURIComponent(model)}:generateContent`;
  const send = async (scheme, payload) => {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(apiKey, scheme) },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      throw new GeminiError('Gemini ist nicht erreichbar (Netzwerkfehler).', { detail: String(e), retryable: true, model });
    }
    if (res.ok) return { res, data: await res.json() };
    let detail = '';
    let reason = '';
    let details = [];
    try {
      const err = await res.json();
      detail = err?.error?.message || '';
      details = Array.isArray(err?.error?.details) ? err.error.details : [];
      reason = details.find((d) => d?.reason)?.reason || err?.error?.status || '';
    } catch (e) { /* Fehlertext nicht auswertbar — Status reicht */ }
    return { res, detail, reason, details };
  };

  const scheme = preferredScheme(apiKey);
  let out = await send(scheme, body);

  // Das Schlüsselformat sagt nur, was wahrscheinlich passt. Wird es abgewiesen, ist das
  // andere Verfahren einen Versuch wert, bevor der Fehler beim Nutzer landet.
  if (!out.res.ok && out.res.status === 401) {
    const alt = await send(scheme === 'bearer' ? 'key' : 'bearer', body);
    if (alt.res.ok || alt.res.status !== 401) out = alt;
  }

  // `thinkingLevel` ist jung; sollte es ein Modell noch nicht kennen, lieber ohne
  // Denksteuerung antworten als gar nicht.
  if (!out.res.ok && out.res.status === 400 && /thinking/i.test(out.detail || '')) {
    const { thinkingConfig, ...rest } = body.generationConfig;
    out = await send(scheme, { ...body, generationConfig: rest });
  }

  if (!out.res.ok) {
    const { res, detail = '', reason = '', details = [] } = out;
    const both = `${reason} ${detail}`;
    const msg = /ACCESS_TOKEN_TYPE_UNSUPPORTED|API_KEY_SERVICE_BLOCKED/i.test(both)
        ? 'Der Schlüssel wird für die Gemini-API nicht akzeptiert — in Google AI Studio prüfen, ob er für die Generative Language API freigegeben ist.'
      : /API_KEY_INVALID|API key not valid/i.test(both)
        ? 'Der API-Key wurde abgelehnt — bitte neu aus dem AI Studio kopieren.'
      : /SERVICE_DISABLED|has not been used in project|is disabled/i.test(detail)
        ? 'Die Generative Language API ist im Google-Projekt des Keys nicht aktiviert.'
      : res.status === 401 ? 'Der Schlüssel wurde nicht akzeptiert.'
      : res.status === 403 ? 'Zugriff verweigert — API-Key prüfen.'
      : res.status === 429 ? `Kontingent von ${model} erschöpft.`
      : res.status === 404 ? `Modell „${model}" ist für diesen Schlüssel nicht verfügbar.`
      : res.status >= 500 ? 'Gemini antwortet gerade nicht (Serverfehler).'
      : `Anfrage fehlgeschlagen (HTTP ${res.status}).`;
    // Überlastung, Kontingent und Serverfehler sind Zustände, keine Fehler in der Anfrage.
    const retryable = res.status === 429 || res.status >= 500 || res.status === 408;
    const quota = res.status === 429 ? classifyQuota({ detail, details }) : null;
    const keyError = res.status === 401
      || /ACCESS_TOKEN_TYPE_UNSUPPORTED|API_KEY_SERVICE_BLOCKED|API_KEY_INVALID|API key not valid|SERVICE_DISABLED|has not been used in project/i.test(both);
    // Den langen Wortlaut der API nur anhängen, wo er etwas erklärt — beim Kontingent
    // steht sonst ein halber Absatz Google-Text in der Kachel.
    const full = detail && res.status !== 429 ? `${msg} (${detail})` : msg;
    throw new GeminiError(full, { status: res.status, detail, retryable, model, quota, keyError });
  }

  const data = out.data;
  const blocked = data?.promptFeedback?.blockReason;
  if (blocked) throw new GeminiError(`Die Anfrage wurde blockiert (${blocked}).`, { model });
  const finish = data?.candidates?.[0]?.finishReason;
  const text = extractText(data);
  if (!text) {
    const msg = finish === 'MAX_TOKENS' ? 'Die Antwort wurde abgeschnitten — bitte erneut versuchen.'
      : finish === 'SAFETY' ? 'Die Antwort wurde von den Inhaltsfiltern gestoppt.'
      : finish === 'RECITATION' ? 'Die Antwort wurde wegen Zitat-Erkennung gestoppt.'
      : `Die Antwort war leer${finish ? ` (${finish})` : ''}.`;
    // Eine abgeschnittene oder leere Antwort geht beim nächsten Anlauf oft durch;
    // ein Inhaltsfilter dagegen nie.
    throw new GeminiError(msg, {
      detail: JSON.stringify(data?.usageMetadata || {}),
      retryable: finish === 'MAX_TOKENS' || !finish,
      model,
      truncated: finish === 'MAX_TOKENS',
    });
  }
  return parseJson(text);
}

// Wie oft ein Anlauf, der beim nächsten Mal anders ausgehen kann, auf DEMSELBEN Modell
// wiederholt wird (abgeschnittene, leere oder unlesbare Antwort).
export const GEMINI_ATTEMPTS = 3;

// Längste Wartezeit auf ein Minutenkontingent, bevor aufgegeben wird. Länger als eine
// gute Minute lohnt nicht — dann ist es ein Tageslimit oder eine echte Störung.
const MINUTE_WAIT_MAX = 75000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clockOf(ms) {
  try {
    return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  } catch (e) { return ''; }
}

/**
 * Einen JSON-Datensatz erzeugen lassen — über mehrere Modelle und Schlüssel hinweg.
 *
 * Reihenfolge: jedes Modell der Kette (`models`, sonst nur `model`) mit jedem Schlüssel
 * (`keys`, sonst `apiKey`), das Modell außen — erst wird dieselbe Textqualität auf einem
 * anderen Schlüssel versucht, dann das nächste Modell.
 *
 * - Kontingent (429): Kombination kommt in die Sperrliste (`quota`, bis Mitternacht
 *   Pazifik bzw. ein paar Sekunden), weiter zur nächsten — ohne Wartezeit. Sind am Ende
 *   nur noch Minutenkontingente gesperrt, wird einmal gewartet und neu angesetzt.
 * - Schlüssel untauglich: der Schlüssel fällt für alle Modelle aus.
 * - Modell unbekannt (404): nur diese Kombination fällt aus.
 * - Überlastung, Serverfehler, Netz: ein zweiter Anlauf nach kurzer Pause, dann weiter.
 * - Abgeschnitten, leer, unlesbar, von `accept` verworfen: bis zu `attempts` Anläufe auf
 *   derselben Kombination, jeweils mit mehr Platz und weniger Denkzeit.
 * - Alles andere (Inhaltsfilter, kaputte Anfrage) fliegt sofort hoch.
 *
 * @param {object} opts
 * @param {string|string[]} opts.keys   Schlüssel (oder `apiKey` für genau einen)
 * @param {string[]} opts.models        Modellkette (oder `model` für genau eins)
 * @param {QuotaBook} opts.quota        Sperrliste (optional)
 * @param {function} opts.accept        (data) => boolean — false heißt „unbrauchbar, nochmal"
 * @param {function} opts.onRetry       vor jedem neuen Anlauf: { attempt, error, model, next }
 * @param {function} opts.onSuccess     nach dem Erfolg: { model, keyIndex }
 */
export async function generateJson(opts) {
  const keys = normalizeKeys(opts?.keys?.length ? opts.keys : opts?.apiKey);
  if (!keys.length) throw new GeminiError('Kein API-Key hinterlegt.');
  const models = (opts?.models?.length ? opts.models : [opts?.model || DEFAULT_MODEL]).filter(Boolean);
  const book = opts?.quota || null;
  const attempts = Math.max(1, opts?.attempts ?? GEMINI_ATTEMPTS);
  const onRetry = typeof opts?.onRetry === 'function' ? opts.onRetry : null;
  const accept = typeof opts?.accept === 'function' ? opts.accept : null;
  const baseTokens = opts?.maxOutputTokens ?? 4096;
  const combos = models.flatMap((model) => keys.map((key, keyIndex) => ({ model, key, keyIndex })));
  // Ohne Sperrliste merkt sich der Aufruf selbst, was schon ausgefallen ist.
  const local = new Map();
  const isBlocked = (c) => (book ? book.blocked(c.key, c.model) : false) || (local.get(`${c.keyIndex}|${c.model}`) || local.get(`${c.keyIndex}|*`) || 0) > Date.now();
  const block = (c, until, scope, reason, allModels = false) => {
    const model = allModels ? '*' : c.model;
    local.set(`${c.keyIndex}|${model}`, until);
    if (book) book.block(c.key, allModels ? null : c.model, until, scope, reason);
  };
  // Modelle, die DIESE Anfrage als fehlerhaft abgewiesen haben (400) — für diesen
  // Aufruf übersprungen, aber kein Kontingent-Thema.
  const refused = new Set();
  let last = null;
  let attemptNo = 0;
  const notify = (error, c, next) => {
    if (!onRetry) return;
    try { onRetry({ attempt: attemptNo, attempts, error, model: c.model, next: next?.model || null }); } catch (e) { /* nur Anzeige */ }
  };

  for (let round = 0; round < 2; round++) {
    const open = combos.filter((c) => !isBlocked(c) && !refused.has(c.model));
    for (let i = 0; i < open.length; i++) {
      const c = open[i];
      if (isBlocked(c) || refused.has(c.model)) continue;
      let local429 = null;
      let transient = 0;
      let bad = null;
      for (let tries = 1; tries <= attempts; tries++) {
        attemptNo++;
        // Nach einer abgeschnittenen Antwort mehr Platz und weniger Denkzeit — sonst
        // läuft der zweite Anlauf in dieselbe Wand wie der erste.
        const grown = bad?.truncated ? Math.min(32768, Math.round(baseTokens * 1.6)) : baseTokens;
        const thinking = bad?.truncated ? 'minimal' : opts?.thinking ?? null;
        try {
          const data = await attemptGenerate({ ...opts, apiKey: c.key, model: c.model, maxOutputTokens: grown, thinking });
          if (accept && !accept(data)) {
            throw new GeminiError('Die Antwort war unbrauchbar (leer, unvollständig oder gegen eine feste Vorgabe).', { retryable: true, model: c.model });
          }
          if (opts?.onSuccess) { try { opts.onSuccess({ model: c.model, keyIndex: c.keyIndex }); } catch (e) { /* nur Anzeige */ } }
          return data;
        } catch (e) {
          if (e?.name === 'AbortError') throw e;
          last = e;
          if (e?.quota) {
            block(c, e.quota.until, e.quota.scope, e.message);
            local429 = e;
            break;
          }
          if (e?.keyError) {
            block(c, Date.now() + 6 * 3600000, 'key', e.message, true);
            break;
          }
          // Modell für diesen Schlüssel nicht zu haben (unbekannt oder nicht freigegeben).
          if (e?.status === 404 || e?.status === 403) {
            block(c, Date.now() + 6 * 3600000, 'model', e.message);
            break;
          }
          // Ein anderes Modell kennt vielleicht, was dieses abweist (Schema, Parameter).
          // Nur der Inhaltsfilter und eine blockierte Anfrage fliegen sofort hoch.
          if (e?.status === 400) {
            refused.add(c.model);
            break;
          }
          if (!e?.retryable) throw e;
          if (e.status >= 500 || e.status === 408 || (!e.status && /Netzwerk/.test(e.message))) {
            // Überlastet: einmal kurz warten, dann lieber ein anderes Modell.
            transient++;
            if (transient >= 2) break;
            notify(e, c, c);
            await wait(Math.round(1200 * (0.8 + Math.random() * 0.4)));
            continue;
          }
          bad = e;
          if (tries < attempts) {
            notify(e, c, c);
            await wait(Math.round((700 * (2 ** (tries - 1))) * (0.8 + Math.random() * 0.4)));
          }
        }
      }
      const next = open.slice(i + 1).find((x) => !isBlocked(x) && !refused.has(x.model));
      if (next) notify(local429 || last, c, next);
    }
    // Alles durch. Lohnt ein zweiter Anlauf? Nur, wenn wenigstens eine Kombination bloß
    // ein Minutenkontingent gerissen hat, das bald wieder frei ist.
    if (round > 0) break;
    const soonest = combos
      .map((c) => {
        const e = book?.entry(c.key, c.model);
        const own = Math.max(local.get(`${c.keyIndex}|${c.model}`) || 0, local.get(`${c.keyIndex}|*`) || 0);
        const until = Math.max(e?.until || 0, own);
        const scope = e?.scope || (last?.quota?.scope ?? 'minute');
        return { until, scope };
      })
      .filter((x) => x.scope === 'minute' && x.until > Date.now())
      .sort((a, b) => a.until - b.until)[0];
    if (!soonest || soonest.until - Date.now() > MINUTE_WAIT_MAX) break;
    notify(last, combos[0], combos[0]);
    await wait(Math.max(0, soonest.until - Date.now()) + 500);
  }

  // Nichts ging. Sind alle Kombinationen gesperrt, sagt die Meldung, bis wann.
  const allBlocked = combos.every((c) => isBlocked(c)) && !refused.size;
  if (allBlocked) {
    const until = combos
      .map((c) => book?.entry(c.key, c.model)?.until || Math.max(local.get(`${c.keyIndex}|${c.model}`) || 0, local.get(`${c.keyIndex}|*`) || 0))
      .filter(Boolean)
      .sort((a, b) => a - b)[0];
    const n = combos.length;
    const what = n > 1 ? `Alle ${models.length} Modelle${keys.length > 1 ? ` auf ${keys.length} Schlüsseln` : ''} sind` : `${models[0]} ist`;
    throw new GeminiError(
      `Kontingent erschöpft — ${what} für den Moment ausgeschöpft${until ? `, frühestens ab ${clockOf(until)} Uhr wieder frei` : ''}.`,
      { status: 429, retryable: true, model: models[0], quota: last?.quota || { scope: 'day', until } },
    );
  }
  throw last || new GeminiError('Die Anfrage ist gescheitert.', { model: models[0] });
}

// Schneller Funktionstest für die Einstellungen: erzeugt einen winzigen Datensatz.
export async function testKey({ apiKey, model }) {
  const out = await generateJson({
    apiKey,
    model,
    prompt: 'Antworte mit {"ok": true} und einem kurzen deutschen Gruß im Feld "gruss".',
    schema: schemaOf({ ok: S.bool(), gruss: S.string() }, ['ok', 'gruss']),
    temperature: 0.2,
    maxOutputTokens: 512,
    thinking: 'minimal',
  });
  return out;
}
