/**
 * IndexedDB pending preferred-art queue + flush / boot / re-arm.
 * Imports apply/HTTP from upload.ts only — never submit.ts.
 */
import {
  applyPreferredServerResult,
  deletePreferredArtistImage,
  postPreferredArtistImage,
  PreferredRequestError,
} from "@/artistArt/upload";
import {
  applyEnqueue,
  recordsToFlush,
  type PendingRecord,
} from "@/artistArt/pendingPolicy";
import {
  artistArtOverlays,
  revokePreviewUrl,
} from "@/artistArt/state";
import {
  canReachServer,
  classifyError,
  isHardOffline,
  onConnectivityChange,
  onConnectivityRecovered,
  reportFailure,
  requestHealthProbe,
  setHealthWork,
} from "@/connectivity";
import { showToast } from "@/stores/ui";

const DB_NAME = "musicweb-artist-art";
const STORE = "pending";
const DB_VERSION = 1;

let opening: Promise<IDBDatabase | null> | null = null;
let flushPromise: Promise<void> | null = null;
let subscribed = false;

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

function openDb(): Promise<IDBDatabase | null> {
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
        db.createObjectStore(STORE, { keyPath: "artistId" });
      }
    };
  }).catch(() => null);
  return opening;
}

async function idbGetAll(): Promise<PendingRecord[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const tx = db.transaction(STORE, "readonly");
    const rows = await reqToPromise(tx.objectStore(STORE).getAll());
    return Array.isArray(rows) ? (rows as PendingRecord[]) : [];
  } catch {
    return [];
  }
}

async function idbGet(artistId: string): Promise<PendingRecord | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  try {
    const tx = db.transaction(STORE, "readonly");
    const row = await reqToPromise(tx.objectStore(STORE).get(artistId));
    return row as PendingRecord | undefined;
  } catch {
    return undefined;
  }
}

async function idbPut(record: PendingRecord): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(record);
  await txDone(tx);
}

async function idbDelete(artistId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(artistId);
  await txDone(tx);
}

export function rearmArtistArtHealth() {
  if (isHardOffline()) return;
  reportFailure();
  setHealthWork("artist-art", true);
  requestHealthProbe(0);
}

function writeOverlayFromEnqueue(record: PendingRecord, hasPreferred: boolean) {
  revokePreviewUrl(record.artistId);
  if (record.action === "upload" && record.blob) {
    artistArtOverlays.set(record.artistId, {
      previewUrl: URL.createObjectURL(record.blob),
      pending: "upload",
      hasPreferred,
      preferredRev: record.preferredRev ?? 0,
    });
    return;
  }
  artistArtOverlays.set(record.artistId, {
    pending: "revert",
    hasPreferred,
    preferredRev: record.preferredRev ?? 0,
  });
}

export async function enqueuePreferred(opts: {
  artistId: string;
  action: "upload" | "revert";
  blob?: Blob;
  name: string;
  hasLiveOverride: boolean;
  hasPreferred: boolean;
  preferredRev: number;
}): Promise<void> {
  const current = await idbGet(opts.artistId);
  const next = applyEnqueue(
    current,
    {
      artistId: opts.artistId,
      action: opts.action,
      blob: opts.blob,
      name: opts.name,
      queuedAt: Date.now(),
      preferredRev: opts.preferredRev,
    },
    { hasLiveOverride: opts.hasLiveOverride },
  );
  if (!next) {
    if (current) await idbDelete(opts.artistId);
    revokePreviewUrl(opts.artistId);
    artistArtOverlays.delete(opts.artistId);
    const left = await idbGetAll();
    setHealthWork("artist-art", left.length > 0);
    return;
  }
  await idbPut(next);
  writeOverlayFromEnqueue(next, opts.hasPreferred);
  rearmArtistArtHealth();
}

function errStatus(err: unknown): number | undefined {
  return err instanceof PreferredRequestError ? err.status : undefined;
}

async function runFlush(): Promise<void> {
  const rows = recordsToFlush(await idbGetAll());
  for (const row of rows) {
    try {
      if (row.action === "upload") {
        if (!row.blob) continue;
        const { artist } = await postPreferredArtistImage(row.artistId, row.blob);
        applyPreferredServerResult(row.artistId, artist);
      } else {
        const { artist } = await deletePreferredArtistImage(row.artistId);
        applyPreferredServerResult(row.artistId, artist);
      }
      await idbDelete(row.artistId);
    } catch (err: unknown) {
      const kind = classifyError(err, errStatus(err));
      if (kind === "offline" || kind === "server_down") {
        showToast(kind === "offline" ? "Offline" : "Can't reach server");
        rearmArtistArtHealth();
        return;
      }
      showToast(
        kind === "item_fail"
          ? "Couldn't save that photo"
          : kind === "abort"
            ? "Cancelled"
            : "Something went wrong",
      );
    }
  }
  const left = await idbGetAll();
  setHealthWork("artist-art", left.length > 0);
}

export function flushPending(): Promise<void> {
  if (flushPromise) return flushPromise;
  flushPromise = runFlush().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

function subscribeFlush() {
  if (subscribed) return;
  subscribed = true;
  onConnectivityRecovered(() => {
    void flushPending();
  });
  onConnectivityChange((next) => {
    if (next === "online") void flushPending();
  });
}

export async function initArtistArtPending(): Promise<void> {
  subscribeFlush();
  const rows = await idbGetAll();
  for (const row of rows) {
    const prev = artistArtOverlays.get(row.artistId);
    const hasPreferred =
      row.action === "revert" ? true : (prev?.hasPreferred ?? false);
    writeOverlayFromEnqueue(row, hasPreferred);
  }
  setHealthWork("artist-art", rows.length > 0);
  if (canReachServer() && !isHardOffline() && rows.length) {
    await flushPending();
  }
}
