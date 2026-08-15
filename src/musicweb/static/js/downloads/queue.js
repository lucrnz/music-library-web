/**
 * Download queue: state, IDB store, progress, events, runtime.
 * Policy (pause/network/health) lives in queuePolicy.js; pump in worker.js.
 */

import { canReachServer, isHardOffline } from "../connectivity.js";
import { deliveryCodec } from "../lossyKind.js";
import { normalizeTrack } from "../models/track.js";
import { codecExt } from "./catalog.js";
import {
  clearStore,
  deleteOne,
  getAll,
  getOne,
  putOne,
  withStore,
  withStores,
} from "./db.js";
import {
  audioDirParts,
  audioFileName,
  removePartial,
} from "./opfs.js";
import { getTrackRecord } from "./catalog.js";

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/** @typedef {'pending'|'active'|'paused'|'failed'|'canceled'} QueueStateName */

export const QueueState = Object.freeze({
  PENDING: "pending",
  ACTIVE: "active",
  PAUSED: "paused",
  FAILED: "failed",
  CANCELED: "canceled",
});

/**
 * @param {object} item
 * @returns {object}
 */
export function markPending(item) {
  item.state = QueueState.PENDING;
  item.error = null;
  return item;
}

/**
 * @param {object} item
 * @returns {object}
 */
export function markActive(item) {
  item.state = QueueState.ACTIVE;
  item.error = null;
  return item;
}

/**
 * @param {object} item
 * @param {string} [_reason]
 * @returns {object}
 */
export function markPaused(item, _reason) {
  item.state = QueueState.PAUSED;
  return item;
}

/**
 * @param {object} item
 * @param {string} [error]
 * @returns {object}
 */
export function markFailed(item, error) {
  item.state = QueueState.FAILED;
  item.error = error || "Download failed";
  return item;
}

/**
 * @param {object} item
 * @returns {object}
 */
export function markCanceled(item) {
  item.state = QueueState.CANCELED;
  return item;
}

/**
 * Abort race: canceled if cancel already won, otherwise paused.
 * @param {object|null|undefined} item
 * @returns {'canceled'|'paused'}
 */
export function resolveAbortKind(item) {
  return item?.state === QueueState.CANCELED
    ? QueueState.CANCELED
    : QueueState.PAUSED;
}

// ---------------------------------------------------------------------------
// Runtime (in-flight jobs)
// ---------------------------------------------------------------------------

/** @type {Set<number>} */
export const activeIds = new Set();

/** @type {Map<number, AbortController>} */
export const controllers = new Map();

/**
 * @param {number} id
 * @param {string} [reason]
 */
export function abortJob(id, reason = "pause") {
  const c = controllers.get(id);
  if (c) {
    try {
      c.abort(reason);
    } catch {
      /* ignore */
    }
  }
}

/**
 * @param {string} [reason]
 */
export function abortAllJobs(reason = "pause") {
  for (const id of [...controllers.keys()]) {
    abortJob(id, reason);
  }
}

// ---------------------------------------------------------------------------
// Event bus
// ---------------------------------------------------------------------------

/** @type {Set<() => void>} */
const changeListeners = new Set();
/** @type {Set<(id: number, loaded: number, total: number|null) => void>} */
const progressListeners = new Set();

/** Coalesce side effects to one microtask after mutation emits. */
let afterMutationScheduled = false;
/** @type {null | (() => void | Promise<void>)} */
let afterMutationHook = null;

/**
 * Install health+pump hook (called once from initPolicy).
 * @param {() => void | Promise<void>} fn
 */
export function setQueueMutationSideEffects(fn) {
  afterMutationHook = fn;
}

export function onQueueChange(fn) {
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
    } catch (err) {
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

/**
 * @param {(id: number, loaded: number, total: number|null) => void} fn
 */
export function onProgressChange(fn) {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

/**
 * @param {number} id
 * @param {number} loaded
 * @param {number|null} total
 */
export function emitProgress(id, loaded, total) {
  for (const fn of progressListeners) {
    try {
      fn(id, loaded, total);
    } catch (err) {
      console.error(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Live progress
// ---------------------------------------------------------------------------

const IDB_PERSIST_MS = 1500;
const UI_EMIT_MS = 200;

/** @type {Map<number, { loaded: number, total: number|null }>} */
const live = new Map();
/** @type {Map<number, ReturnType<typeof setTimeout>>} */
const persistTimers = new Map();
/** @type {Map<number, number>} */
const lastUiEmit = new Map();

export function getLiveProgress(id) {
  return live.get(id) || null;
}

export function getAllLiveProgress() {
  /** @type {Record<number, { loaded: number, total: number|null }>} */
  const out = {};
  for (const [id, v] of live) out[id] = v;
  return out;
}

/**
 * @param {number} id
 * @param {number} loaded
 * @param {number|null} total
 * @param {{ forceUi?: boolean, persistNow?: boolean }} [opts]
 */
export function updateLiveProgress(id, loaded, total, opts = {}) {
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

function schedulePersist(id) {
  if (persistTimers.has(id)) return;
  const t = setTimeout(() => {
    persistTimers.delete(id);
    flushProgressToIdb(id).catch(() => {});
  }, IDB_PERSIST_MS);
  persistTimers.set(id, t);
}

export async function flushProgressToIdb(id) {
  const p = live.get(id);
  if (!p) return;
  const existing = persistTimers.get(id);
  if (existing) {
    clearTimeout(existing);
    persistTimers.delete(id);
  }
  try {
    const cur = await getOne("queue", id);
    if (!cur || cur.state === QueueState.CANCELED) return;
    cur.loaded = p.loaded;
    cur.total = p.total;
    await putOne("queue", cur);
  } catch {
    /* ignore */
  }
}

export function clearLiveProgress(id) {
  live.delete(id);
  lastUiEmit.delete(id);
  const t = persistTimers.get(id);
  if (t) {
    clearTimeout(t);
    persistTimers.delete(id);
  }
}

export function seedLiveProgress(id, loaded, total) {
  if (loaded || total) {
    live.set(id, { loaded: loaded || 0, total: total ?? null });
  }
}

// ---------------------------------------------------------------------------
// IDB store CRUD
// ---------------------------------------------------------------------------

/**
 * @param {object} item
 * @param {boolean} userPaused
 */
function applyInitialState(item, userPaused) {
  if (userPaused || isHardOffline() || !canReachServer()) {
    markPaused(item, "initial");
  } else {
    markPending(item);
  }
}

function trackCodecKey(trackId, codec) {
  return `${trackId}|${codec}`;
}

/**
 * @param {object} item
 */
export async function discardPartialForItem(item) {
  try {
    const ext = codecExt(item.codec, item.snapshot?.sourceCodec);
    const fileName = audioFileName(item.trackId, item.codec, ext);
    await removePartial(audioDirParts(), fileName);
  } catch {
    /* ignore */
  }
}

/**
 * Remove queue row + partial files (non-active cancel / cleanup).
 * @param {object} item
 */
export async function discardRow(item) {
  await discardPartialForItem(item);
  clearLiveProgress(item.id);
  await deleteOne("queue", item.id);
  activeIds.delete(item.id);
}

export async function listQueue() {
  const items = await getAll("queue");
  return items.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
}

/**
 * @param {import("../models/track.js").Track|object} track
 * @param {string} codec
 * @param {{ userPaused: boolean }} ctx
 */
async function enqueueTrackCore(track, codec, ctx) {
  const n = normalizeTrack(track);
  if (n.isMissing) throw new Error("Track file is missing on server");
  codec = deliveryCodec(n, codec);

  const key = trackCodecKey(n.id, codec);
  const existing = await withStore("queue", "readonly", (s) =>
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
    await deleteOne("queue", existing.id);
    clearLiveProgress(existing.id);
  }

  const rec = await getTrackRecord(n.id);
  if (rec && rec.codec === codec && rec.status === "ready") {
    return { id: null, skipped: true, trackId: n.id, codec };
  }

  const item = {
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
  item.id = await withStore("queue", "readwrite", (s) => s.add(item));
  return item;
}

/**
 * @param {import("../models/track.js").Track|object} track
 * @param {string} codec
 * @param {boolean} userPaused
 */
export async function enqueueTrack(track, codec, userPaused) {
  const item = await enqueueTrackCore(track, codec, { userPaused });
  emitQueueChange();
  return item;
}

/**
 * @param {import("../models/track.js").Track[]|object[]} tracks
 * @param {string} codec
 * @param {boolean} userPaused
 */
export async function enqueueMany(tracks, codec, userPaused) {
  const ctx = { userPaused };
  const results = [];
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

export async function cancelQueueItem(id) {
  const item = await getOne("queue", id);
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
export async function retryQueueItem(id, userPaused) {
  const item = await getOne("queue", id);
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
        stores.queue.delete(it.id);
      }
    }
  });
  for (const it of items) {
    if (
      it.state === QueueState.FAILED ||
      it.state === QueueState.CANCELED
    ) {
      await discardPartialForItem(it);
      clearLiveProgress(it.id);
    }
  }
  emitQueueChange();
}

/**
 * @param {() => void} stopWorkers
 */
export async function clearAllQueue(stopWorkers) {
  stopWorkers();
  const items = await listQueue();
  for (const it of items) {
    await discardPartialForItem(it);
    clearLiveProgress(it.id);
  }
  await clearStore("queue");
  emitQueueChange();
}

/**
 * @param {string} reasonLabel
 */
export async function freezeWork(reasonLabel) {
  const items = await listQueue();
  /** @type {number[]} */
  const abortIds = [];
  await withStores(["queue"], "readwrite", async (stores) => {
    for (const it of items) {
      if (
        it.state !== QueueState.ACTIVE &&
        it.state !== QueueState.PENDING
      ) {
        continue;
      }
      if (it.state === QueueState.ACTIVE) abortIds.push(it.id);
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
