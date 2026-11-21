// First-run guided tour with spotlight steps. Skippable, and replayable from Help or the Dashboard.
import {q, api} from './shared.js';
import {prefs} from './storage.js';

const steps = [
  {route: 'home', title: 'Welcome to Pavement Atlas', text: 'This app finds road damage (cracks and potholes) in photos and in the live camera, and keeps a survey register. This short tour shows the main controls. It takes about a minute.'},
  {route: 'home', target: ['.bottomnav', '.topnav'], title: 'Move between screens', text: 'Use this menu to switch between the Dashboard, Survey desk, Live camera, Map and Field register.'},
  {route: 'home', target: ['#homeStats'], title: 'Your dashboard', text: 'Key numbers for your survey: saved records, detections, geotagged records and potholes. Recent records and road condition are listed below.'},
  {route: 'desk', target: ['#uploadLabel'], title: 'Open a road photo', text: 'Pick a road photo from the device. On a phone you can also tap Take photo to use the camera directly.'},
  {route: 'desk', target: ['#explorer'], title: 'Practise with reference frames', text: 'These are real Indian road photos from the RDD2022 dataset. Tap one to load it and practise.'},
  {route: 'desk', target: ['#run'], title: 'Run the detector', text: 'Tap Run detector. The AI marks damage with coloured boxes. The first run downloads the model (about 22 MB) once.'},
  {route: 'desk', target: ['.inspectControls .sliderlabel', '#threshold'], pad: 14, title: 'Confidence cutoff', text: 'Slide right to hide weak guesses, or left to see more possible damage.'},
  {route: 'desk', target: ['#boxPanel'], title: 'Review the boxes', text: 'Edit a box to change its class, accept it or reject a false alarm. Draw box adds damage the AI missed.'},
  {route: 'desk', target: ['#recordPanel'], title: 'Save a survey record', text: 'Add the road name, location and notes, then tap Save survey record. Records stay on this device.'},
  {route: 'live', target: ['#liveStart'], title: 'Live camera', text: 'Start the camera and point it at the road. Damage is boxed in real time, with FPS and speed shown on screen. Snapshot & save keeps a frame.'},
  {route: 'live', target: ['.switch'], title: 'Auto-log with GPS', text: 'Turn this on to save geotagged frames automatically whenever damage is seen and you have moved on.'},
  {route: 'register', target: ['#exportBar'], title: 'Export and back up', text: 'Download CSV, GeoJSON or JSON. Backup saves everything with photos; Import restores it on any device.'},
  {route: 'map', target: ['.mapwrap'], title: 'See damage on the map', text: 'Geotagged records appear as coloured dots. Red means pothole. Tap a dot to see the photo.'},
  {route: 'home', target: ['.mastactions'], title: 'Help is always here', text: 'Tap ? for the step-by-step guide and to replay this tour. The moon button switches light and dark themes.'}
];

let index = 0, shade, spot, card, active = false, lastFocus = null;
const visibleEl = sel => { for (const s of [].concat(sel || [])) { const el = document.querySelector(s); if (el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden') return el; } return null; };

function build() {
  shade = q('div', 'tourshade'); shade.addEventListener('click', e => { if (e.target === shade) end(); });
  spot = q('div', 'tourspot'); spot.setAttribute('aria-hidden', 'true');
  card = q('div', 'tourcard'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'tourTitle');
  card.innerHTML = '<div class="tourtop"><span class="tiny" id="tourCount"></span><button type="button" class="tourskip" id="tourSkip">Skip tour</button></div><h3 id="tourTitle"></h3><p id="tourText"></p><div class="tourdots" id="tourDots"></div><div class="touractions"><button type="button" class="small" id="tourBack">Back</button><button type="button" class="button accent" id="tourNext">Next</button></div>';
  document.body.append(shade, spot, card);
  card.querySelector('#tourSkip').onclick = () => end();
  card.querySelector('#tourBack').onclick = () => go(index - 1);
  card.querySelector('#tourNext').onclick = () => (index === steps.length - 1 ? end(true) : go(index + 1));
}
function place() {
  if (!active) return;
  const step = steps[index], el = visibleEl(step.target);
  const W = innerWidth, H = innerHeight;
  if (!el) {
    spot.hidden = true; shade.classList.add('solid');
    card.style.left = Math.max(12, (W - card.offsetWidth) / 2) + 'px';
    card.style.top = Math.max(12, (H - card.offsetHeight) / 2) + 'px';
    return;
  }
  shade.classList.remove('solid'); spot.hidden = false;
  const r = el.getBoundingClientRect(), pad = step.pad ?? 6;
  const box = {x: Math.max(4, r.left - pad), y: Math.max(4, r.top - pad), w: Math.min(W - 8, r.width + pad * 2), h: Math.min(H - 8, r.height + pad * 2)};
  Object.assign(spot.style, {left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px'});
  const cw = card.offsetWidth, ch = card.offsetHeight, gap = 12;
  let top = box.y + box.h + gap;
  if (top + ch > H - 8) top = box.y - ch - gap;
  if (top < 8) top = Math.min(H - ch - 8, Math.max(8, box.y + 12));
  let left = Math.min(W - cw - 10, Math.max(10, box.x + box.w / 2 - cw / 2));
  card.style.left = left + 'px'; card.style.top = top + 'px';
}
function go(i) {
  index = Math.max(0, Math.min(steps.length - 1, i));
  const step = steps[index];
  if (api.route?.() !== step.route) location.hash = step.route;
  card.querySelector('#tourCount').textContent = 'STEP ' + (index + 1) + ' OF ' + steps.length;
  card.querySelector('#tourTitle').textContent = step.title;
  card.querySelector('#tourText').textContent = step.text;
  card.querySelector('#tourBack').disabled = index === 0;
  card.querySelector('#tourNext').textContent = index === steps.length - 1 ? 'Finish' : 'Next';
  card.querySelector('#tourDots').replaceChildren(...steps.map((_, k) => { const d = q('i'); if (k === index) d.className = 'on'; return d; }));
  spot.hidden = true;
  setTimeout(() => {
    const el = visibleEl(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > innerHeight - 90) el.scrollIntoView({block: 'center', behavior: 'instant'});
    } else window.scrollTo(0, 0);
    requestAnimationFrame(() => { place(); card.querySelector('#tourNext').focus({preventScroll: true}); });
  }, 120);
}
function key(e) {
  if (!active) return;
  if (e.key === 'Escape') { e.preventDefault(); end(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); card.querySelector('#tourNext').click(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); if (index) go(index - 1); }
  else if (e.key === 'Tab') {
    const f = [...card.querySelectorAll('button:not([disabled])')];
    const i = f.indexOf(document.activeElement);
    e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
  }
}
export function startTour() {
  if (active) return;
  if (!card) build();
  lastFocus = document.activeElement;
  active = true; document.body.classList.add('touring');
  shade.hidden = spot.hidden = card.hidden = false;
  document.addEventListener('keydown', key, true);
  addEventListener('resize', place); addEventListener('scroll', place, true);
  go(0);
}
function end(finished = false) {
  if (!active) return;
  active = false; prefs.set('tourDone', true);
  document.body.classList.remove('touring');
  shade.hidden = spot.hidden = card.hidden = true;
  document.removeEventListener('keydown', key, true);
  removeEventListener('resize', place); removeEventListener('scroll', place, true);
  import('./shared.js').then(m => m.toast(finished ? 'Tour finished. Replay it any time from Help.' : 'Tour skipped. Replay it any time from Help (?).'));
  lastFocus?.focus?.({preventScroll: true});
}
export function maybeAutoTour() {
  if (prefs.get('tourDone') || /[?&]notour\b/.test(location.search)) return;
  setTimeout(() => { if (!document.querySelector('dialog[open]')) startTour(); }, 900);
}
