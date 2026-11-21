// Dashboard: key statistics, class mix, condition by road and recent activity.
import {$, q, on, api, codes, label, swatch, deep, recordBoxes, worstCode, condition, relTime, thumbUrl, tag} from './shared.js';

api.thumbUrl = thumbUrl;

function stat(value, text, sub) {
  const el = q('div', 'stat');
  el.append(q('strong', null, value), q('span', 'tiny', text));
  if (sub) el.append(q('small', 'statsub', sub));
  return el;
}
export function roadConditions(records) {
  const roads = new Map();
  for (const r of records) {
    const key = r.road || 'Unassigned road';
    if (!roads.has(key)) roads.set(key, {frames: 0, boxes: []});
    const g = roads.get(key); g.frames++; g.boxes.push(...recordBoxes(r));
  }
  return [...roads].map(([name, g]) => ({name, frames: g.frames, boxes: g.boxes, ...condition(g.frames, g.boxes)}))
    .sort((a, b) => b.index - a.index);
}
export function renderConditions(host, records, limit = 6) {
  host.replaceChildren();
  const list = roadConditions(records);
  if (!list.length) { host.append(q('p', 'blank', 'No saved records yet. Conditions appear here after your first save.')); return; }
  for (const c of list.slice(0, limit)) {
    const row = q('div', 'condrow');
    const left = q('div');
    left.append(q('strong', null, c.name), q('small', null, c.frames + ' frame' + (c.frames === 1 ? '' : 's') + ' · ' + c.boxes.length + ' detection' + (c.boxes.length === 1 ? '' : 's')));
    const badge = q('span', 'band ' + c.cls, c.band);
    badge.title = 'Weighted damage per frame: ' + c.index.toFixed(2);
    row.append(left, badge); host.append(row);
  }
  if (list.length > limit) host.append(q('p', 'help', '+ ' + (list.length - limit) + ' more roads in the Map view.'));
}
function render(records = api.records) {
  const all = records.flatMap(recordBoxes);
  const geo = records.filter(r => r.latitude != null).length;
  const today = records.filter(r => new Date(r.updated).toDateString() === new Date().toDateString()).length;
  const worst = worstCode(all);
  $('homeStats').replaceChildren(
    stat(records.length, 'SAVED RECORDS', today ? today + ' today' : 'none today'),
    stat(all.length, 'DETECTIONS', 'above each record\'s cutoff'),
    stat(geo, 'GEOTAGGED', records.length ? Math.round(100 * geo / records.length) + '% of records' : '—'),
    stat(all.filter(b => b.code === 'D40').length, 'POTHOLES', worst ? 'worst seen: ' + worst : 'none yet'));
  const counts = Object.fromEntries(codes.map(c => [c, 0]));
  let other = 0;
  for (const b of all) { if (b.code in counts) counts[b.code]++; else other++; }
  if (other) counts.OTHER = other;
  const max = Math.max(1, ...Object.values(counts));
  const bars = $('classBars'); bars.replaceChildren();
  for (const [code, n] of Object.entries(counts)) {
    const row = q('div', 'classbar');
    const name = q('span'); name.append(tag(code), q('small', null, ' ' + label(code)));
    const track = q('div', 'track'); const fill = q('i'); fill.style.width = (100 * n / max) + '%'; fill.style.background = deep(code); track.append(fill);
    row.append(name, track, q('em', null, String(n)));
    bars.append(row);
  }
  renderConditions($('homeCondition'), records, 5);
  const recent = $('recentList'); recent.replaceChildren();
  if (!records.length) {
    const p = q('div', 'blank');
    p.append(document.createTextNode('No records yet. '), Object.assign(q('a', null, 'Survey an image'), {href: '#desk'}), document.createTextNode(' or '), Object.assign(q('a', null, 'start the live camera'), {href: '#live'}), document.createTextNode('.'));
    recent.append(p);
  }
  for (const r of records.slice(0, 5)) {
    const bs = recordBoxes(r), w = worstCode(bs);
    const row = q('button', 'recent'); row.type = 'button';
    const img = q('img'); img.alt = ''; img.loading = 'lazy'; img.src = thumbUrl(r);
    const text = q('span');
    text.append(q('strong', null, r.road || r.sample?.id || 'Record'), q('small', null, (r.origin === 'live' ? 'Live · ' : r.origin === 'video' ? 'Video · ' : '') + bs.length + ' detection' + (bs.length === 1 ? '' : 's') + ' · ' + relTime(r.updated)));
    const dot = q('i', 'sev'); dot.style.background = w ? deep(w) : '#7d8b78'; dot.title = w ? 'Worst: ' + label(w) : 'No damage';
    row.append(img, text, dot);
    row.onclick = () => api.openRecord?.(r);
    recent.append(row);
  }
}
on('records', render);
render([]);
