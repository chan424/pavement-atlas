// Shared helpers used by every view of Pavement Atlas.
export const $ = id => document.getElementById(id);
export const q = (tag, cls, content) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (content !== undefined) el.textContent = content;
  return el;
};
export const names = {D00:'Longitudinal crack',D10:'Transverse crack',D20:'Alligator crack',D40:'Pothole',OTHER:'Other corruption'};
export const palette = {D00:'#dbfb72',D10:'#91dfff',D20:'#ffb96d',D40:'#ff929e',OTHER:'#d3aafe'};
// Darker variants keep markers and bars readable on light backgrounds.
export const strong = {D00:'#8fb51c',D10:'#2f9fd0',D20:'#e08a2c',D40:'#e0455a',OTHER:'#9a6bd6'};
export const severity = {D40:4,D20:3,D10:2,D00:1,OTHER:1};
export const weights = {D40:3,D20:2,D10:1,D00:1,OTHER:1};
export const codes = ['D00','D10','D20','D40'];
export const label = code => names[code] || code;
export const swatch = code => palette[code] || palette.OTHER;
export const deep = code => strong[code] || strong.OTHER;

export function canonicalBox(code, box, source, score = null) {
  return {id:crypto.randomUUID(),code,originalCode:code,originalBox:[...box],box:[...box],score,source,decision:'pending'};
}
// Boxes that count for summaries: the record's active layer, not rejected and above its saved cutoff.
export function recordBoxes(r) {
  const layer = r?.layers?.[r.activeLayer] || [];
  const cut = Number.isFinite(r?.cutoff) ? r.cutoff : 0.25;
  return layer.filter(b => b.decision !== 'rejected' && (b.score == null || b.score >= cut));
}
export function worstCode(boxes) {
  let worst = null;
  for (const b of boxes) if (!worst || (severity[b.code] || 0) > (severity[worst] || 0)) worst = b.code;
  return worst;
}
// Indicative condition band from weighted visible distress per frame. Not a PCI.
export function condition(frames, boxes) {
  if (!frames) return {band:'No data', cls:'none', index:0};
  const index = boxes.reduce((n, b) => n + (weights[b.code] || 1), 0) / frames;
  if (index < 0.5) return {band:'Good', cls:'good', index};
  if (index < 1.5) return {band:'Fair', cls:'fair', index};
  if (index < 3) return {band:'Poor', cls:'poor', index};
  return {band:'Very poor', cls:'vpoor', index};
}
export function tag(code, count) {
  const el = q('span', 'tag');
  const dot = q('i');
  dot.style.setProperty('--swatch', swatch(code));
  el.append(dot, document.createTextNode(code + (count === undefined ? '' : ' × ' + count)));
  el.title = label(code);
  return el;
}
export function button(title, listener, cls = 'small') {
  const b = q('button', cls, title);
  b.type = 'button';
  b.addEventListener('click', listener);
  return b;
}
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function relTime(iso) {
  const t = new Date(iso).getTime();
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  if (s < 86400 * 7) return Math.round(s / 86400) + ' d ago';
  return new Date(iso).toLocaleDateString();
}
export function distanceM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Toasts: short, polite messages with an optional action button.
export function toast(message, {type = 'info', action, onAction, timeout = 4200} = {}) {
  let host = $('toasts');
  if (!host) { host = q('div', 'toasts'); host.id = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.append(host); }
  const el = q('div', 'toast ' + type);
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.append(q('span', null, message));
  if (action) el.append(button(action, () => { onAction?.(); el.remove(); }, 'toastbtn'));
  const close = button('×', () => el.remove(), 'toastx');
  close.setAttribute('aria-label', 'Dismiss');
  el.append(close);
  host.append(el);
  setTimeout(() => el.classList.add('out'), timeout);
  setTimeout(() => el.remove(), timeout + 400);
  return el;
}

// Small event bus and a registry that lets modules reach each other without import cycles.
export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, {detail}));
export const on = (name, fn) => bus.addEventListener(name, e => fn(e.detail));
export const api = {records: []};

// Thumbnail URLs for records. Field photos are blobs; dataset frames have a src path.
const thumbCache = new Map();
export function thumbUrl(r) {
  if (r.blob instanceof Blob) {
    if (!thumbCache.has(r.id) || thumbCache.get(r.id).blob !== r.blob) {
      if (thumbCache.has(r.id)) URL.revokeObjectURL(thumbCache.get(r.id).url);
      thumbCache.set(r.id, {blob: r.blob, url: URL.createObjectURL(r.blob)});
    }
    return thumbCache.get(r.id).url;
  }
  return r.sample?.src || '';
}
