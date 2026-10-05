// Drag & Drop für Gerichte im Wochenplan, ausgelegt auf Touch.
//
// Touch: lange drücken (≈300 ms) hebt das Gericht an; wer vorher wischt, scrollt ganz
// normal. Maus: Ziehen ab 6 px Bewegung. Während des Ziehens verhindert ein
// nicht-passiver touchmove-Listener das Scrollen der Seite; gescrollt wird dann
// automatisch, sobald der Finger in die Nähe des oberen oder unteren Rands kommt.
// Wer über den Wochenpfeilen verweilt, blättert die Woche um. Im Ziel-Slot erscheinen
// Felder „Nur Elika / Beide / Nur Janik" (data-drop-who), die die Zuordnung setzen.

const HOLD_MS = 300;
const SLOP = 8;
const EDGE = 72;
const FLIP_MS = 650;

export function createDrag({ root, scroller, onDrop, onFlip, onStart }) {
  let pending = null;
  let drag = null;
  let suppressClick = false;

  const clear = () => {
    if (pending?.timer) clearTimeout(pending.timer);
    pending = null;
  };

  function start() {
    const p = pending;
    if (!p) return;
    clear();
    const rect = p.item.getBoundingClientRect();
    const ghost = p.item.cloneNode(true);
    ghost.classList.add('dish-ghost');
    ghost.removeAttribute('data-drag-entry');
    Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px` });
    document.body.appendChild(ghost);
    p.item.classList.add('is-dragging');
    document.documentElement.classList.add('is-drag-active');
    drag = {
      item: p.item,
      ghost,
      dx: p.x - rect.left,
      dy: p.y - rect.top,
      x: p.x,
      y: p.y,
      target: null,
      flip: null,
      raf: 0,
    };
    navigator.vibrate?.(12);
    onStart?.();
    place();
    drag.raf = requestAnimationFrame(tick);
  }

  function place() {
    drag.ghost.style.transform = `translate3d(${drag.x - drag.dx}px, ${drag.y - drag.dy}px, 0) rotate(-1.5deg) scale(1.03)`;
    const el = document.elementFromPoint(drag.x, drag.y);
    const flipEl = el?.closest('[data-drop-week]');
    if (flipEl) {
      const dir = Number(flipEl.dataset.dropWeek);
      if (!drag.flip || drag.flip.dir !== dir) drag.flip = { dir, at: performance.now(), el: flipEl };
      flipEl.classList.add('is-drop-hover');
    } else if (drag.flip) {
      drag.flip.el.classList.remove('is-drop-hover');
      drag.flip = null;
    }
    const slot = el?.closest('[data-drop-slot]');
    if (drag.target?.el !== slot) {
      drag.target?.el.classList.remove('is-drop-target');
      drag.target = slot ? { el: slot } : null;
      slot?.classList.add('is-drop-target');
    }
    if (drag.target) {
      const pad = el?.closest('[data-drop-who]');
      for (const n of slot.querySelectorAll('[data-drop-who]')) n.classList.toggle('is-hover', n === pad);
      drag.target.who = pad ? pad.dataset.dropWho : undefined;
      const items = [...slot.querySelectorAll('[data-drag-entry]')].filter((n) => n !== drag.item);
      let index = items.length;
      for (let i = 0; i < items.length; i++) {
        const r = items[i].getBoundingClientRect();
        if (drag.y < r.top + r.height / 2) { index = i; break; }
      }
      drag.target.index = index;
    }
  }

  function tick() {
    if (!drag) return;
    const r = scroller.getBoundingClientRect();
    let v = 0;
    if (drag.y < r.top + EDGE) v = -Math.ceil(((r.top + EDGE - drag.y) / EDGE) * 14);
    else if (drag.y > r.bottom - EDGE) v = Math.ceil(((drag.y - (r.bottom - EDGE)) / EDGE) * 14);
    if (v) {
      scroller.scrollTop += v;
      place();
    }
    if (drag.flip && performance.now() - drag.flip.at > FLIP_MS) {
      const { dir } = drag.flip;
      drag.flip.at = performance.now() + 400;
      navigator.vibrate?.(8);
      onFlip?.(dir);
      requestAnimationFrame(() => drag && place());
    }
    drag.raf = requestAnimationFrame(tick);
  }

  function end(commit) {
    if (!drag) return;
    const d = drag;
    drag = null;
    cancelAnimationFrame(d.raf);
    d.ghost.remove();
    d.item.classList.remove('is-dragging');
    d.target?.el.classList.remove('is-drop-target');
    d.flip?.el.classList.remove('is-drop-hover');
    document.documentElement.classList.remove('is-drag-active');
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 60);
    if (!commit || !d.target) return;
    const from = { iso: d.item.dataset.iso, slot: d.item.dataset.slot, id: d.item.dataset.dragEntry };
    const to = { iso: d.target.el.dataset.iso, slot: d.target.el.dataset.slot, index: d.target.index, who: d.target.who };
    onDrop?.(from, to);
  }

  root.addEventListener('pointerdown', (e) => {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const item = e.target.closest('[data-drag-entry]');
    if (!item || e.target.closest('[data-no-drag]')) return;
    clear();
    pending = { item, x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse', timer: null };
    if (!pending.mouse) pending.timer = setTimeout(start, HOLD_MS);
  });

  window.addEventListener('pointermove', (e) => {
    if (drag) {
      drag.x = e.clientX;
      drag.y = e.clientY;
      place();
      return;
    }
    if (!pending) return;
    const moved = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
    if (pending.mouse && moved > 6) start();
    else if (!pending.mouse && moved > SLOP) clear();
  }, { passive: true });

  window.addEventListener('pointerup', () => { clear(); end(true); });
  window.addEventListener('pointercancel', () => { clear(); end(false); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') end(false); });
  document.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  root.addEventListener('contextmenu', (e) => { if (pending || drag || e.target.closest('[data-drag-entry]')) e.preventDefault(); });
  root.addEventListener('click', (e) => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  return { get active() { return !!drag; }, cancel: () => { clear(); end(false); } };
}
