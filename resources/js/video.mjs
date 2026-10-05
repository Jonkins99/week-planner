// Videos an Rezepten: YouTube (inkl. Shorts) und Instagram (Reels, Posts) werden
// eingebettet, alles andere bleibt ein Link.

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const IG_ID = /^[A-Za-z0-9_-]{5,}$/;

export function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

/** Erste Video-Adresse (YouTube/Instagram) in einem beliebigen Text. */
export function findVideoUrl(text) {
  const urls = String(text || '').match(/https?:\/\/[^\s<>"')]+/gi) || [];
  return urls.find((u) => videoEmbed(u)?.embedUrl) || '';
}

export function videoEmbed(raw) {
  const url = normalizeUrl(raw);
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^(www|m)\./i, '').toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be' || /(^|\.)(youtube\.com|youtube-nocookie\.com)$/.test(host)) {
    let id = host === 'youtu.be' ? parts[0] : u.searchParams.get('v');
    let portrait = false;
    if (!id || !YT_ID.test(id)) {
      const i = parts.findIndex((p) => ['embed', 'shorts', 'live', 'v'].includes(p));
      id = i >= 0 ? parts[i + 1] : null;
      portrait = parts[i] === 'shorts';
    }
    if (!id || !YT_ID.test(id)) return { kind: 'link', url, embedUrl: null };
    const params = new URLSearchParams({ rel: '0', playsinline: '1', modestbranding: '1' });
    return { kind: 'youtube', url, portrait, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?${params}` };
  }

  if (/(^|\.)instagram\.com$/.test(host)) {
    const i = parts.findIndex((p) => ['reel', 'reels', 'p', 'tv'].includes(p));
    const id = i >= 0 ? parts[i + 1] : null;
    if (!id || !IG_ID.test(id)) return { kind: 'link', url, embedUrl: null };
    const type = parts[i] === 'p' ? 'p' : 'reel';
    return { kind: 'instagram', url, portrait: true, embedUrl: `https://www.instagram.com/${type}/${id}/embed/` };
  }

  return { kind: 'link', url, embedUrl: null };
}

export function hostLabel(raw) {
  const url = normalizeUrl(raw);
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./i, ''); } catch { return ''; }
}
