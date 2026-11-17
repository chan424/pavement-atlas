import * as ort from './vendor/ort.wasm.min.mjs';
import {decode} from './decode.mjs';

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL('./vendor/', import.meta.url).href;
let engine;
let queue = Promise.resolve();

async function load(config) {
  const response = await fetch(new URL(config.weights, import.meta.url));
  if (!response.ok) throw new Error('The bundled ONNX model could not be loaded. Verify the published model directory.');
  const bytes = await response.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hex = Array.from(digest, n => n.toString(16).padStart(2, '0')).join('');
  if (hex !== config.sha256) throw new Error('Model checksum mismatch. Re-deploy the matching model and configuration.');
  return ort.InferenceSession.create(new Uint8Array(bytes), {executionProviders: ['wasm']});
}

async function run({id, data, geometry, threshold, config}) {
  if (!engine) {
    self.postMessage({id, progress: 'Loading and verifying the road-damage model…'});
    engine = load(config).catch(error => {engine = undefined; throw error;});
  }
  const session = await engine;
  self.postMessage({id, progress: 'Inspecting the road surface…'});
  const input = new ort.Tensor('float32', data, [1, 3, config.size, config.size]);
  let outputs;
  try {
    const start = performance.now();
    outputs = await session.run({[session.inputNames[0]]: input});
    const detections = decode(outputs[session.outputNames[0]], geometry, config.classes, threshold, config.nmsIou);
    const elapsedMs = performance.now() - start;
    self.postMessage({id, result: {model: config.title, modelSha256: config.sha256, threshold, detections, elapsedMs}});
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
