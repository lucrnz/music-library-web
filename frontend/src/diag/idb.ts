/**
 * Diagnostic outbox (separate from downloads IDB).
 */

const DB_NAME = "musicweb-diag";
const DB_VERSION = 1;
const STORE = "outbox";

let opening: Promise<IDBDatabase | null> | null = null;

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IDB transaction aborted"));
  });
}

export function openDiagDb(): Promise<IDBDatabase | null> {
  if (opening) return opening;
  if (typeof indexedDB === "undefined") {
    opening = Promise.resolve(null);
    return opening;
  }
  opening = new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest;
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

export async function outboxPut(record: object): Promise<number | null> {
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

export async function outboxAll(): Promise<unknown[]> {
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

export async function outboxDelete(ids: number[]): Promise<void> {
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
