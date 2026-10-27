// Weihnachtsplaner: Datenmodell und reine Logik (ohne DOM, in Node testbar).
// advent = { name, days: [[{ id, title, status }] × 24] }, Status: buy → have → wrapped.
// people = [{ id, name, gifts: [{ id, title, status }] }], Status: idea → buy → have → wrapped.

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const STATUS = {
  idea: { label: 'Idee', icon: 'idea' },
  buy: { label: 'Besorgen', icon: 'basket' },
  have: { label: 'Vorhanden', icon: 'check' },
  wrapped: { label: 'Verpackt', icon: 'gift' },
};
export const ADVENT_FLOW = ['buy', 'have', 'wrapped'];
export const GIFT_FLOW = ['idea', 'buy', 'have', 'wrapped'];
export const DAYS = 24;

export const nextStatus = (status, flow) => flow[(flow.indexOf(status) + 1) % flow.length];

export const emptyXmas = () => ({ advent: { name: '', days: Array.from({ length: DAYS }, () => []) }, people: [] });

const cleanGift = (g, flow) => {
  const title = String(g?.title || '').trim();
  if (!title) return null;
  return { id: String(g.id || uid()), title, status: flow.includes(g.status) ? g.status : flow[0] };
};

export function sanitizeXmas(raw) {
  const out = emptyXmas();
  out.advent.name = String(raw?.advent?.name || '').slice(0, 60);
  const days = Array.isArray(raw?.advent?.days) ? raw.advent.days : [];
  for (let i = 0; i < DAYS; i++) out.advent.days[i] = (Array.isArray(days[i]) ? days[i] : []).map((g) => cleanGift(g, ADVENT_FLOW)).filter(Boolean);
  for (const p of Array.isArray(raw?.people) ? raw.people : []) {
    const name = String(p?.name || '').trim();
    if (!name) continue;
    out.people.push({ id: String(p.id || uid()), name, gifts: (Array.isArray(p.gifts) ? p.gifts : []).map((g) => cleanGift(g, GIFT_FLOW)).filter(Boolean) });
  }
  return out;
}

/** Ort eines Adventsgeschenks: { day, index } oder null. */
export function findGift(days, id) {
  for (let d = 0; d < days.length; d++) {
    const i = days[d].findIndex((g) => g.id === id);
    if (i >= 0) return { day: d, index: i };
  }
  return null;
}

/** Adventsgeschenk an Tag `toDay` (0-basiert) an Stelle `toIndex` verschieben. */
export function moveGift(days, id, toDay, toIndex = Infinity) {
  const from = findGift(days, id);
  if (!from || toDay < 0 || toDay >= days.length) return false;
  const [g] = days[from.day].splice(from.index, 1);
  // toIndex zählt wie in der Anzeige, also noch mit dem Geschenk an seinem alten Platz.
  let at = toIndex;
  if (from.day === toDay && from.index < at) at -= 1;
  days[toDay].splice(Math.max(0, Math.min(at, days[toDay].length)), 0, g);
  return true;
}

/** Zähler je Status über eine Liste von Geschenken. */
export function tally(gifts) {
  const out = { total: gifts.length, idea: 0, buy: 0, have: 0, wrapped: 0 };
  for (const g of gifts) out[g.status] += 1;
  return out;
}

/** Heutiger Adventstag (1–24) oder 0 außerhalb vom 1. bis 24. Dezember. */
export function adventToday(now = Date.now()) {
  const d = new Date(now);
  return d.getMonth() === 11 && d.getDate() <= DAYS ? d.getDate() : 0;
}
