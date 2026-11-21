// Public browser entry point. Pixels and model bytes stay on this device.
import {letterboxGeometry, planarRgb} from './decode.mjs';

const settingsUrl = new URL('./config.json', import.meta.url);
let configPromise;
let worker;
let sequence = 0;
const waiting = new Map();

export async function settings() {
  if (!configPromise) {
    configPromise = fetch(settingsUrl).then(async response => {
      if (!response.ok) throw new Error('The model configuration could not be loaded.');
      const config = await response.json();
      const allowed = ['D00', 'D10', 'D20', 'D40', 'OTHER'];
      if (!Array.isArray(config.classes) || !config.classes.length ||
          !config.classes.every(c => allowed.includes(c)) ||
          new Set(config.classes).size !== config.classes.length ||
          !Number.isInteger(config.size) || config.size < 32 || config.size > 1536 ||
          !Number.isFinite(config.nmsIou) || config.nmsIou <= 0 || config.nmsIou >= 1 ||
          !/^[a-f0-9]{64}$/.test(config.sha256) || !config.title ||
          !/^\.\/[A-Za-z0-9_.-]+\.onnx$/.test(config.weights)) {
        throw new Error('Invalid detector configuration.');
      }
      return config;
    }).catch(error => {configPromise = undefined; throw error;});
  }
  return configPromise;
}

function inferenceWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./inference-worker.mjs', import.meta.url), {type: 'module'});
  worker.onmessage = event => {
    const {id, progress, error, result} = event.data;
    const task = waiting.get(id);
    if (!task) return;
    if (progress) {task.onProgress(progress, event.data.percent); return;}
    waiting.delete(id);
    if (error) task.reject(new Error(error));
    else task.resolve(result);
  };
  worker.onerror = () => {
    worker.terminate();
    worker = undefined;
    for (const task of waiting.values()) {
      task.reject(new Error('The detector worker failed. Reload in a recent browser and verify the local model assets.'));
    }
    waiting.clear();
  };
  return worker;
}

let canvas, ctx;
// Fires a page-level event so any view can show model loading progress.
const announce = (text, percent) => self.dispatchEvent?.(new CustomEvent('pa-model', {detail: {text, percent}}));
let ready = null;
export function modelReady() { return ready; }

// Load and verify the model without running a frame (used by live mode and the offline button).
export async function preload({onProgress = () => {}} = {}) {
  const config = await settings();
  const engine = inferenceWorker();
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    waiting.set(id, {onProgress: (t, p) => {announce(t, p); onProgress(t, p);}, resolve: r => {ready = r; announce('ready', 100); resolve(r);}, reject: e => {announce('error', null); reject(e);}});
    engine.postMessage({id, type: 'load', config});
  });
}

export async function detect(image, {threshold = 0.25, onProgress = () => {}} = {}) {
  const width = image.naturalWidth || image.videoWidth || image.width;
  const height = image.naturalHeight || image.videoHeight || image.height;
  if (!(width > 0 && height > 0)) throw new Error('Decode a road photograph before running detection.');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('Invalid confidence threshold.');
  const config = await settings();
  const size = config.size;
  const geometry = letterboxGeometry(width, height, size);
  if (!canvas || canvas.width !== size) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    ctx = canvas.getContext('2d', {willReadFrequently: true});
  }
  ctx.fillStyle = 'rgb(114,114,114)';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, geometry.left, geometry.top, geometry.scaledWidth, geometry.scaledHeight);
  const data = planarRgb(ctx.getImageData(0, 0, size, size).data);
  const engine = inferenceWorker();
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    waiting.set(id, {onProgress: (t, p) => {if (p !== undefined) announce(t, p); onProgress(t, p);}, resolve: r => {if (!ready) {ready = {ready: true, backend: {name: r.backend || 'wasm'}, model: r.model}; announce('ready', 100);} resolve(r);}, reject: e => {if (!ready) announce('error', null); reject(e);}});
    try {engine.postMessage({id, data, geometry, threshold, config}, [data.buffer]);}
    catch (error) {waiting.delete(id); reject(error);}
  });
}
