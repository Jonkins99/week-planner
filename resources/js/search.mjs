// Unscharfe Suche über Rezepttitel. Reihenfolge der Treffer: ganzer Begriff im Titel,
// Wortanfang, Teilstring, dann Tippfehler-tolerant. Jedes Suchwort muss irgendwo
// passen (Titel oder notfalls Zutaten), die Reihenfolge der Wörter ist egal.

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokens(s) {
  return normalize(s).split(' ').filter(Boolean);
}

// Levenshtein mit frühem Abbruch, sobald `max` überschritten ist.
export function distance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function tokenScore(q, words, joined) {
  let best = 0;
  for (const w of words) {
    if (w === q) return 6;
    if (w.startsWith(q)) best = Math.max(best, 5);
    else if (w.includes(q)) best = Math.max(best, 3.5);
  }
  if (best) return best;
  // Komposita: „hack" findet „Hackbraten", „soße" findet „Käsesoße".
  if (joined.includes(q)) return 3;
  if (q.length >= 4) {
    const max = q.length >= 7 ? 2 : 1;
    for (const w of words) {
      const head = w.slice(0, q.length + 1);
      if (distance(q, w, max) <= max || distance(q, head, max) <= max || distance(q, w.slice(0, q.length), max) <= max) return 1.5;
    }
  }
  return 0;
}

/**
 * Treffer für `query` in `items`. `text(item)` liefert den Titel, `extra(item)` optional
 * weiteren durchsuchbaren Text (z. B. Zutaten), der nur schwach zählt.
 */
export function search(items, query, { text = (x) => x.title, extra = null, limit = Infinity } = {}) {
  const qs = tokens(query);
  if (!qs.length) return [];
  const full = normalize(query);
  const scored = [];
  for (const item of items) {
    const title = normalize(text(item));
    const words = title.split(' ').filter(Boolean);
    const joined = words.join('');
    let extraText = null;
    let score = 0;
    let ok = true;
    for (const q of qs) {
      let s = tokenScore(q, words, joined);
      if (!s && extra) {
        extraText ??= normalize(extra(item));
        if (extraText.includes(q)) s = 0.75;
      }
      if (!s) { ok = false; break; }
      score += s;
    }
    if (!ok) continue;
    if (title.startsWith(full)) score += 3;
    else if (title.includes(full)) score += 1.5;
    scored.push({ item, score, title });
  }
  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'de'));
  return scored.slice(0, limit).map((s) => s.item);
}
