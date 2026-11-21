// Map of geotagged records and the live GPS position (Leaflet + OpenStreetMap, loaded on demand).
import {$, q, on, api, deep, label, recordBoxes, worstCode, relTime, thumbUrl, codes} from './shared.js';
import {renderConditions} from './home.js';

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
let L = null, map = null, layer = null, me = null, meCircle = null, loading = null, fitted = 0, shownOnce = false;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.css'; css.crossOrigin = '';
    css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    document.head.append(css);
    const js = document.createElement('script');
    js.src = LEAFLET + 'leaflet.js'; js.crossOrigin = '';
    js.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    js.onload = () => resolve(window.L);
    js.onerror = () => { loading = null; reject(Error('The map library could not load. Check the internet connection.')); };
    document.head.append(js);
  });
  return loading;
}

function popup(r) {
  const bs = recordBoxes(r), w = worstCode(bs);
  const box = q('div', 'mappop');
  const src = thumbUrl(r);
  if (src) { const img = q('img'); img.src = src; img.alt = 'Road photo ' + (r.sample?.id || ''); box.append(img); }
  box.append(q('strong', null, r.road || 'Unassigned road'));
  box.append(q('small', null, (r.sample?.id || '') + ' · ' + relTime(r.updated)));
  const counts = new Map(); bs.forEach(b => counts.set(b.code, (counts.get(b.code) || 0) + 1));
  const line = q('div', 'poptags');
  if (!counts.size) line.append(q('span', null, 'No damage above cutoff'));
  for (const [c, n] of counts) { const t = q('span', 'poptag'); t.style.setProperty('--c', deep(c)); t.textContent = c + ' × ' + n; t.title = label(c); line.append(t); }
  box.append(line);
  if (w) box.append(q('small', null, 'Worst: ' + label(w)));
  const open = q('button', 'small', 'Open'); open.type = 'button'; open.onclick = () => api.openRecord?.(r);
  box.append(open);
  return box;
}

function legend() {
  const host = $('mapLegend'); host.replaceChildren();
  for (const c of ['D40', 'D20', 'D10', 'D00']) {
    const row = q('span', 'legrow'); const dot = q('i'); dot.style.background = deep(c);
    row.append(dot, document.createTextNode(c + ' · ' + label(c))); host.append(row);
  }
  const row = q('span', 'legrow'); const dot = q('i'); dot.style.background = '#7d8b78';
  row.append(dot, document.createTextNode('No damage found')); host.append(row);
}

function draw(records = api.records) {
  renderConditions($('mapCondition'), records, 12);
  const geo = records.filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
  $('mapEmpty').hidden = geo.length > 0;
  // Leaflet cannot measure a hidden container; redraw when the Map view is shown.
  if (!map || !isShown()) return;
  layer.clearLayers();
  for (const r of geo) {
    const w = worstCode(recordBoxes(r));
    const m = L.circleMarker([r.latitude, r.longitude], {radius: w === 'D40' ? 10 : 8, color: '#ffffff', weight: 2.5, fillColor: w ? deep(w) : '#7d8b78', fillOpacity: 0.95, className: 'pa-marker'});
    m.bindPopup(() => popup(r), {maxWidth: 240});
    m.bindTooltip((r.road || r.sample?.id || 'Record') + (w ? ' · ' + w : ''));
    layer.addLayer(m);
  }
  // Re-fit when the set of located records changes, so new points are in view.
  if (geo.length && geo.length !== fitted) { fit(); fitted = geo.length; }
}
function fit() {
  if (!map) return;
  const pts = layer.getLayers().map(m => m.getLatLng());
  if (me) pts.push(me.getLatLng());
  if (pts.length === 1) map.setView(pts[0], 16);
  else if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.2));
}
const isShown = () => $('leaflet').offsetWidth > 0 && $('leaflet').offsetHeight > 0;
async function show() {
  try {
    if (!map) {
      L = await loadLeaflet();
      if (!isShown() || map) return;
      map = L.map('leaflet', {zoomControl: true, attributionControl: true}).setView([15.5057, 80.0499], 12); // Ongole
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
      layer = L.layerGroup().addTo(map);
      legend();
    }
    if (!isShown()) return;
    map.invalidateSize({pan: false});
    draw();
    map.fire('viewreset'); // re-project markers drawn while the view was hidden
    if (!shownOnce) { shownOnce = true; setTimeout(() => map.invalidateSize(), 250); }
  } catch (err) {
    const host = $('leaflet'); host.replaceChildren(q('p', 'blank', err.message + ' Your records are still listed in the Field register.'));
  }
}
function setMe(pos) {
  if (!map || !pos) { if (me && !pos) { me.remove(); meCircle?.remove(); me = meCircle = null; } return; }
  const ll = [pos.lat, pos.lon];
  if (!me) {
    me = L.circleMarker(ll, {radius: 7, color: '#fff', weight: 3, fillColor: '#2f7cf6', fillOpacity: 1}).addTo(map).bindTooltip('You are here');
    meCircle = L.circle(ll, {radius: pos.acc || 20, color: '#2f7cf6', weight: 1, fillOpacity: 0.08}).addTo(map);
  } else { me.setLatLng(ll); meCircle.setLatLng(ll).setRadius(pos.acc || 20); }
}
$('mapFit').onclick = () => { fit(); };
$('mapLocate').onclick = () => {
  if (!navigator.geolocation) return;
  $('mapLocate').disabled = true;
  navigator.geolocation.getCurrentPosition(p => {
    $('mapLocate').disabled = false;
    setMe({lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy});
    map?.setView([p.coords.latitude, p.coords.longitude], 16);
  }, () => { $('mapLocate').disabled = false; import('./shared.js').then(m => m.toast('Location unavailable. Allow Location for this site.', {type: 'error'})); }, {enableHighAccuracy: true, timeout: 15000});
};
on('route', r => { if (r === 'map') show(); });
on('records', recs => { if (map) draw(recs); else renderConditions($('mapCondition'), recs, 12); });
on('livepos', pos => setMe(pos));
