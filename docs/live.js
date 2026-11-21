// Real-time live mode: camera detection, auto-logging with GPS and frame-by-frame video analysis.
import {$, q, toast, api, emit, on, swatch, deep, label, tag, canonicalBox, distanceM, worstCode} from './shared.js';
import {recordOperation, prefs} from './storage.js';

const video = $('liveVideo'), canvas = $('liveCanvas'), stage = $('liveStage');
const L = {
  stream: null, facing: 'environment', mode: null, running: false, paused: false, busy: false,
  dets: [], fps: 0, done: [], latency: 0, modelMs: 0, model: null, sha: null, raf: 0, saved: 0,
  watch: null, pos: null, lastLog: null, logging: false, stopVideo: false, timeline: [], fileName: '', fileUrl: null,
  frames: [document.createElement('canvas'), document.createElement('canvas')], cur: 0, shown: null, errorCount: 0
};
let detector = null;
const cutoff = () => Number($('liveThreshold').value);
const visible = () => L.dets.filter(d => d.score >= cutoff());

function status(text) { $('liveStatus').textContent = text; }
function busy(text) { $('liveBusy').hidden = !text; if (text) $('liveBusyText').textContent = text; }
function setControls() {
  const on = !!L.mode;
  $('liveStart').querySelector('span').textContent = L.mode === 'camera' ? 'Stop camera' : 'Start camera';
  $('liveStart').classList.toggle('dark', L.mode === 'camera');
  $('liveStart').classList.toggle('accent', L.mode !== 'camera');
  $('livePause').disabled = !on;
  $('livePause').querySelector('span').textContent = L.paused ? 'Resume' : 'Pause';
  $('livePause').querySelector('use').setAttribute('href', L.paused ? '#i-play' : '#i-pause');
  $('liveSwitch').disabled = L.mode !== 'camera';
  $('liveSnap').disabled = !on || !L.shown;
  $('liveStop').disabled = !on;
  $('liveEmpty').hidden = on;
  $('liveHud').hidden = !on;
  $('liveDot').classList.toggle('recording', L.mode === 'camera' && !L.paused);
  $('liveSource').textContent = L.mode === 'camera' ? (L.paused ? 'PAUSED · ' : 'LIVE · ') + (L.facing === 'user' ? 'FRONT CAMERA' : 'REAR CAMERA')
    : L.mode === 'video' ? 'VIDEO · ' + L.fileName.toUpperCase().slice(0, 28) : 'CAMERA OFF';
}

async function loadDetector() {
  if (!detector) detector = await import('./model/detector.js');
  if (!detector.modelReady()) {
    busy('Loading the road-damage model…');
    await detector.preload({onProgress: (t, p) => busy(Number.isFinite(p) && p < 100 ? 'Downloading the model… ' + p + '%' : t)});
  }
  busy(null);
  const info = detector.modelReady();
  $('hudBackend').textContent = 'WASM' + ((info?.backend?.webgpuInBrowser) ? ' · WebGPU not in bundle' : '');
}

function cameraError(err) {
  const name = err?.name || '';
  if (!window.isSecureContext) return 'The camera needs a secure (https) address. Open the GitHub Pages site or localhost.';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera permission was blocked. Allow Camera for this site in the browser settings, then tap Start camera again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device. You can still analyse a video file.';
  if (name === 'NotReadableError' || name === 'AbortError') return 'The camera is busy in another app. Close it and try again.';
  return 'The camera could not start. ' + (err?.message || '');
}

async function openStream(constraints) {
  return navigator.mediaDevices.getUserMedia({audio: false, video: constraints});
}
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) { const m = cameraError({}); status(m); toast(m, {type: 'error', timeout: 8000}); return; }
  stopAll(false);
  busy('Starting the camera…');
  try {
    let stream;
    try { stream = await openStream({facingMode: {ideal: L.facing}, width: {ideal: 1280}, height: {ideal: 720}}); }
    catch (err) { if (err?.name === 'OverconstrainedError') stream = await openStream(true); else throw err; }
    L.stream = stream;
    video.srcObject = stream; video.removeAttribute('src');
    await video.play();
    const settings = stream.getVideoTracks()[0]?.getSettings?.() || {};
    if (settings.facingMode) L.facing = settings.facingMode === 'user' ? 'user' : 'environment';
    L.mode = 'camera'; L.paused = false; L.dets = []; L.shown = null; L.done = [];
    $('timelineWrap').hidden = true;
    setControls();
    await loadDetector();
    status('Point the camera at the road surface. Boxes appear when damage is found.');
    loop();
  } catch (err) {
    busy(null);
    const m = cameraError(err); status(m); toast(m, {type: 'error', timeout: 9000});
    stopAll(false);
  }
}
async function switchCamera() {
  if (L.mode !== 'camera') return;
  const before = L.stream?.getVideoTracks()[0]?.getSettings?.().deviceId;
  L.facing = L.facing === 'environment' ? 'user' : 'environment';
  L.stream?.getTracks().forEach(t => t.stop());
  try {
    let stream = await openStream({facingMode: {ideal: L.facing}, width: {ideal: 1280}, height: {ideal: 720}});
    const after = stream.getVideoTracks()[0]?.getSettings?.().deviceId;
    if (after && after === before) {
      // Laptops ignore facingMode; cycle to the next camera instead.
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
      if (cams.length > 1) {
        const next = cams[(cams.findIndex(c => c.deviceId === before) + 1) % cams.length];
        stream.getTracks().forEach(t => t.stop());
        stream = await openStream({deviceId: {exact: next.deviceId}});
      } else toast('Only one camera is available on this device.');
    }
    L.stream = stream; video.srcObject = stream; await video.play();
    L.dets = []; setControls();
  } catch (err) { const m = cameraError(err); status(m); toast(m, {type: 'error'}); stopAll(); }
}

function stopAll(announce = true) {
  cancelAnimationFrame(L.raf); L.raf = 0;
  L.stopVideo = true; L.videoToken = (L.videoToken || 0) + 1;
  if (L.stream) { L.stream.getTracks().forEach(t => t.stop()); L.stream = null; }
  if (L.mode === 'camera' && announce) status('Camera stopped.');
  video.pause(); video.srcObject = null;
  L.mode = null; L.paused = false; L.dets = []; L.shown = null; L.busy = false;
  busy(null); setGps(false); draw(); setControls(); updateReadout();
}

function loop() {
  cancelAnimationFrame(L.raf);
  const tick = () => {
    L.raf = requestAnimationFrame(tick);
    draw();
    // Drop frames while the worker is busy: only one inference is ever in flight.
    if (L.mode === 'camera' && !L.paused && !L.busy && !document.hidden && video.readyState >= 2) infer();
  };
  L.raf = requestAnimationFrame(tick);
}

function grab() {
  const c = L.frames[L.cur];
  const vw = video.videoWidth, vh = video.videoHeight;
  const scale = Math.min(1, 1280 / Math.max(vw, vh));
  c.width = Math.round(vw * scale); c.height = Math.round(vh * scale);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c;
}
async function infer() {
  if (!video.videoWidth) return null;
  L.busy = true;
  const t0 = performance.now();
  try {
    const frame = grab();
    const r = await detector.detect(frame, {threshold: 0.05});
    const now = performance.now();
    L.dets = r.detections; L.latency = now - t0; L.modelMs = r.elapsedMs; L.model = r.model; L.sha = r.modelSha256;
    L.shown = frame; L.cur = 1 - L.cur;
    L.done.push(now); while (L.done.length && now - L.done[0] > 2000) L.done.shift();
    L.fps = L.done.length > 1 ? (L.done.length - 1) / ((now - L.done[0]) / 1000) : 1000 / L.latency;
    L.errorCount = 0;
    updateReadout(); setControls();
    if (L.mode === 'camera') maybeAutoLog();
    return r;
  } catch (err) {
    if (++L.errorCount >= 3) { status('Detection stopped. ' + err.message); toast('Detection failed: ' + err.message, {type: 'error'}); L.paused = true; setControls(); }
    return null;
  } finally { L.busy = false; }
}

function updateReadout() {
  const v = visible();
  $('fps').textContent = L.mode ? L.fps.toFixed(1) : '0.0';
  $('latency').textContent = L.latency ? Math.round(L.latency) : '—';
  $('liveCount').textContent = v.length;
  $('liveBoxes').textContent = v.length;
  $('liveSaved').textContent = L.saved;
  const counts = new Map(); v.forEach(d => counts.set(d.code, (counts.get(d.code) || 0) + 1));
  $('liveLegend').replaceChildren(...[...counts].map(([c, n]) => tag(c, n)));
}

function contentRect(W, H) {
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const s = Math.min(W / vw, H / vh);
  return {x: (W - vw * s) / 2, y: (H - vh * s) / 2, w: vw * s, h: vh * s};
}
function draw() {
  const W = stage.clientWidth, H = stage.clientHeight, d = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(W * d) || canvas.height !== Math.round(H * d)) { canvas.width = Math.round(W * d); canvas.height = Math.round(H * d); }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!L.mode) return;
  const r = contentRect(W, H);
  ctx.font = '700 12px ui-monospace, Consolas, monospace';
  ctx.textBaseline = 'top';
  for (const det of visible()) {
    const [x, y, w, h] = det.box;
    const px = r.x + x * r.w, py = r.y + y * r.h, pw = w * r.w, ph = h * r.h;
    const col = swatch(det.code);
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#0008'; ctx.strokeRect(px, py, pw, ph);
    ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.strokeRect(px, py, pw, ph);
    const text = det.code + ' ' + Math.round(det.score * 100) + '%';
    const tw = ctx.measureText(text).width + 8;
    const ly = py - 18 < r.y ? py : py - 18;
    ctx.fillStyle = col; ctx.fillRect(Math.min(px, r.x + r.w - tw), ly, tw, 18);
    ctx.fillStyle = '#19211b'; ctx.fillText(text, Math.min(px, r.x + r.w - tw) + 4, ly + 3);
  }
}

// ---- Snapshot and auto-log ----
async function snapshot(auto = false) {
  const frame = L.mode === 'video' ? grab() : L.shown;
  if (!frame || !frame.width) { toast('Wait for the first detection, then try again.'); return null; }
  const blob = await new Promise(res => frame.toBlob(res, 'image/jpeg', 0.86));
  if (!blob) { toast('Could not capture this frame.', {type: 'error'}); return null; }
  const now = new Date();
  const name = L.mode === 'video' ? L.fileName + ' @ ' + fmt(video.currentTime) : (auto ? 'Auto-log ' : 'Live ') + now.toLocaleString();
  const pos = L.pos;
  const rec = {
    id: crypto.randomUUID(), updated: now.toISOString(), created: now.toISOString(), origin: L.mode === 'video' ? 'video' : 'live',
    sample: {id: name, split: 'Field upload', country: 'Field', src: null, boxes: []}, blob,
    activeLayer: 'ai', layers: {reference: [], ai: L.dets.map(d => canonicalBox(d.code, d.box, 'Detector', d.score))},
    model: L.model, modelSha256: L.sha, elapsedMs: L.modelMs, ran: true,
    road: $('liveRoad').value.trim(), notes: auto ? 'Auto-logged from the live camera.' : (L.mode === 'video' ? 'Saved from video analysis.' : 'Saved from the live camera.'),
    latitude: pos ? Number(pos.lat.toFixed(6)) : null, longitude: pos ? Number(pos.lon.toFixed(6)) : null,
    accuracyM: pos ? Math.round(pos.acc) : null, cutoff: cutoff()
  };
  try {
    await recordOperation('put', rec);
    L.saved++; updateReadout();
    await api.refreshRecords?.();
    const n = visible().length;
    toast((auto ? 'Auto-logged' : 'Saved') + ': ' + n + ' box' + (n === 1 ? '' : 'es') + (pos ? ' · geotagged' : ''), {type: 'success', action: 'Review', onAction: () => { stopAll(); api.openRecord?.(rec); }});
    return rec;
  } catch {
    toast('Could not save. Check available browser storage.', {type: 'error'});
    return null;
  }
}
function maybeAutoLog() {
  if (!$('autoLog').checked || !L.pos || L.logging || !visible().length) return;
  const now = Date.now();
  const gap = Math.max(2, Number($('logGap').value) || 5) * 1000;
  const dist = Math.max(0, Number($('logDist').value) || 0);
  if (L.lastLog && (now - L.lastLog.t < gap || distanceM([L.lastLog.lat, L.lastLog.lon], [L.pos.lat, L.pos.lon]) < dist)) return;
  L.lastLog = {t: now, lat: L.pos.lat, lon: L.pos.lon};
  L.logging = true;
  snapshot(true).finally(() => { L.logging = false; });
}
function setGps(onState) {
  if (!onState) {
    if (L.watch !== null) navigator.geolocation?.clearWatch(L.watch);
    L.watch = null; L.pos = null;
    if ($('autoLog').checked) $('autoLog').checked = false;
    $('gpsState').textContent = 'GPS is off. Turn on auto-log to save geotagged detections automatically.';
    emit('livepos', null);
    return;
  }
  if (!navigator.geolocation) { $('gpsState').textContent = 'Location is not available in this browser.'; $('autoLog').checked = false; return; }
  $('gpsState').textContent = 'Waiting for GPS…';
  L.watch = navigator.geolocation.watchPosition(p => {
    L.pos = {lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy || 0, t: p.timestamp};
    $('gpsState').textContent = 'GPS on · ±' + Math.round(L.pos.acc) + ' m · ' + L.pos.lat.toFixed(5) + ', ' + L.pos.lon.toFixed(5) + (L.mode === 'camera' ? '' : ' · start the camera to log');
    emit('livepos', L.pos);
  }, err => {
    $('gpsState').textContent = err.code === 1 ? 'Location permission was blocked. Allow Location for this site to auto-log.' : 'GPS signal unavailable. Try outdoors with a clear sky.';
    if (err.code === 1) { $('autoLog').checked = false; navigator.geolocation.clearWatch(L.watch); L.watch = null; }
  }, {enableHighAccuracy: true, maximumAge: 4000, timeout: 30000});
}

// ---- Video file analysis ----
const fmt = s => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return m + ':' + String(Math.floor(s % 60)).padStart(2, '0'); };
function seek(t) {
  return new Promise(res => {
    const done = () => { clearTimeout(timer); res(); };
    const timer = setTimeout(done, 4000);
    video.addEventListener('seeked', done, {once: true});
    video.currentTime = t;
  });
}
async function ensureDuration() {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  await seek(1e7); await seek(0);
  return Number.isFinite(video.duration) ? video.duration : 0;
}
async function analyseVideo(file) {
  stopAll(false);
  if (!file.type.startsWith('video/')) { toast('Choose a video file (MP4, WebM or MOV).', {type: 'error'}); return; }
  if (L.fileUrl) URL.revokeObjectURL(L.fileUrl);
  L.fileUrl = URL.createObjectURL(file); L.fileName = file.name || 'video';
  video.srcObject = null; video.src = L.fileUrl; video.muted = true;
  busy('Opening the video…');
  try {
    await new Promise((res, rej) => { video.onloadeddata = res; video.onerror = () => rej(Error('This video format is not supported by the browser.')); });
    const duration = await ensureDuration();
    if (!duration) throw Error('Could not read the video length.');
    L.mode = 'video'; L.paused = false; L.timeline = []; L.stopVideo = false; L.done = [];
    const run = L.videoToken;
    $('timelineWrap').hidden = false; $('videoSummary').hidden = true;
    setControls();
    await loadDetector();
    loop();
    const step = Math.max(0.5, duration / 600);
    status('Analysing the video every ' + step.toFixed(1) + ' s…');
    for (let t = 0; t <= duration && !L.stopVideo && run === L.videoToken; t += step) {
      while (L.paused && !L.stopVideo && run === L.videoToken) await new Promise(r => setTimeout(r, 150));
      if (L.stopVideo || run !== L.videoToken) break;
      await seek(Math.min(t, Math.max(0, duration - 0.05)));
      const r = await infer();
      if (r) L.timeline.push({t: video.currentTime, dets: r.detections});
      $('videoProgress').textContent = Math.round(100 * t / duration) + '% · ' + fmt(t) + ' / ' + fmt(duration);
      drawTimeline(duration);
    }
    if (run !== L.videoToken) return;
    const finished = !L.stopVideo;
    $('videoProgress').textContent = (finished ? 'Done' : 'Stopped') + ' · ' + L.timeline.length + ' moments checked';
    summarise(duration);
    if (L.mode === 'video') { L.paused = true; setControls(); }
    status(finished ? 'Analysis finished. Tap the timeline to jump to a moment, then Snapshot & save to keep it.' : 'Analysis stopped. Tap the timeline to review what was checked.');
    toast(finished ? 'Video analysis finished.' : 'Video analysis stopped.', {type: 'success'});
  } catch (err) {
    busy(null); status(err.message); toast(err.message, {type: 'error', timeout: 7000});
    if (L.mode !== 'video') stopAll(false);
  }
}
function drawTimeline(duration) {
  const c = $('timeline'), W = c.clientWidth, H = c.clientHeight, d = Math.min(devicePixelRatio || 1, 2);
  if (!W) return;
  c.width = Math.round(W * d); c.height = Math.round(H * d);
  const ctx = c.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.fillStyle = '#2b332c'; ctx.fillRect(0, 0, W, H);
  const max = Math.max(3, ...L.timeline.map(s => s.dets.filter(x => x.score >= cutoff()).length));
  const bw = Math.max(2, W / Math.max(1, L.timeline.length) - 1);
  for (const s of L.timeline) {
    const v = s.dets.filter(x => x.score >= cutoff());
    const x = (s.t / duration) * (W - bw);
    if (!v.length) { ctx.fillStyle = '#3c463d'; ctx.fillRect(x, H - 3, bw, 3); continue; }
    const h = Math.max(4, (H - 4) * v.length / max);
    ctx.fillStyle = deep(worstCode(v)); ctx.fillRect(x, H - h, bw, h);
  }
  ctx.fillStyle = '#fff'; ctx.fillRect((video.currentTime / duration) * W - 1, 0, 2, H);
}
function summarise(duration) {
  const counts = new Map(); let withDamage = 0, total = 0;
  for (const s of L.timeline) {
    const v = s.dets.filter(x => x.score >= cutoff());
    if (v.length) withDamage++;
    total += v.length;
    v.forEach(x => counts.set(x.code, (counts.get(x.code) || 0) + 1));
  }
  const stat = (v, t) => { const el = q('div', 'stat'); el.append(q('strong', null, v), q('span', 'tiny', t)); return el; };
  $('videoStats').replaceChildren(stat(fmt(duration), 'VIDEO LENGTH'), stat(L.timeline.length, 'MOMENTS CHECKED'), stat(withDamage, 'WITH DAMAGE'), stat(total, 'DETECTIONS'));
  $('videoClasses').replaceChildren(...[...counts].sort((a, b) => b[1] - a[1]).map(([c, n]) => { const t = tag(c, n); t.append(document.createTextNode(' ' + label(c))); return t; }));
  $('videoSummary').hidden = false;
}
$('timeline').addEventListener('click', async e => {
  if (L.mode !== 'video' || !L.timeline.length) return;
  const r = e.currentTarget.getBoundingClientRect();
  const t = (e.clientX - r.left) / r.width * video.duration;
  let best = L.timeline[0];
  for (const s of L.timeline) if (Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
  L.paused = true; setControls();
  await seek(best.t);
  L.dets = best.dets; L.shown = grab(); updateReadout(); setControls(); drawTimeline(video.duration);
  $('videoProgress').textContent = 'Viewing ' + fmt(best.t);
});

// ---- Wiring ----
$('liveThreshold').value = prefs.get('liveCutoff', 0.35);
$('liveCutoff').value = Number($('liveThreshold').value).toFixed(2);
$('liveThreshold').oninput = () => {
  $('liveCutoff').value = cutoff().toFixed(2); prefs.set('liveCutoff', cutoff()); updateReadout();
  if (L.mode === 'video' && L.timeline.length) { drawTimeline(video.duration); summarise(video.duration); }
};
$('liveRoad').value = prefs.get('liveRoad', '');
$('liveRoad').onchange = () => prefs.set('liveRoad', $('liveRoad').value.trim());
$('liveStart').onclick = () => (L.mode === 'camera' ? stopAll() : startCamera());
$('liveStop').onclick = () => stopAll();
$('liveSwitch').onclick = switchCamera;
$('livePause').onclick = () => {
  if (!L.mode) return;
  L.paused = !L.paused;
  if (L.mode === 'camera') { if (L.paused) video.pause(); else video.play().catch(() => {}); }
  status(L.paused ? 'Paused. Tap Snapshot & save to keep this frame.' : 'Detecting…');
  setControls();
};
$('liveSnap').onclick = () => snapshot(false);
$('videoStop').onclick = () => { L.stopVideo = true; };
$('videoFile').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) analyseVideo(f); };
$('autoLog').onchange = () => setGps($('autoLog').checked);
document.addEventListener('visibilitychange', () => { if (document.hidden && L.mode === 'camera') status('Paused while the app is in the background.'); });
on('route', route => {
  if (route !== 'live' && L.mode === 'camera') { stopAll(); toast('Camera stopped while you are away from Live camera.'); }
  if (route !== 'live' && L.mode === 'video' && !L.paused) { L.paused = true; setControls(); }
  if (route === 'live') requestAnimationFrame(draw);
});
video.addEventListener('resize', fitStage);
video.addEventListener('loadedmetadata', fitStage);
function fitStage() { if (video.videoWidth) stage.style.setProperty('--ar', video.videoWidth + ' / ' + video.videoHeight); }
new ResizeObserver(() => { draw(); if (L.mode === 'video' && L.timeline.length) drawTimeline(video.duration); }).observe(stage);
Object.assign(api, {
  liveToggle: () => $('liveStart').click(),
  livePause: () => $('livePause').click(),
  liveSnap: () => { if (!$('liveSnap').disabled) snapshot(false); },
  liveState: () => ({mode: L.mode, fps: L.fps, latency: L.latency, modelMs: L.modelMs, boxes: visible().length, all: L.dets.length, saved: L.saved})
});
setControls();
