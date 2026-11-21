import * as ort from './vendor/ort.wasm.min.mjs';
import {decode} from './decode.mjs';

// Multi-threaded WASM needs cross-origin isolation, which GitHub Pages does not provide.
const threads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
ort.env.wasm.numThreads = threads;
ort.env.wasm.wasmPaths = new URL('./vendor/', import.meta.url).href;
let engine;
let queue = Promise.resolve();
// The vendored bundle (ort.wasm.min.mjs) ships only the WebAssembly execution provider.
const backend = {name: 'wasm', threads, webgpuInBrowser: 'gpu' in navigator, webgpuInRuntime: false};

async function fetchWithProgress(url, id) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('The bundled ONNX model could not be loaded. Verify the published model directory.');
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body || !total) return response.arrayBuffer();
  const reader = response.body.getReader();
  const out = new Uint8Array(total);
  let received = 0, last = -1;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    if (received + value.length > out.length) return (await fetch(url)).arrayBuffer();
    out.set(value, received);
    received += value.length;
    const pct = Math.floor(100 * received / total);
    if (pct !== last) { last = pct; self.postMessage({id, progress: 'Downloading the road-damage model… ' + pct + '%', percent: pct}); }
  }
  return received === total ? out.buffer : out.slice(0, received).buffer;
}

async function load(config, id) {
  const bytes = await fetchWithProgress(new URL(config.weights, import.meta.url), id);
  self.postMessage({id, progress: 'Verifying the model checksum…', percent: 100});
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hex = Array.from(digest, n => n.toString(16).padStart(2, '0')).join('');
  if (hex !== config.sha256) throw new Error('Model checksum mismatch. Re-deploy the matching model and configuration.');
  self.postMessage({id, progress: 'Starting the WebAssembly runtime…', percent: 100});
  return ort.InferenceSession.create(new Uint8Array(bytes), {executionProviders: ['wasm']});
}

function session(config, id) {
  if (!engine) {
    self.postMessage({id, progress: 'Loading and verifying the road-damage model…', percent: 0});
    engine = load(config, id).catch(error => {engine = undefined; throw error;});
  }
  return engine;
}

async function run({id, type, data, geometry, threshold, config}) {
  if (type === 'load') {
    await session(config, id);
    self.postMessage({id, result: {ready: true, backend, model: config.title}});
    return;
  }
  const s = await session(config, id);
  self.postMessage({id, progress: 'Inspecting the road surface…'});
  const input = new ort.Tensor('float32', data, [1, 3, config.size, config.size]);
  let outputs;
  try {
    const start = performance.now();
    outputs = await s.run({[s.inputNames[0]]: input});
    const detections = decode(outputs[s.outputNames[0]], geometry, config.classes, threshold, config.nmsIou);
    const elapsedMs = performance.now() - start;
    self.postMessage({id, result: {model: config.title, modelSha256: config.sha256, threshold, detections, elapsedMs, backend: backend.name}});
  } finally {
    input.dispose();
    if (outputs) Object.values(outputs).forEach(output => output.dispose());
  }
}

self.onmessage = event => {
  queue = queue.then(() => run(event.data)).catch(error => {
    self.postMessage({id: event.data.id, error: error.message || 'Detector execution failed.'});
  });
};
