/**
 * IndexedDB for download metadata (tracks, albums, artists, queue, lyrics).
 * Binary audio and art live in OPFS.
 */

const DB_NAME = "musicweb-downloads";
const DB_VERSION = 3;

let dbOpen: Promise<IDBDatabase> | null = null;

/** Key/value row in the "meta" store. */
export interface MetaRecord {
  key: string;
  value: unknown;
}

/**
 * @returns {Promise<IDBDatabase>}
 */
export function openDownloadsDb(): Promise<IDBDatabase> {
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
      if (db.objectStoreNames.contains("blobs")) {
        db.deleteObjectStore("blobs");
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("lyrics")) {
        db.createObjectStore("lyrics", { keyPath: "trackId" });
      }
    };
  });
  return dbOpen;
}

export function reqToPromise<T>(req: IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
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
export async function withStores<T>(
  storeNames: string[],
  mode: IDBTransactionMode,
  fn: (stores: Record<string, IDBObjectStore>, tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDownloadsDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(
      storeNames.map((n) => [n, tx.objectStore(n)])
    );
    let result!: T;
    let settled = false;
    const fail = (err: unknown) => {
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
export async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest | Promise<T>,
): Promise<T> {
  return withStores([storeName], mode, async (stores) => {
    const store = stores[storeName];
    if (!store) throw new Error(`Missing object store ${storeName}`);
    const out = fn(store);
    if (out instanceof IDBRequest) return reqToPromise<T>(out);
    return out;
  });
}

export async function getAll<T>(storeName: string): Promise<T[]> {
  return withStore<T[]>(storeName, "readonly", (s) => s.getAll());
}

export async function getOne<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return withStore<T | undefined>(storeName, "readonly", (s) => s.get(key));
}

export async function putOne<T>(storeName: string, value: T): Promise<IDBValidKey> {
  return withStore<IDBValidKey>(storeName, "readwrite", (s) => s.put(value));
}

/** @param {string} storeName @param {IDBValidKey} key */
export async function deleteOne(storeName: string, key: IDBValidKey) {
  return withStore(storeName, "readwrite", (s) => s.delete(key));
}

/** @param {string} storeName */
export async function clearStore(storeName: string) {
  return withStore(storeName, "readwrite", (s) => s.clear());
}

export async function wipeDownloadsDb() {
  for (const n of [
    "tracks",
    "albums",
    "artists",
    "queue",
    "meta",
    "lyrics",
  ]) {
    try {
      await clearStore(n);
    } catch {
      /* ignore */
    }
  }
}
