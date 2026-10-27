// Weihnachtsplaner: Alpine-Komponente `xmas`. Eigenständig neben der Haushalts-App: eigene
// Daten (`wp-xmas-v1`) und eigener Ansichts-Zustand (`wp-xmas-ui-v1`). Zwei Reiter:
// Adventskalender (24 Türchen, Geschenke per Griff verschiebbar) und Geschenke je Person.

import { STATUS, ADVENT_FLOW, GIFT_FLOW, DAYS, uid, nextStatus, emptyXmas, sanitizeXmas, findGift, moveGift, tally, adventToday } from './xmas.mjs';
import { readJson, writeJson } from '../storage.mjs';

const KEY = 'wp-xmas-v1';
const UI = 'wp-xmas-ui-v1';
const EDGE = 64;

export function registerXmas(Alpine) {
  Alpine.data('xmas', () => ({
    XM_STATUS: STATUS,
    XM_ADVENT: ADVENT_FLOW,
    XM_GIFT: GIFT_FLOW,
    XM_DAYS: Array.from({ length: DAYS }, (_, i) => i),
    xm: emptyXmas(),
    xmTab: 'advent',
    xmAddDay: -1,
    xmAddText: '',
    xmPersonName: '',
    xmGiftText: {},
    xmForm: null,
    xmDrag: null,
    xmDrop: null,
    _xmSaveT: 0,

    init() {
      this.xm = sanitizeXmas(readJson(KEY, null));
      const ui = readJson(UI, {}) || {};
      if (ui.tab === 'people') this.xmTab = 'people';
      this.$watch('xmTab', (v) => writeJson(UI, { tab: v }));
      window.addEventListener('wp-layer-closed', (e) => { if (e.detail === 'xmas-gift') this.xmForm = null; });
    },

    xmSave() {
      clearTimeout(this._xmSaveT);
      this._xmSaveT = setTimeout(() => writeJson(KEY, this.xm), 120);
    },

    xmOpen() {
      if (!this.isOpen('xmas')) this.openLayer('xmas');
      const today = this.xmToday;
      if (today && this.xmTab === 'advent') {
        setTimeout(() => this.$root.querySelector(`[data-xm-day="${today - 1}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
      }
    },

    xmStatus(key) {
      return STATUS[key];
    },

    xmNextLabel(g, flow) {
      return STATUS[nextStatus(g.status, flow)].label;
    },

    // ---------------------------------------------------------------- Adventskalender

    get xmToday() {
      return adventToday();
    },

    get xmAdventTally() {
      return tally(this.xm.advent.days.flat());
    },

    get xmEmptyDays() {
      return this.xm.advent.days.filter((d) => !d.length).length;
    },

    xmCycle(g, flow) {
      g.status = nextStatus(g.status, flow);
      this.xmSave();
    },

    xmStartAdd(d) {
      this.xmAddDay = d;
      this.xmAddText = '';
      this.$nextTick(() => this.$root.querySelector(`[data-xm-add="${d}"]`)?.focus());
    },

    xmAddAdvent() {
      const title = this.xmAddText.trim();
      if (!title || this.xmAddDay < 0) { this.xmAddDay = -1; return; }
      this.xm.advent.days[this.xmAddDay].push({ id: uid(), title, status: 'buy' });
      this.xmAddText = '';
      this.xmSave();
    },

    xmEdit(g, d) {
      this.xmForm = { id: g.id, title: g.title, status: g.status, day: d + 1 };
      this.openLayer('xmas-gift');
    },

    xmSaveGift() {
      const f = this.xmForm;
      const at = f && findGift(this.xm.advent.days, f.id);
      if (!at) { this.closeLayer('xmas-gift'); return; }
      const g = this.xm.advent.days[at.day][at.index];
      g.title = f.title.trim() || g.title;
      g.status = f.status;
      const day = Math.max(1, Math.min(DAYS, Number(f.day) || at.day + 1)) - 1;
      if (day !== at.day) moveGift(this.xm.advent.days, g.id, day);
      this.xmSave();
      this.closeLayer('xmas-gift');
    },

    xmRemoveGift() {
      const f = this.xmForm;
      const at = f && findGift(this.xm.advent.days, f.id);
      if (at) {
        const [g] = this.xm.advent.days[at.day].splice(at.index, 1);
        this.xmSave();
        this.notify(`„${g.title}“ entfernt`);
      }
      this.closeLayer('xmas-gift');
    },

    // Ziehen am Griff: Geist folgt dem Finger, Ziel ist das Türchen bzw. die Lücke unter ihm.
    xmDragStart(ev, g) {
      if (ev.button > 0) return;
      const row = ev.currentTarget.closest('.xm-gift');
      const scroller = row.closest('.xm-scroll');
      const rect = row.getBoundingClientRect();
      const ghost = row.cloneNode(true);
      ghost.classList.add('xm-ghost');
      // Ohne x-ignore würde Alpine die Kopie samt Direktiven außerhalb der Schleife auswerten.
      ghost.setAttribute('x-ignore', '');
      ghost.removeAttribute('data-xm-gift');
      Object.assign(ghost.style, { width: `${rect.width}px`, left: `${rect.left}px`, top: `${rect.top}px` });
      this.$root.querySelector('.xm').appendChild(ghost);
      this.xmDrag = { id: g.id };
      const start = { x: ev.clientX, y: ev.clientY };
      let last = start;
      let raf = 0;
      const move = (e) => {
        last = { x: e.clientX, y: e.clientY };
        ghost.style.translate = `${e.clientX - start.x}px ${e.clientY - start.y}px`;
        this.xmHover(last.x, last.y);
      };
      const loop = () => {
        const r = scroller.getBoundingClientRect();
        const speed = last.y < r.top + EDGE ? -(r.top + EDGE - last.y) : last.y > r.bottom - EDGE ? last.y - (r.bottom - EDGE) : 0;
        if (speed) {
          scroller.scrollTop += speed / 4;
          this.xmHover(last.x, last.y);
        }
        raf = requestAnimationFrame(loop);
      };
      const end = (e) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        cancelAnimationFrame(raf);
        ghost.remove();
        const drop = this.xmDrop;
        if (e.type === 'pointerup' && drop) {
          const list = this.xm.advent.days[drop.day];
          const index = drop.id ? list.findIndex((x) => x.id === drop.id) + (drop.after ? 1 : 0) : list.length;
          if (drop.id !== g.id) moveGift(this.xm.advent.days, g.id, drop.day, index);
          this.xmSave();
        }
        this.xmDrag = null;
        this.xmDrop = null;
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      raf = requestAnimationFrame(loop);
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch { /* egal */ } }
    },

    xmHover(x, y) {
      const el = document.elementFromPoint(x, y);
      const dayEl = el?.closest('[data-xm-day]');
      if (!dayEl) { if (this.xmDrop) this.xmDrop = null; return; }
      const day = Number(dayEl.dataset.xmDay);
      const giftEl = el.closest('[data-xm-gift]');
      let next = { day, id: null, after: true };
      if (giftEl) {
        const r = giftEl.getBoundingClientRect();
        next = { day, id: giftEl.dataset.xmGift, after: y > r.top + r.height / 2 };
      }
      const cur = this.xmDrop;
      if (!cur || cur.day !== next.day || cur.id !== next.id || cur.after !== next.after) this.xmDrop = next;
    },

    xmDropClass(g, d) {
      const drop = this.xmDrop;
      if (!drop || drop.day !== d || drop.id !== g.id || g.id === this.xmDrag?.id) return '';
      return drop.after ? 'is-drop-after' : 'is-drop-before';
    },

    // ---------------------------------------------------------------- Geschenke je Person

    xmAddPerson() {
      const name = this.xmPersonName.trim();
      if (!name) return;
      this.xm.people.push({ id: uid(), name, gifts: [] });
      this.xmPersonName = '';
      this.xmSave();
    },

    xmRenamePerson(p, value) {
      const name = String(value || '').trim();
      if (name) p.name = name;
      this.xmSave();
    },

    async xmRemovePerson(p) {
      const text = p.gifts.length ? `Mit ${p.gifts.length} ${p.gifts.length === 1 ? 'Geschenk' : 'Geschenken'}.` : 'Noch ohne Geschenke.';
      if (!(await this.confirm(`${p.name} entfernen?`, text))) return;
      this.xm.people = this.xm.people.filter((x) => x.id !== p.id);
      this.xmSave();
    },

    xmAddPersonGift(p) {
      const title = String(this.xmGiftText[p.id] || '').trim();
      if (!title) return;
      p.gifts.push({ id: uid(), title, status: 'idea' });
      this.xmGiftText[p.id] = '';
      this.xmSave();
    },

    xmRemovePersonGift(p, g) {
      p.gifts = p.gifts.filter((x) => x.id !== g.id);
      this.xmSave();
      this.notify(`„${g.title}“ entfernt`);
    },

    xmPersonSummary(p) {
      const t = tally(p.gifts);
      if (!t.total) return 'Noch keine Idee';
      if (t.wrapped === t.total) return 'Alles verpackt';
      return [t.idea && `${t.idea} Idee${t.idea === 1 ? '' : 'n'}`, t.buy && `${t.buy} besorgen`, t.have && `${t.have} vorhanden`, t.wrapped && `${t.wrapped} verpackt`].filter(Boolean).join(' · ');
    },

    get xmPeopleTally() {
      return tally(this.xm.people.flatMap((p) => p.gifts));
    },
  }));
}
