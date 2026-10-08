// Rückblick als Bild (1080 × 1920, Story-Format) zum Teilen über WhatsApp. Gezeichnet mit
// Canvas 2D in der Bildsprache der Rückblick-Folien: Emaillefarben, große schmale Schrift,
// Teller als Kreise. Ohne Nährwerte.

import { fmtEuro, fmtPct, fmtDiff } from './stats.mjs';

const W = 1080;
const H = 1920;
const C = {
  rim: '#1d3a8f', deep: '#132a6b', plate: '#fbfcfe', saffron: '#f4b63a', tomato: '#d9432a',
  jade: '#23917a', ink: '#14203f', soft: 'rgba(255,255,255,0.78)',
};
const FONT = '"Archivo Variable", Archivo, sans-serif';

function font(ctx, weight, size, stretch = 'condensed') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  if ('fontStretch' in ctx) ctx.fontStretch = stretch;
}

function fit(ctx, text, max) {
  let t = String(text);
  if (ctx.measureText(t).width <= max) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function plate(ctx, x, y, r, fill, rim) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (rim) {
    ctx.lineWidth = r * 0.08;
    ctx.strokeStyle = rim;
    ctx.stroke();
  }
}

function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = C.saffron;
  ctx.fill();
}

function heading(ctx, text, y, color = C.saffron) {
  font(ctx, 800, 34, 'normal');
  ctx.fillStyle = color;
  ctx.letterSpacing = '4px';
  ctx.fillText(text.toUpperCase(), 90, y);
  ctx.letterSpacing = '0px';
}

/** summary: { title, sub, stats, compare } → Promise<Blob> */
export async function renderWrappedImage({ title, sub, stats, compare, compareLabel = 'Zum Vormonat' }) {
  try { await document.fonts.load(`800 40px ${FONT}`); } catch { /* Ersatzschrift */ }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = C.rim;
  ctx.fillRect(0, 0, W, H);
  plate(ctx, 960, 150, 260, C.deep);
  plate(ctx, 960, 150, 150, C.saffron);
  plate(ctx, 1010, 1880, 150, C.deep);

  ctx.strokeStyle = 'rgba(255,255,255,0.42)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(36, 36, W - 72, H - 72, 48);
  ctx.stroke();

  font(ctx, 700, 36, 'normal');
  ctx.fillStyle = C.soft;
  ctx.letterSpacing = '5px';
  ctx.fillText((sub || 'Rückblick').toUpperCase(), 90, 170);
  ctx.letterSpacing = '0px';
  font(ctx, 900, 150);
  ctx.fillStyle = C.plate;
  ctx.fillText(fit(ctx, title, 760), 84, 310);

  let y = 400;
  // Gekocht
  ctx.fillStyle = C.plate;
  ctx.beginPath();
  ctx.roundRect(70, y, W - 140, 520, 40);
  ctx.fill();
  font(ctx, 900, 120);
  ctx.fillStyle = C.rim;
  ctx.fillText(String(stats.meals), 110, y + 130);
  const w1 = ctx.measureText(String(stats.meals)).width;
  font(ctx, 700, 40, 'normal');
  ctx.fillStyle = C.ink;
  ctx.fillText('Gerichte gekocht', 130 + w1, y + 125);
  const top = stats.top.slice(0, 5);
  top.forEach((d, i) => {
    const ty = y + 210 + i * 62;
    font(ctx, 900, 44);
    ctx.fillStyle = i === 0 ? C.tomato : C.rim;
    ctx.fillText(String(i + 1), 112, ty);
    font(ctx, 600, 38, 'normal');
    ctx.fillStyle = C.ink;
    ctx.fillText(fit(ctx, d.title, 700), 170, ty);
    font(ctx, 800, 38, 'normal');
    ctx.fillStyle = C.jade;
    ctx.textAlign = 'right';
    ctx.fillText(`${d.count}×`, W - 110, ty);
    ctx.textAlign = 'left';
  });
  if (!top.length) {
    font(ctx, 500, 36, 'normal');
    ctx.fillStyle = C.ink;
    ctx.fillText('Noch nichts eingetragen.', 110, y + 230);
  }
  y += 580;

  // Bestellt
  heading(ctx, 'Bestellt', y);
  font(ctx, 900, 112);
  ctx.fillStyle = C.plate;
  ctx.fillText(fmtPct(stats.orderRate), 84, y + 120);
  font(ctx, 600, 36, 'normal');
  ctx.fillStyle = C.soft;
  ctx.fillText(`${stats.orders}× bestellt${stats.spend ? ` · ${fmtEuro(stats.spend)}` : ''}`, 90, y + 180);
  const shops = stats.restaurants.filter((r) => r.id !== '?').slice(0, 3);
  shops.forEach((r, i) => {
    font(ctx, 600, 34, 'normal');
    ctx.fillStyle = C.plate;
    ctx.fillText(fit(ctx, `${r.name} · ${r.count}×${r.amount ? ` · ${fmtEuro(r.amount)}` : ''}`, 880), 90, y + 240 + i * 50);
  });
  y += 260 + shops.length * 50;

  // Neu entdeckt
  const fresh = stats.firsts.slice(0, 4);
  if (fresh.length) {
    heading(ctx, 'Neu entdeckt', y);
    fresh.forEach((d, i) => {
      const ty = y + 66 + i * 54;
      font(ctx, 600, 36, 'normal');
      ctx.fillStyle = C.plate;
      ctx.fillText(fit(ctx, d.title, 700), 90, ty);
      if (d.rating != null) {
        font(ctx, 800, 34, 'normal');
        ctx.fillStyle = C.saffron;
        ctx.textAlign = 'right';
        const label = String(Math.round(d.rating * 10) / 10).replace('.', ',');
        ctx.fillText(label, W - 90, ty);
        ctx.textAlign = 'left';
        star(ctx, W - 110 - ctx.measureText(label).width - 8, ty - 12, 15);
      }
    });
    y += 100 + fresh.length * 54;
  }

  // Vergleich
  const rows = (compare || []).slice(0, Math.max(0, Math.floor((H - 200 - (y + 66)) / 52) + 1)).slice(0, 4);
  if (rows.length && y < H - 280) {
    heading(ctx, compareLabel, y);
    rows.forEach((r, i) => {
      const ty = y + 66 + i * 52;
      font(ctx, 600, 34, 'normal');
      ctx.fillStyle = C.soft;
      ctx.fillText(r.label, 90, ty);
      font(ctx, 800, 34, 'normal');
      ctx.fillStyle = r.dir === 'up' ? C.saffron : r.dir === 'down' ? '#ffb3a3' : C.plate;
      ctx.textAlign = 'right';
      ctx.fillText(fmtDiff(r), W - 90, ty);
      ctx.textAlign = 'left';
    });
  }

  font(ctx, 800, 30, 'normal');
  ctx.fillStyle = C.soft;
  ctx.letterSpacing = '4px';
  ctx.textAlign = 'right';
  ctx.fillText('WEEK PLANNER', W - 90, H - 90);
  ctx.textAlign = 'left';
  ctx.letterSpacing = '0px';

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
