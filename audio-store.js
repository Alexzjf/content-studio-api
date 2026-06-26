/**
 * Shared IndexedDB store for audio buffers (avoids huge sendMessage payloads).
 */
const AudioStore = (() => {
  const DB_NAME = "content-studio-audio";
  const STORE = "audio";
  const DB_VERSION = 1;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  }

  async function put(float32Array) {
    const id = `audio-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(float32Array, id);
    await txDone(tx);
    db.close();
    return id;
  }

  async function get(id) {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    const value = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    db.close();
    return value;
  }

  async function remove(id) {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
    db.close();
  }

  return { put, get, remove };
})();

if (typeof window !== "undefined") {
  window.AudioStore = AudioStore;
}
