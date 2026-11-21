// Theme, model status, keyboard shortcuts and installable-app (PWA) support.
import {$, toast, api, on} from './shared.js';
import {prefs} from './storage.js';

// ---- Theme ----
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark';
  $('themeToggle').querySelector('use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
  $('themeToggle').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  document.querySelector('meta[name=theme-color]').content = dark ? '#121713' : '#1b211d';
}
export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  prefs.set('theme', next); applyTheme(next);
  window.dispatchEvent(new Event('pa-theme'));
}
applyTheme(document.documentElement.dataset.theme || 'light');
$('themeToggle').onclick = toggleTheme;

// ---- Model status chip and progress bar ----
window.addEventListener('pa-model', e => {
  const {text, percent} = e.detail;
  const chip = $('modelChip'), bar = $('modelBar');
  if (text === 'ready') {
    chip.dataset.state = 'ready'; $('modelText').textContent = 'Model ready · WASM';
    bar.hidden = true; $('homeModel').textContent = 'The detector is loaded and ready on this device (WebAssembly, runs offline once cached).';
  } else if (text === 'error') {
    chip.dataset.state = 'error'; $('modelText').textContent = 'Model error'; bar.hidden = true;
  } else if (Number.isFinite(percent)) {
    chip.dataset.state = 'loading'; $('modelText').textContent = percent < 100 ? 'Model ' + percent + '%' : 'Starting model…';
    bar.hidden = false; $('modelBarFill').style.width = percent + '%';
  }
});

// ---- Keyboard shortcuts ----
const order = ['home', 'desk', 'live', 'register', 'map', 'study', 'help'];
function typing(t) { return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && !(t.type === 'range' || t.type === 'checkbox'); }
export function showKeys() { if (!$('keysDialog').open) $('keysDialog').showModal(); }
$('keysClose').onclick = () => $('keysDialog').close();
$('helpKeys').onclick = showKeys;
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.querySelector('dialog[open]') || document.body.classList.contains('touring')) return;
  if (typing(e.target)) return;
  const k = e.key;
  if (/^[1-7]$/.test(k)) { location.hash = order[Number(k) - 1]; e.preventDefault(); return; }
  const route = api.route?.();
  switch (k.toLowerCase()) {
    case '?': showKeys(); break;
    case 't': toggleTheme(); break;
    case 'r': api.runDetector?.(); break;
    case 'b': api.toggleBoxes?.(); break;
    case 'd': api.drawBox?.(); break;
    case 's': api.saveRecord?.(); break;
    case 'arrowright': if (route === 'desk' && e.target.type !== 'range') api.galleryStep?.(1); else return; break;
    case 'arrowleft': if (route === 'desk' && e.target.type !== 'range') api.galleryStep?.(-1); else return; break;
    case 'l': if (route === 'live') api.liveToggle?.(); else return; break;
    case ' ': if (route === 'live' && e.target.tagName !== 'BUTTON') api.livePause?.(); else return; break;
    case 'c': if (route === 'live') api.liveSnap?.(); else return; break;
    default: return;
  }
  e.preventDefault();
});

// ---- Installable app + offline cache ----
let installEvent = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; $('installBtn').hidden = false; });
$('installBtn').onclick = async () => {
  if (!installEvent) return;
  installEvent.prompt();
  const choice = await installEvent.userChoice.catch(() => null);
  if (choice?.outcome === 'accepted') toast('Pavement Atlas is being installed.', {type: 'success'});
  installEvent = null; $('installBtn').hidden = true;
};
window.addEventListener('appinstalled', () => { $('installBtn').hidden = true; });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('A new version of Pavement Atlas is ready.', {action: 'Reload', onAction: () => location.reload(), timeout: 15000});
          }
        });
      });
    }).catch(() => {});
  });
}
async function offlineStatus() {
  if (!('caches' in window)) return false;
  try {
    const keys = await caches.keys();
    for (const k of keys) {
      const c = await caches.open(k);
      if (await c.match(new URL('./model/india-yolo11n.onnx', location.href).href)) return true;
    }
  } catch { /* ignore */ }
  return false;
}
async function markOffline() {
  if (await offlineStatus()) { $('offlineBtn').textContent = '✓ Available offline'; $('offlineBtn').disabled = true; }
}
markOffline();
$('offlineBtn').onclick = async () => {
  const btn = $('offlineBtn');
  btn.disabled = true; btn.textContent = 'Saving for offline…';
  try {
    if (!navigator.serviceWorker?.controller) await navigator.serviceWorker?.ready;
    const {preload} = await import('./model/detector.js');
    await preload();
    // The worker's fetches go through the service worker, which keeps the model and runtime.
    if ('caches' in window) {
      const modelCache = await caches.open('pa-model-v1');
      for (const u of ['./model/india-yolo11n.onnx', './model/vendor/ort-wasm-simd-threaded.wasm', './model/vendor/ort-wasm-simd-threaded.mjs']) {
        const abs = new URL(u, location.href).href;
        if (!(await caches.match(abs, {ignoreSearch: true}))) await modelCache.add(abs);
      }
      const runtime = await caches.open('pa-runtime-v1');
      for (const u of ['https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js']) {
        if (!(await caches.match(u))) await runtime.add(new Request(u, {mode: 'cors'})).catch(() => {});
      }
    }
    toast('Saved. The app and model now work without internet.', {type: 'success'});
    btn.textContent = '✓ Available offline';
  } catch (err) {
    toast('Could not save for offline use. ' + (err?.message || ''), {type: 'error'});
    btn.disabled = false; btn.textContent = 'Make available offline';
  }
};
window.addEventListener('offline', () => toast('You are offline. Surveys and saved records still work.', {type: 'info'}));
window.addEventListener('online', () => toast('Back online.', {type: 'success', timeout: 2500}));
on('route', () => document.querySelectorAll('dialog[open]').forEach(d => { if (d.id === 'keysDialog') d.close(); }));
