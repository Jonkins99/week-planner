// Wochenplan als WhatsApp-Text: *fett* für Überschriften, ein Symbol je Mahlzeit,
// nur der Titel des Gerichts. Leere Tage fallen weg.

import { MEALS, EXTRA_EMOJI } from './model.mjs';
import { WEEKDAYS, dayMonth, isoWeek, weekDays, addDays } from './dates.mjs';

export function weekText(plan, monday, titleOf = (e) => e.title) {
  const days = weekDays(monday);
  const blocks = [];
  days.forEach((iso, i) => {
    const day = plan[iso];
    if (!day) return;
    const lines = [];
    const slots = [
      ...MEALS.map((m) => ({ key: m.key, emoji: m.emoji, label: '' })),
      ...(day.extras || []).map((x) => ({ key: x.id, emoji: EXTRA_EMOJI, label: x.label })),
    ];
    for (const s of slots) {
      for (const e of day.slots?.[s.key] || []) {
        const t = String(titleOf(e, iso) || '').trim();
        const who = e.who === 'E' || e.who === 'J' ? `${e.who}: ` : '';
        if (t) lines.push(`${s.emoji} ${s.label ? `${s.label} · ` : ''}${who}${t}`);
      }
    }
    if (lines.length) blocks.push([`*${WEEKDAYS[i]}, ${dayMonth(iso)}*`, ...lines].join('\n'));
  });
  if (!blocks.length) return '';
  const head = `*Wochenplan KW ${isoWeek(monday)}* · ${dayMonth(monday)}–${dayMonth(addDays(monday, 6))}`;
  const legend = MEALS.map((m) => `${m.emoji} ${m.short}`).join('  ');
  return [head, legend, ...blocks].join('\n\n');
}
