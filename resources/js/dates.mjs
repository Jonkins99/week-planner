// Datumslogik ohne Zeitzonen-Fallen: gerechnet wird ausschließlich mit lokalen
// Kalendertagen im Format YYYY-MM-DD, nie mit UTC-Zeitstempeln.

const pad = (n) => String(n).padStart(2, '0');

export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIso(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(iso, n) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** Montag der Woche, in der `iso` liegt. */
export function mondayOf(iso) {
  const d = parseIso(iso);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  return isoDate(d);
}

export function weekDays(monday) {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** ISO-Kalenderwoche (Woche mit dem ersten Donnerstag ist KW 1). */
export function isoWeek(iso) {
  const d = parseIso(iso);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const firstThursday = new Date(d.getFullYear(), 0, 4, 12);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  return 1 + Math.round((d - firstThursday) / 604800000);
}

export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS_SHORT = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

export function weekdayIndex(iso) {
  return (parseIso(iso).getDay() + 6) % 7;
}

/** „06.10." */
export function dayMonth(iso) {
  const [, m, d] = iso.split('-');
  return `${d}.${m}.`;
}

/** „6.–12. Okt." bzw. „29. Sep. – 5. Okt." */
export function rangeLabel(monday) {
  const a = parseIso(monday);
  const b = parseIso(addDays(monday, 6));
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}.–${b.getDate()}. ${MONTHS_SHORT[b.getMonth()]}`;
  return `${a.getDate()}. ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()}. ${MONTHS_SHORT[b.getMonth()]}`;
}

export function yearOfWeek(monday) {
  return parseIso(addDays(monday, 3)).getFullYear();
}
