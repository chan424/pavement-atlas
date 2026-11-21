// Help page: example images for each damage class, drawn from the packaged RDD2022 frames.
import {$, q, on, swatch, label, api} from './shared.js';

const examples = {
  D00: {id: 'India_001421', text: 'A crack running along the road, in the direction of traffic. Often appears at lane joints or wheel paths.'},
  D10: {id: 'India_002279', text: 'A crack running across the road, from side to side. Rare in this dataset, so the detector often misses it.'},
  D20: {id: 'India_008982', text: 'Many connected cracks forming small blocks, like crocodile skin. A sign the surface is breaking up.'},
  D40: {id: 'India_000440', text: 'A bowl-shaped hole where the surface has broken away. The most urgent type for road users.'}
};
const NS = 'http://www.w3.org/2000/svg';
function card(code, sample) {
  const el = q('figure', 'classcard');
  const frame = q('div', 'classimg');
  const img = q('img'); img.src = sample.src; img.alt = label(code) + ' example, ' + sample.id; img.loading = 'lazy';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1 1'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
  for (const b of sample.boxes.filter(b => b.label === code)) {
    const r = document.createElementNS(NS, 'rect');
    Object.entries({x: b.x, y: b.y, width: b.w, height: b.h, fill: 'none', stroke: swatch(code), 'stroke-width': 0.008, 'vector-effect': 'non-scaling-stroke'}).forEach(([k, v]) => r.setAttribute(k, v));
    r.style.strokeWidth = '3px';
    svg.append(r);
  }
  frame.append(img, svg);
  const cap = q('figcaption');
  const head = q('div', 'classhead');
  const code_ = q('span', 'classcode', code); code_.style.background = swatch(code);
  head.append(code_, q('strong', null, label(code)));
  cap.append(head, q('p', null, examples[code].text), q('small', 'meta', 'RDD2022 · ' + sample.id + ' · Arya et al., CC BY 4.0'));
  el.append(frame, cap);
  return el;
}
function render(samples) {
  const host = $('classExamples');
  if (!samples?.length || host.childElementCount) return;
  for (const code of Object.keys(examples)) {
    const s = samples.find(x => x.id === examples[code].id) || samples.find(x => x.boxes.some(b => b.label === code));
    if (s) host.append(card(code, s));
  }
}
on('samples', render);
on('route', r => { if (r === 'help') render(api.samples); });
$('helpTour').onclick = () => api.startTour?.();
$('startTour').onclick = () => api.startTour?.();
