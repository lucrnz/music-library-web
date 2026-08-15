/**
 * Diagnostic outbox (separate from downloads IDB).
 */

const DB_NAME = "musicweb-diag";
const DB_VERSION = 1;
const STORE = "outbox";

/** @type {Promise<IDBDatabase | null> | null} */
let opening = null;

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IDB request failed"));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IDB transaction aborted"));
  });
}

/**
 * @returns {Promise<IDBDatabase | null>}
 */
export function openDiagDb() {
  if (opening) return opening;
  if (typeof indexedDB === "undefined") {
    opening = Promise.resolve(null);
    return opening;
  }
  opening = new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onerror = () => resolve(null);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
  }).catch(() => null);
  return opening;
}

/**
 * @param {object} record
 * @returns {Promise<number | null>}
 */
export async function outboxPut(record) {
  const db = await openDiagDb();
  if (!db) return null;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const id = await reqToPromise(tx.objectStore(STORE).add(record));
    await txDone(tx);
    return typeof id === "number" ? id : null;
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<object[]>}
 */
export async function outboxAll() {
  const db = await openDiagDb();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE, "readonly");
    const rows = await reqToPromise(tx.objectStore(STORE).getAll());
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/**
 * @param {number[]} ids
 */
export async function outboxDelete(ids) {
  if (!ids?.length) return;
  const db = await openDiagDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const id of ids) store.delete(id);
    await txDone(tx);
  } catch {
    /* ignore */
  }
}

/**
 * Drop oldest rows until at most *max* remain.
 * @param {number} max
 */
export async function outboxTrim(max) {
  const rows = await outboxAll();
  if (rows.length <= max) return;
  const extra = rows
    .slice()
    .sort((a, b) => (a.id || 0) - (b.id || 0))
    .slice(0, rows.length - max)
    .map((r) => r.id)
    .filter((id) => typeof id === "number");
  await outboxDelete(extra);
}
