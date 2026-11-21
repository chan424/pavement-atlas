// Local survey database (IndexedDB). Version 2 adds a settings store and
// normalises records saved by version 1 in place. Nothing is deleted.
export const SCHEMA = 2;
function normalise(r) {
  if (!r || typeof r !== 'object') return r;
  r.layers = r.layers && typeof r.layers === 'object' ? r.layers : {reference: [], ai: []};
  r.layers.reference = Array.isArray(r.layers.reference) ? r.layers.reference : [];
  r.layers.ai = Array.isArray(r.layers.ai) ? r.layers.ai : [];
  if (!['reference', 'ai'].includes(r.activeLayer)) r.activeLayer = 'reference';
  r.sample = r.sample || {id: r.id, split: 'Field upload', country: 'Field', src: null, boxes: []};
  r.updated = r.updated || new Date().toISOString();
  r.created = r.created || r.updated;
  r.origin = r.origin || 'desk';
  r.road = r.road || '';
  r.notes = r.notes || '';
  if (r.latitude === undefined || r.latitude === '') r.latitude = null;
  if (r.longitude === undefined || r.longitude === '') r.longitude = null;
  if (!Number.isFinite(r.cutoff)) r.cutoff = 0.25;
  r.schema = SCHEMA;
  return r;
}
const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('pavement-atlas-surveys', SCHEMA);
  request.onupgradeneeded = event => {
    const db = request.result;
    if (!db.objectStoreNames.contains('records')) db.createObjectStore('records', {keyPath: 'id'});
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', {keyPath: 'key'});
    if (event.oldVersion >= 1 && event.oldVersion < 2) {
      // Migrate version 1 records inside the upgrade transaction.
      const store = request.transaction.objectStore('records');
      store.openCursor().onsuccess = e => {
        const cursor = e.target.result;
        if (!cursor) return;
        try { cursor.update(normalise(cursor.value)); } catch { /* keep the original record */ }
        cursor.continue();
      };
      request.transaction.objectStore('meta').put({key: 'migratedFrom', value: event.oldVersion, at: new Date().toISOString()});
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(Error('Close other Pavement Atlas tabs to finish the database upgrade.'));
});
database.catch(() => {});
export async function recordOperation(action, value) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', action === 'getAll' || action === 'get' ? 'readonly' : 'readwrite');
    const store = tx.objectStore('records');
    const request = value === undefined ? store[action]() : store[action](action === 'put' ? normalise(value) : value);
    tx.oncomplete = () => resolve(action === 'getAll' ? request.result.map(normalise) : request.result);
    tx.onerror = tx.onabort = () => reject(tx.error || request.error || Error('Storage unavailable'));
  });
}
// Write many records in one transaction. Returns how many were stored.
export async function putMany(list) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    for (const r of list) store.put(normalise(r));
    tx.oncomplete = () => resolve(list.length);
    tx.onerror = tx.onabort = () => reject(tx.error || Error('Storage unavailable'));
  });
}
export async function storageEstimate() {
  try { return await navigator.storage?.estimate?.(); } catch { return null; }
}
// Small preferences live in localStorage.
export const prefs = {
  get(key, fallback = null) { try { const v = localStorage.getItem('pa:' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('pa:' + key, JSON.stringify(value)); } catch { /* private mode */ } }
};
