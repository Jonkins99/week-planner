// Harry-Potter-Hörbücher: reine Logik des Players (unter Node testbar).
// Position = { book: 1–7, track: Index der Datei im Band, time: Sekunden }.

export const BOOKS = [
  { no: 1, roman: 'I', title: 'Der Stein der Weisen' },
  { no: 2, roman: 'II', title: 'Die Kammer des Schreckens' },
  { no: 3, roman: 'III', title: 'Der Gefangene von Askaban' },
  { no: 4, roman: 'IV', title: 'Der Feuerkelch' },
  { no: 5, roman: 'V', title: 'Der Orden des Phönix' },
  { no: 6, roman: 'VI', title: 'Der Halbblutprinz' },
  { no: 7, roman: 'VII', title: 'Die Heiligtümer des Todes' },
];

export const SKIPS = [-20, -5, -1, 1, 5, 20];
export const SLEEP_OPTIONS = [0, 10, 20, 30, 45, 60, 90];
export const MARK_AFTER_MS = 5 * 60000;

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Dateien natürlich sortieren („Kapitel 2" vor „Kapitel 10"). */
export function sortTracks(list, name = (x) => x.name) {
  return [...list].sort((a, b) => name(a).localeCompare(name(b), 'de', { numeric: true, sensitivity: 'base' }));
}

/**
 * Zu welchem Abend ein Zeitpunkt gehört: ab 20 Uhr der Tag selbst, nach Mitternacht bis
 * 6 Uhr noch der Vortag. Tagsüber null (dann wird nichts gemerkt).
 */
export function eveningKey(ts) {
  const d = new Date(ts);
  const h = d.getHours();
  if (h >= 20) return isoOf(d);
  if (h < 6) return isoOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12));
  return null;
}

/** Ist der gemerkte Abend-Startpunkt jetzt zu übernehmen? Ab 6 Uhr des Folgetags, einmalig. */
export function markDue(mark, now = Date.now()) {
  if (!mark || mark.applied || !mark.evening) return false;
  const [y, m, d] = mark.evening.split('-').map(Number);
  return now >= new Date(y, m - 1, d + 1, 6).getTime();
}

/** Nächster Titel: nächste Datei, sonst nächster Band mit Dateien (nach Band 7 wieder Band 1). */
export function advance(counts, pos) {
  if (pos.track + 1 < (counts[pos.book] || 0)) return { book: pos.book, track: pos.track + 1, time: 0 };
  for (let i = 1; i <= 7; i++) {
    const book = ((pos.book - 1 + i) % 7) + 1;
    if (counts[book] > 0) return { book, track: 0, time: 0 };
  }
  return null;
}

/**
 * Zeitsprung über Dateigrenzen hinweg. `durations[book][track]` (Sekunden) muss für die
 * berührten Dateien bekannt sein; unbekannte Dauern stoppen am Dateirand.
 */
export function seekAcross(durations, counts, pos, delta) {
  let { book, track } = pos;
  let time = pos.time + delta;
  const dur = (b, t) => durations?.[b]?.[t];
  while (time < 0 && track > 0 && dur(book, track - 1)) {
    track--;
    time += dur(book, track);
  }
  while (dur(book, track) && time > dur(book, track) && track + 1 < (counts[book] || 0)) {
    time -= dur(book, track);
    track++;
  }
  const max = dur(book, track);
  time = Math.max(0, max ? Math.min(time, max - 0.5) : time);
  return { book, track, time };
}

/** Feinheit beim Spulen: je höher der Daumen über dem Regler, desto langsamer. */
export function scrubFactor(dy) {
  if (dy < 40) return { factor: 1, label: 'Volle Geschwindigkeit' };
  if (dy < 110) return { factor: 0.5, label: 'Halbe Geschwindigkeit' };
  if (dy < 190) return { factor: 0.25, label: 'Viertel Geschwindigkeit' };
  return { factor: 0.08, label: 'Feines Spulen' };
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}
