const database = new Promise((resolve, reject) => {
  const request = indexedDB.open('pavement-atlas-surveys', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('records', { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
database.catch(() => {});
export async function recordOperation(action, value) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', action === 'getAll' || action === 'get' ? 'readonly' : 'readwrite');
    const store = tx.objectStore('records');
    const request = value === undefined ? store[action]() : store[action](value);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error || request.error || Error('Storage unavailable'));
  });
}
