// Zeitdiagramm für Messwerte (SVG, ohne Bibliothek).
// - x-Achse zeitlich exakt: Abstände entsprechen der echten Zeit zwischen den Messungen
// - Zielbereich als Band, Wasserwechsel als senkrechte Marken
// - Zoomen (Zwei-Finger, Mausrad, Knöpfe) und Verschieben (Ziehen), Antippen wählt einen Punkt
// Mehrere Diagramme teilen sich über `onView` denselben Ausschnitt.

const DAY = 86400000;
const HOUR = 3600000;
const MIN_SPAN = 2 * HOUR;
const DRAW_MS = 900;

const STEPS = [
  { ms: HOUR, kind: 'h' }, { ms: 3 * HOUR, kind: 'h' }, { ms: 6 * HOUR, kind: 'h' }, { ms: 12 * HOUR, kind: 'h' },
  { ms: DAY, kind: 'd' }, { ms: 2 * DAY, kind: 'd' }, { ms: 7 * DAY, kind: 'w' }, { ms: 14 * DAY, kind: 'w' },
  { ms: 30 * DAY, kind: 'm', months: 1 }, { ms: 91 * DAY, kind: 'm', months: 3 }, { ms: 182 * DAY, kind: 'm', months: 6 },
  { ms: 365 * DAY, kind: 'y', months: 12 },
];

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const pad = (n) => String(n).padStart(2, '0');

function ticksFor(t0, t1, width) {
  const span = t1 - t0;
  const step = STEPS.find((s) => (s.ms / span) * width >= 62) || STEPS[STEPS.length - 1];
  const out = [];
  if (step.months) {
    const d = new Date(t0);
    let m = new Date(d.getFullYear(), d.getMonth() - (d.getMonth() % step.months), 1);
    while (m.getTime() <= t1) {
      if (m.getTime() >= t0) out.push({ at: m.getTime(), label: step.kind === 'y' ? String(m.getFullYear()) : `${MON[m.getMonth()]} ${String(m.getFullYear()).slice(2)}` });
      m = new Date(m.getFullYear(), m.getMonth() + step.months, 1);
    }
    return out;
  }
  const first = new Date(t0);
  let cur;
  if (step.kind === 'h') {
    cur = new Date(first.getFullYear(), first.getMonth(), first.getDate(), first.getHours()).getTime();
  } else {
    cur = new Date(first.getFullYear(), first.getMonth(), first.getDate()).getTime();
    if (step.kind === 'w') { const wd = (new Date(cur).getDay() + 6) % 7; cur -= wd * DAY; }
  }
  for (let guard = 0; cur <= t1 && guard < 400; guard++) {
    const d = new Date(cur);
    const aligned = step.kind !== 'h' || d.getHours() % (step.ms / HOUR) === 0;
    if (cur >= t0 && aligned) {
      const label = step.kind === 'h'
        ? (d.getHours() === 0 ? `${d.getDate()}.${d.getMonth() + 1}.` : `${pad(d.getHours())}:00`)
        : step.kind === 'd' && step.ms === DAY ? `${WD[d.getDay()]} ${d.getDate()}.` : `${d.getDate()}.${d.getMonth() + 1}.`;
      out.push({ at: cur, label });
    }
    // Sommerzeit: Tagesschritte über Kalendertage, nicht über feste 24 h
    if (step.kind === 'h') cur += HOUR;
    else { const n = new Date(cur); n.setDate(n.getDate() + step.ms / DAY); cur = n.getTime(); }
  }
  return out;
}

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(Math.round(v / step) * step);
  return { ticks: out, step };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class TimeChart {
  constructor(el, { onSelect = () => {}, onView = () => {}, height = 196 } = {}) {
    this.el = el;
    this.onSelect = onSelect;
    this.onView = onView;
    this.height = height;
    this.data = { series: [], marks: [], target: null, param: { label: '', unit: '', digits: 1 } };
    this.view = null;
    this.selected = null;
    this.drawStart = 0;
    this.pointers = new Map();
    this.width = el.clientWidth || 320;
    this.ro = new ResizeObserver(() => {
      const w = this.el.clientWidth;
      if (w && Math.abs(w - this.width) > 1) { this.width = w; this.render(); }
    });
    this.ro.observe(el);
    this.bind();
  }

  setData(data, { animate = true } = {}) {
    this.data = { ...this.data, ...data };
    if (animate) this.drawStart = performance.now();
    this.render();
  }

  setView(view) {
    this.view = view;
    this.render();
  }

  setSelected(id) {
    this.selected = id;
    this.render();
  }

  destroy() {
    this.ro.disconnect();
    this.el.innerHTML = '';
  }

  // ---------------------------------------------------------------- Geometrie

  get plot() {
    return { l: 42, r: 14, t: 16, b: 28, w: Math.max(60, this.width - 56), h: this.height - 44 };
  }

  x(at) {
    const [t0, t1] = this.view;
    return this.plot.l + ((at - t0) / (t1 - t0)) * this.plot.w;
  }

  timeAt(px) {
    const [t0, t1] = this.view;
    return t0 + ((px - this.plot.l) / this.plot.w) * (t1 - t0);
  }

  yDomain() {
    const [t0, t1] = this.view;
    const pad = (t1 - t0) * 0.02;
    const vis = this.data.series.filter((p) => p.at >= t0 - pad && p.at <= t1 + pad).map((p) => p.v);
    const all = vis.length ? vis : this.data.series.map((p) => p.v);
    const tg = this.data.target || {};
    const vals = [...all, tg.min, tg.max].filter((v) => v != null && Number.isFinite(v));
    if (!vals.length) return [0, 1];
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const span = hi - lo || Math.max(Math.abs(hi) * 0.2, 1);
    lo -= span * 0.14;
    hi += span * 0.14;
    if (Math.min(...vals) >= 0 && lo < 0) lo = 0;
    return [lo, hi];
  }

  // ---------------------------------------------------------------- Zeichnen

  render() {
    if (!this.view) return;
    const { l, t, w, h } = this.plot;
    const H = this.height;
    const W = this.width;
    const [lo, hi] = this.yDomain();
    const y = (v) => t + h - ((v - lo) / (hi - lo)) * h;
    const { series, marks, target, param } = this.data;
    const [t0, t1] = this.view;
    const id = this.uid ||= `c${Math.random().toString(36).slice(2, 8)}`;
    const elapsed = this.drawStart ? performance.now() - this.drawStart : DRAW_MS;
    const drawing = elapsed < DRAW_MS;
    const delay = `animation-delay:${-Math.round(Math.min(elapsed, DRAW_MS))}ms`;
    const parts = [];

    parts.push(`<defs><clipPath id="${id}-clip"><rect x="${l}" y="${t - 8}" width="${w}" height="${h + 16}"/></clipPath>
      <linearGradient id="${id}-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity="0.28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>`);

    // Raster und y-Beschriftung
    const yt = niceTicks(lo, hi, 4);
    for (const v of yt.ticks) {
      const yy = y(v);
      if (yy < t - 1 || yy > t + h + 1) continue;
      parts.push(`<line class="ch-grid" x1="${l}" x2="${l + w}" y1="${yy}" y2="${yy}"/>`);
      const txt = v.toLocaleString('de-DE', { maximumFractionDigits: yt.step < 1 ? (yt.step < 0.1 ? 2 : 1) : 0 });
      parts.push(`<text class="ch-ylab" x="${l - 8}" y="${yy + 4}">${txt}</text>`);
    }

    // Zielbereich
    if (target && (target.min != null || target.max != null)) {
      const top = target.max != null ? Math.max(t, y(target.max)) : t;
      const bot = target.min != null ? Math.min(t + h, y(target.min)) : t + h;
      if (bot > top) parts.push(`<rect class="ch-band" x="${l}" y="${top}" width="${w}" height="${bot - top}"/>`);
      if (target.max != null && y(target.max) >= t && y(target.max) <= t + h) parts.push(`<line class="ch-limit" x1="${l}" x2="${l + w}" y1="${y(target.max)}" y2="${y(target.max)}"/>`);
      if (target.min != null && y(target.min) >= t && y(target.min) <= t + h) parts.push(`<line class="ch-limit" x1="${l}" x2="${l + w}" y1="${y(target.min)}" y2="${y(target.min)}"/>`);
    }

    // x-Achse
    for (const tk of ticksFor(t0, t1, w)) {
      const xx = this.x(tk.at);
      parts.push(`<line class="ch-xgrid" x1="${xx}" x2="${xx}" y1="${t}" y2="${t + h}"/>`);
      parts.push(`<text class="ch-xlab" x="${xx}" y="${H - 8}">${esc(tk.label)}</text>`);
    }

    // Wasserwechsel-Marken
    parts.push(`<g clip-path="url(#${id}-clip)">`);
    for (const m of marks) {
      if (m.at < t0 || m.at > t1) continue;
      const xx = this.x(m.at);
      parts.push(`<g class="ch-wc${m.derived ? '' : ' is-logged'}"><line x1="${xx}" x2="${xx}" y1="${t + 4}" y2="${t + h}"/>
        <path transform="translate(${xx - 6} ${t - 10})" d="M6 0C6 0 0 7 0 10.5a6 6 0 0 0 12 0C12 7 6 0 6 0Z"/></g>`);
    }

    // Linie, Fläche, Punkte (nur das Sichtbare plus je ein Nachbar für die Verbindung)
    const first = Math.max(0, series.findIndex((p) => p.at >= t0) - 1);
    let lastIdx = series.length - 1;
    for (let i = 0; i < series.length; i++) if (series[i].at > t1) { lastIdx = i; break; }
    const vis = series.slice(first < 0 ? 0 : first, lastIdx + 1);
    if (vis.length > 1) {
      const pts = vis.map((p) => `${this.x(p.at).toFixed(1)},${y(p.v).toFixed(1)}`);
      const d = `M${pts.join('L')}`;
      const area = `${d}L${this.x(vis[vis.length - 1].at).toFixed(1)},${t + h}L${this.x(vis[0].at).toFixed(1)},${t + h}Z`;
      parts.push(`<path class="ch-area${drawing ? ' is-drawing' : ''}" style="${delay}" d="${area}" fill="url(#${id}-fill)"/>`);
      parts.push(`<path class="ch-line${drawing ? ' is-drawing' : ''}" style="${delay}" d="${d}" pathLength="1"/>`);
    }
    const sel = series.find((p) => p.m.id === this.selected);
    if (sel && sel.at >= t0 && sel.at <= t1) {
      parts.push(`<line class="ch-guide" x1="${this.x(sel.at)}" x2="${this.x(sel.at)}" y1="${t}" y2="${t + h}"/>`);
    }
    vis.forEach((p, i) => {
      if (p.at < t0 - (t1 - t0) * 0.05 || p.at > t1 + (t1 - t0) * 0.05) return;
      const out = target && ((target.min != null && p.v < target.min) || (target.max != null && p.v > target.max));
      const isSel = p.m.id === this.selected;
      const pd = drawing ? `animation-delay:${Math.round(Math.min(i * 35, 500) - elapsed)}ms` : '';
      parts.push(`<circle class="ch-pt${out ? ' is-out' : ''}${isSel ? ' is-sel' : ''}${drawing ? ' is-drawing' : ''}" style="${pd}" cx="${this.x(p.at).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${isSel ? 6.5 : 4.5}"/>`);
    });
    parts.push('</g>');

    if (sel && sel.at >= t0 && sel.at <= t1) {
      const xx = Math.min(Math.max(this.x(sel.at), l + 30), l + w - 30);
      const yy = Math.max(t + 14, y(sel.v) - 14);
      const txt = `${sel.v.toLocaleString('de-DE', { maximumFractionDigits: 2 })}${param.unit ? ` ${param.unit}` : ''}`;
      parts.push(`<g class="ch-badge" transform="translate(${xx} ${yy})"><rect x="${-(txt.length * 3.6 + 9)}" y="-13" width="${txt.length * 7.2 + 18}" height="20" rx="10"/><text y="1">${esc(txt)}</text></g>`);
    }

    if (!series.length) parts.push(`<text class="ch-empty" x="${l + w / 2}" y="${t + h / 2}">Noch keine Werte</text>`);

    this.el.innerHTML = `<svg class="ch" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(param.label)} im Zeitverlauf">${parts.join('')}</svg>`;
    if (drawing && !this.raf) {
      this.raf = requestAnimationFrame(() => { this.raf = 0; this.render(); });
    }
  }

  // ---------------------------------------------------------------- Gesten

  bind() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      try { el.setPointerCapture?.(e.pointerId); } catch { /* synthetischer Zeiger */ }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      if (this.pointers.size === 2) this.pinch = this.pinchState();
      this.panFrom = this.view ? [...this.view] : null;
      this.panX = e.clientX;
      this.moved = false;
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p || !this.view) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (Math.abs(p.x - p.sx) > 6 || Math.abs(p.y - p.sy) > 6) this.moved = true;
      if (this.pointers.size >= 2 && this.pinch) {
        const now = this.pinchState();
        const scale = this.pinch.dist / Math.max(20, now.dist);
        const [a, b] = this.pinch.view;
        const span = (b - a) * scale;
        const rect = el.getBoundingClientRect();
        const anchor = a + ((this.pinch.mid - rect.left - this.plot.l) / this.plot.w) * (b - a);
        const rel = (now.mid - rect.left - this.plot.l) / this.plot.w;
        this.onView([anchor - rel * span, anchor - rel * span + span]);
        return;
      }
      if (this.pointers.size === 1 && this.moved && this.panFrom) {
        const [a, b] = this.panFrom;
        const dt = ((e.clientX - this.panX) / this.plot.w) * (b - a);
        this.onView([a - dt, b - dt]);
      }
    });
    const end = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 1) {
        const [rest] = this.pointers.values();
        this.panFrom = [...this.view];
        this.panX = rest.x;
      }
      if (e.type === 'pointerup' && p && !this.moved && this.pointers.size === 0) this.tap(e);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', (e) => {
      if (!this.view || (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY))) {
        if (this.view && Math.abs(e.deltaX) > 0) {
          e.preventDefault();
          const [a, b] = this.view;
          const dt = (e.deltaX / this.plot.w) * (b - a);
          this.onView([a + dt, b + dt]);
        }
        return;
      }
      if (!e.ctrlKey && !e.altKey && !e.shiftKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      this.zoomAt(this.timeAt(e.clientX - rect.left), Math.exp(e.deltaY * 0.004));
    }, { passive: false });
  }

  pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: (a.x + b.x) / 2, view: [...this.view] };
  }

  zoomAt(at, factor) {
    const [a, b] = this.view;
    const span = Math.max(MIN_SPAN, (b - a) * factor);
    const rel = (at - a) / (b - a);
    this.onView([at - rel * span, at - rel * span + span]);
  }

  tap(e) {
    const rect = this.el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const [lo, hi] = this.yDomain();
    const { t, h } = this.plot;
    const y = (v) => t + h - ((v - lo) / (hi - lo)) * h;
    let best = null;
    for (const p of this.data.series) {
      const dx = this.x(p.at) - px;
      const dy = y(p.v) - py;
      const d = Math.hypot(dx, dy * 0.6);
      if (d < 30 && (!best || d < best.d)) best = { d, p };
    }
    this.onSelect(best ? best.p.m : null);
  }
}

/** Ausschnitt begrenzen: nicht kleiner als 2 h, nicht weit über die Daten hinaus. */
export function clampView([a, b], extent) {
  let span = Math.max(MIN_SPAN, b - a);
  const [e0, e1] = extent;
  const full = Math.max(e1 - e0, DAY);
  span = Math.min(span, full * 1.6 + 2 * DAY);
  let start = a;
  const mid = start + span / 2;
  const lo = e0 - span * 0.4;
  const hi = e1 + span * 0.4;
  if (mid < lo) start = lo - span / 2;
  if (mid > hi) start = hi - span / 2;
  return [start, start + span];
}
