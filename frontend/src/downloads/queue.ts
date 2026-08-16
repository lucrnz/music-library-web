/**
 * Download queue: state, IDB store, progress, events, runtime.
 * Policy (pause/network/health) lives in queuePolicy.js; pump in worker.js.
 */

import { canReachServer, isHardOffline } from "@/connectivity";
import { deliveryCodec } from "@/lossyKind";
import { normalizeTrack, type Track } from "@/models/track";
import { codecExt } from "@/downloads/catalog";
import {
  clearStore,
  deleteOne,
  getAll,
  getOne,
  putOne,
  withStore,
  withStores,
} from "@/downloads/db";
import {
  audioDirParts,
  audioFileName,
  removePartial,
} from "@/downloads/opfs";
import { getTrackRecord } from "@/downloads/catalog";

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

export type QueueStateName =
  | "pending"
  | "active"
  | "paused"
  | "failed"
  | "canceled";

export const QueueState = Object.freeze({
  PENDING: "pending",
  ACTIVE: "active",
  PAUSED: "paused",
  FAILED: "failed",
  CANCELED: "canceled",
} as const);

/** Snapshot of the track stored on a queue row (enough to commit if refresh fails). */
export interface QueueTrackSnapshot {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumId: string | null;
  artistId: string | null;
  albumArtistId: string | null;
  albumArtist: string;
  track: number | null;
  disc: number | null;
  duration: number | null;
  year: number | null;
  isMissing: boolean;
  isLossy: boolean;
  sourceCodec: string | null;
  bitrateKbps: number | null;
}

/** IDB "queue" row. `id` is assigned by autoIncrement after insert. */
export interface QueueRecord {
  id?: number;
  trackCodec: string;
  trackId: string;
  codec: string;
  snapshot: QueueTrackSnapshot;
  state: QueueStateName;
  error: string | null;
  loaded: number;
  total: number | null;
  addedAt: number;
}

export interface QueueSkipResult {
  id: null;
  skipped: true;
  trackId: string;
  codec: string;
}

export type QueueEnqueueResult = QueueRecord | QueueSkipResult;

export function markPending(item: QueueRecord): QueueRecord {
  item.state = QueueState.PENDING;
  item.error = null;
  return item;
}

export function markActive(item: QueueRecord): QueueRecord {
  item.state = QueueState.ACTIVE;
  item.error = null;
  return item;
}

export function markPaused(item: QueueRecord, _reason?: string): QueueRecord {
  item.state = QueueState.PAUSED;
  return item;
}

export function markFailed(item: QueueRecord, error?: string): QueueRecord {
  item.state = QueueState.FAILED;
  item.error = error || "Download failed";
  return item;
}

export function markCanceled(item: QueueRecord): QueueRecord {
  item.state = QueueState.CANCELED;
  return item;
}

/** Abort race: canceled if cancel already won, otherwise paused. */
export function resolveAbortKind(
  item: QueueRecord | null | undefined,
): "canceled" | "paused" {
  return item?.state === QueueState.CANCELED
    ? QueueState.CANCELED
    : QueueState.PAUSED;
}

// ---------------------------------------------------------------------------
// Runtime (in-flight jobs)
// ---------------------------------------------------------------------------

export const activeIds = new Set<number>();

export const controllers = new Map<number, AbortController>();

export function abortJob(id: number, reason = "pause") {
  const c = controllers.get(id);
  if (c) {
    try {
      c.abort(reason);
    } catch {
      /* ignore */
    }
  }
}

export function abortAllJobs(reason = "pause") {
  for (const id of [...controllers.keys()]) {
    abortJob(id, reason);
  }
}

// ---------------------------------------------------------------------------
// Event bus
// ---------------------------------------------------------------------------

type QueueChangeListener = () => void;
type ProgressListener = (id: number, loaded: number, total: number | null) => void;

const changeListeners = new Set<QueueChangeListener>();
const progressListeners = new Set<ProgressListener>();

/** Coalesce side effects to one microtask after mutation emits. */
let afterMutationScheduled = false;
let afterMutationHook: (() => void | Promise<void>) | null = null;

/** Install health+pump hook (called once from initPolicy). */
export function setQueueMutationSideEffects(fn: () => void | Promise<void>) {
  afterMutationHook = fn;
}

export function onQueueChange(fn: QueueChangeListener) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

/**
 * Notify UI listeners, then schedule shared side effects (health + pump).
 * Progress ticks must use emitProgress — not this.
 */
export function emitQueueChange() {
  for (const fn of changeListeners) {
    try {
      fn();
    } catch (err: unknown) {
      console.error(err);
    }
  }
  scheduleAfterQueueMutation();
}

function scheduleAfterQueueMutation() {
  if (afterMutationScheduled) return;
  afterMutationScheduled = true;
  queueMicrotask(() => {
    afterMutationScheduled = false;
    Promise.resolve()
      .then(() => (afterMutationHook ? afterMutationHook() : undefined))
      .catch(console.error);
  });
}

export function onProgressChange(fn: ProgressListener) {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

export function emitProgress(id: number, loaded: number, total: number | null) {
  for (const fn of progressListeners) {
    try {
      fn(id, loaded, total);
    } catch (err: unknown) {
      console.error(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Live progress
// ---------------------------------------------------------------------------

const IDB_PERSIST_MS = 1500;
const UI_EMIT_MS = 200;

export interface LiveProgressEntry {
  loaded: number;
  total: number | null;
}

const live = new Map<number, LiveProgressEntry>();
const persistTimers = new Map<number, ReturnType<typeof setTimeout>>();
const lastUiEmit = new Map<number, number>();

export function getLiveProgress(id: number): LiveProgressEntry | null {
  return live.get(id) || null;
}

export function getAllLiveProgress(): Record<number, LiveProgressEntry> {
  const out: Record<number, LiveProgressEntry> = {};
  for (const [id, v] of live) out[id] = v;
  return out;
}

/**
 * @param {number} id
 * @param {number} loaded
 * @param {number|null} total
 * @param {{ forceUi?: boolean, persistNow?: boolean }} [opts]
 */
export function updateLiveProgress(
  id: number,
  loaded: number,
  total: number | null,
  opts: { forceUi?: boolean; persistNow?: boolean } = {},
) {
  live.set(id, { loaded, total });
  const now = Date.now();
  const last = lastUiEmit.get(id) || 0;
  if (opts.forceUi || now - last >= UI_EMIT_MS || loaded === total) {
    lastUiEmit.set(id, now);
    emitProgress(id, loaded, total);
  }
  if (opts.persistNow) {
    flushProgressToIdb(id).catch(() => {});
  } else {
    schedulePersist(id);
  }
}

function schedulePersist(id: number) {
  if (persistTimers.has(id)) return;
  const t = setTimeout(() => {
    persistTimers.delete(id);
    flushProgressToIdb(id).catch(() => {});
  }, IDB_PERSIST_MS);
  persistTimers.set(id, t);
}

export async function flushProgressToIdb(id: number) {
  const p = live.get(id);
  if (!p) return;
  const existing = persistTimers.get(id);
  if (existing) {
    clearTimeout(existing);
    persistTimers.delete(id);
  }
  try {
    const cur = await getOne<QueueRecord>("queue", id);
    if (!cur || cur.state === QueueState.CANCELED) return;
    cur.loaded = p.loaded;
    cur.total = p.total;
    await putOne("queue", cur);
  } catch {
    /* ignore */
  }
}

export function clearLiveProgress(id: number) {
  live.delete(id);
  lastUiEmit.delete(id);
  const t = persistTimers.get(id);
  if (t) {
    clearTimeout(t);
    persistTimers.delete(id);
  }
}

export function seedLiveProgress(id: number, loaded: number, total: number | null) {
  if (loaded || total) {
    live.set(id, { loaded: loaded || 0, total: total ?? null });
  }
}

// ---------------------------------------------------------------------------
// IDB store CRUD
// ---------------------------------------------------------------------------

function applyInitialState(item: QueueRecord, userPaused: boolean) {
  if (userPaused || isHardOffline() || !canReachServer()) {
    markPaused(item, "initial");
  } else {
    markPending(item);
  }
}

function trackCodecKey(trackId: string, codec: string) {
  return `${trackId}|${codec}`;
}

export async function discardPartialForItem(item: QueueRecord) {
  try {
    const ext = codecExt(item.codec, item.snapshot?.sourceCodec);
    const fileName = audioFileName(item.trackId, item.codec, ext);
    await removePartial(audioDirParts(), fileName);
  } catch {
    /* ignore */
  }
}

/** Remove queue row + partial files (non-active cancel / cleanup). */
export async function discardRow(item: QueueRecord) {
  await discardPartialForItem(item);
  if (item.id == null) return;
  clearLiveProgress(item.id);
  await deleteOne("queue", item.id);
  activeIds.delete(item.id);
}

export async function listQueue(): Promise<QueueRecord[]> {
  const items = await getAll<QueueRecord>("queue");
  return items.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
}

async function enqueueTrackCore(
  track: Track,
  codec: string,
  ctx: { userPaused: boolean },
): Promise<QueueEnqueueResult> {
  const n = normalizeTrack(track);
  if (n.isMissing) throw new Error("Track file is missing on server");
  const delivered = deliveryCodec(n, codec);
  if (delivered) codec = delivered;

  const key = trackCodecKey(n.id, codec);
  const existing = await withStore<QueueRecord | undefined>("queue", "readonly", (s) =>
    s.index("trackCodec").get(key)
  );
  if (
    existing &&
    existing.state !== QueueState.FAILED &&
    existing.state !== QueueState.CANCELED
  ) {
    return existing;
  }
  if (
    existing &&
    (existing.state === QueueState.FAILED ||
      existing.state === QueueState.CANCELED)
  ) {
    if (existing.id != null) {
      await deleteOne("queue", existing.id);
      clearLiveProgress(existing.id);
    }
  }

  const rec = await getTrackRecord(n.id);
  if (rec && rec.codec === codec && rec.status === "ready") {
    return { id: null, skipped: true, trackId: n.id, codec };
  }

  const item: QueueRecord = {
    trackCodec: key,
    trackId: n.id,
    codec,
    snapshot: {
      id: n.id,
      title: n.title,
      artist: n.artist,
      album: n.album,
      albumId: n.albumId,
      artistId: n.artistId,
      albumArtistId: n.albumArtistId,
      albumArtist: n.albumArtist,
      track: n.track,
      disc: n.disc,
      duration: n.duration,
      year: n.year,
      isMissing: false,
      isLossy: !!n.isLossy,
      sourceCodec: n.sourceCodec || null,
      bitrateKbps: n.bitrateKbps ?? null,
    },
    state: QueueState.PENDING,
    error: null,
    loaded: 0,
    total: null,
    addedAt: Date.now(),
  };
  applyInitialState(item, ctx.userPaused);
  const id = await withStore<IDBValidKey>("queue", "readwrite", (s) => s.add(item));
  item.id = typeof id === "number" ? id : Number(id);
  return item;
}

export async function enqueueTrack(
  track: Track,
  codec: string,
  userPaused: boolean,
): Promise<QueueEnqueueResult> {
  const item = await enqueueTrackCore(track, codec, { userPaused });
  emitQueueChange();
  return item;
}

export async function enqueueMany(
  tracks: Track[],
  codec: string,
  userPaused: boolean,
): Promise<QueueEnqueueResult[]> {
  const ctx = { userPaused };
  const results: QueueEnqueueResult[] = [];
  for (const t of tracks) {
    try {
      const n = normalizeTrack(t);
      if (n.isMissing) continue;
      results.push(await enqueueTrackCore(n, codec, ctx));
    } catch {
      /* skip */
    }
  }
  emitQueueChange();
  return results;
}

export async function cancelQueueItem(id: number) {
  const item = await getOne<QueueRecord>("queue", id);
  if (!item) return;
  if (item.state === QueueState.ACTIVE) {
    markCanceled(item);
    await putOne("queue", item);
    abortJob(id, "cancel");
  } else {
    await discardRow(item);
  }
  activeIds.delete(id);
  emitQueueChange();
}

/**
 * @param {number} id
 * @param {boolean} userPaused
 */
export async function retryQueueItem(id: number, userPaused: boolean) {
  const item = await getOne<QueueRecord>("queue", id);
  if (!item) return;
  applyInitialState(item, userPaused);
  await putOne("queue", item);
  emitQueueChange();
}

export async function clearFinishedQueue() {
  const items = await listQueue();
  await withStores(["queue"], "readwrite", async (stores) => {
    for (const it of items) {
      if (
        it.state === QueueState.FAILED ||
        it.state === QueueState.CANCELED
      ) {
        if (it.id != null) stores.queue.delete(it.id);
      }
    }
  });
  for (const it of items) {
    if (
      it.state === QueueState.FAILED ||
      it.state === QueueState.CANCELED
    ) {
      await discardPartialForItem(it);
      if (it.id != null) clearLiveProgress(it.id);
    }
  }
  emitQueueChange();
}

export async function clearAllQueue(stopWorkers: () => void) {
  stopWorkers();
  const items = await listQueue();
  for (const it of items) {
    await discardPartialForItem(it);
    if (it.id != null) clearLiveProgress(it.id);
  }
  await clearStore("queue");
  emitQueueChange();
}

/**
 * @param {string} reasonLabel
 */
export async function freezeWork(reasonLabel: string) {
  const items = await listQueue();
  const abortIds: number[] = [];
  await withStores(["queue"], "readwrite", async (stores) => {
    for (const it of items) {
      if (
        it.state !== QueueState.ACTIVE &&
        it.state !== QueueState.PENDING
      ) {
        continue;
      }
      if (it.state === QueueState.ACTIVE && it.id != null) abortIds.push(it.id);
      markPaused(it, reasonLabel || "pause");
      stores.queue.put(it);
    }
  });
  for (const id of abortIds) {
    abortJob(id, reasonLabel || "pause");
    activeIds.delete(id);
  }
  emitQueueChange();
}

export async function unpauseItemsToPending() {
  const items = await listQueue();
  await withStores(["queue"], "readwrite", async (stores) => {
    for (const it of items) {
      if (it.state === QueueState.PAUSED) {
        markPending(it);
        stores.queue.put(it);
      }
    }
  });
  emitQueueChange();
}

export async function queueHasWork() {
  const items = await listQueue();
  return items.some(
    (i) =>
      i.state === QueueState.PENDING ||
      i.state === QueueState.ACTIVE ||
      i.state === QueueState.PAUSED
  );
}
