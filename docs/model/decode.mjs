// The supported output is one static, unfiltered Ultralytics Detect head (batch 1).
export function overlap(a, b) {
  const width = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const height = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const intersection = width * height;
  const union = a[2] * a[3] + b[2] * b[3] - intersection;
  return union > 0 ? intersection / union : 0;
}

export function letterboxGeometry(width, height, size) {
  const scale = Math.min(size / width, size / height);
  const scaledWidth = Math.max(1, Math.round(width * scale));
  const scaledHeight = Math.max(1, Math.round(height * scale));
  return {scaledWidth, scaledHeight, left: Math.floor((size - scaledWidth) / 2),
    top: Math.floor((size - scaledHeight) / 2)};
}

export function planarRgb(rgba) {
  const pixels = rgba.length / 4;
  const out = new Float32Array(pixels * 3);
  for (let i = 0; i < pixels; i++) {
    out[i] = rgba[i * 4] / 255;
    out[pixels + i] = rgba[i * 4 + 1] / 255;
    out[2 * pixels + i] = rgba[i * 4 + 2] / 255;
  }
  return out;
}

const unit = value => Math.min(1, Math.max(0, value));

export function decode(output, geometry, classes, threshold, nmsIou) {
  const [batch, channels, count] = output.dims;
  if (output.dims.length !== 3 || batch !== 1 || channels !== 4 + classes.length || count < 1) {
    throw new Error('The model output shape does not match the configured class order and raw Detect head.');
  }
  const {data} = output;
  const {left, top, scaledWidth, scaledHeight} = geometry;
  const candidates = [];
  for (let i = 0; i < count; i++) {
    let best = 0;
    for (let c = 1; c < classes.length; c++) {
      if (data[(4 + c) * count + i] > data[(4 + best) * count + i]) best = c;
    }
    const score = data[(4 + best) * count + i];
    if (!Number.isFinite(score) || score < threshold || score <= 0 || score > 1) continue;
    const cx = data[i], cy = data[count + i];
    const halfW = data[count * 2 + i] / 2, halfH = data[count * 3 + i] / 2;
    const x = unit((cx - halfW - left) / scaledWidth), y = unit((cy - halfH - top) / scaledHeight);
    const w = unit((cx + halfW - left) / scaledWidth) - x;
    const h = unit((cy + halfH - top) / scaledHeight) - y;
    if (w > 0 && h > 0) candidates.push({code: classes[best], score, box: [x, y, w, h]});
  }
  const kept = [];
  candidates.sort((a, b) => b.score - a.score);
  for (const detection of candidates) {
    if (kept.some(old => old.code === detection.code && overlap(old.box, detection.box) > nmsIou)) continue;
    kept.push(detection);
    if (kept.length === 300) break;
  }
  return kept;
}
