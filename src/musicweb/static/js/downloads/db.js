/**
 * IndexedDB for download metadata (tracks, albums, artists, queue).
 * Binary audio/art lives in OPFS (or blobs store as fallback).
 */

const DB_NAME = "musicweb-downloads";
const DB_VERSION = 1;

/** @type {Promise<IDBDatabase> | null} */
let dbOpen = null;

/**
 * @returns {Promise<IDBDatabase>}
 */
export function openDownloadsDb() {
  if (dbOpen) return dbOpen;
  dbOpen = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("tracks")) {
        const tracks = db.createObjectStore("tracks", { keyPath: "trackId" });
        tracks.createIndex("albumId", "albumId", { unique: false });
        tracks.createIndex("primaryArtistId", "primaryArtistId", {
          unique: false,
        });
      }
      if (!db.objectStoreNames.contains("albums")) {
        db.createObjectStore("albums", { keyPath: "albumId" });
      }
      if (!db.objectStoreNames.contains("artists")) {
        db.createObjectStore("artists", { keyPath: "artistId" });
      }
      if (!db.objectStoreNames.contains("queue")) {
        const queue = db.createObjectStore("queue", {
          keyPath: "id",
          autoIncrement: true,
        });
        queue.createIndex("trackCodec", "trackCodec", { unique: true });
        queue.createIndex("state", "state", { unique: false });
      }
      if (!db.objectStoreNames.contains("blobs")) {
        db.createObjectStore("blobs", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
  });
  return dbOpen;
}

/** @param {IDBRequest} req */
function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Run work inside a multi-store transaction. Only schedule IDB requests
 * (or microtasks that immediately issue more IDB requests) — no network.
 *
 * @template T
 * @param {string[]} storeNames
 * @param {IDBTransactionMode} mode
 * @param {(stores: Record<string, IDBObjectStore>, tx: IDBTransaction) => Promise<T> | T} fn
 * @returns {Promise<T>}
 */
export async function withStores(storeNames, mode, fn) {
  const db = await openDownloadsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(
      storeNames.map((n) => [n, tx.objectStore(n)])
    );
    let result;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    Promise.resolve()
      .then(() => fn(stores, tx))
      .then((v) => {
        result = v;
      })
      .catch(fail);
    tx.oncomplete = () => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error || new Error("transaction aborted"));
  });
}

/**
 * @template T
 * @param {string} storeName
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withStore(storeName, mode, fn) {
  return withStores([storeName], mode, async (stores) => {
    const out = fn(stores[storeName]);
    if (out && typeof out.then === "function") return out;
    return reqToPromise(/** @type {IDBRequest} */ (out));
  });
}

/** @param {string} storeName */
export async function getAll(storeName) {
  return withStore(storeName, "readonly", (s) => s.getAll());
}

/** @param {string} storeName @param {IDBValidKey} key */
export async function getOne(storeName, key) {
  return withStore(storeName, "readonly", (s) => s.get(key));
}

/** @param {string} storeName @param {unknown} value */
export async function putOne(storeName, value) {
  return withStore(storeName, "readwrite", (s) => s.put(value));
}

/** @param {string} storeName @param {IDBValidKey} key */
export async function deleteOne(storeName, key) {
  return withStore(storeName, "readwrite", (s) => s.delete(key));
}

/** @param {string} storeName */
export async function clearStore(storeName) {
  return withStore(storeName, "readwrite", (s) => s.clear());
}

export async function wipeDownloadsDb() {
  for (const n of ["tracks", "albums", "artists", "queue", "blobs", "meta"]) {
    try {
      await clearStore(n);
    } catch {
      /* ignore */
    }
  }
}

export { reqToPromise };
