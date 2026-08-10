/**
 * Download queue control: enqueue, pause/resume, list, progress, policy.
 * Worker (pump + runJob) lives in worker.js.
 */

import {
  autoPauseReason,
  canReachServer,
  isHardOffline,
  onConnectivityChange,
  onConnectivityRecovered,
  requestHealthProbe,
  setHealthContext,
} from "../connectivity.js";
import {
  audioDirParts,
  audioFileName,
  codecExt,
  getTrackRecord,
  normalizeTrack,
} from "./catalog.js";
import {
  clearStore,
  deleteOne,
  getAll,
  getOne,
  putOne,
  withStore,
  withStores,
} from "./db.js";
import { partialByteSize, removePartial } from "./opfs.js";

// ── events ──────────────────────────────────────────────────────────

/** @type {Set<() => void>} */
const changeListeners = new Set();
/** @type {Set<(id: number, loaded: number, total: number|null) => void>} */
const progressListeners = new Set();

export function onQueueChange(fn) {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

export function emitQueueChange() {
  for (const fn of changeListeners) {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  }
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

// ── runtime (in-flight jobs) ────────────────────────────────────────

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

// ── live progress ───────────────────────────────────────────────────

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
    if (!cur || cur.state === "canceled") return;
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

// ── IDB queue CRUD ───────────────────────────────────────────────────

function trackCodecKey(trackId, codec) {
  return `${trackId}|${codec}`;
}

function initialState(userPaused) {
  if (userPaused || isHardOffline() || !canReachServer()) return "paused";
  return "pending";
}

/**
 * @param {object} item
 */
export async function discardPartialForItem(item) {
  try {
    const ext = codecExt(item.codec);
    const fileName = audioFileName(item.trackId, item.codec, ext);
    await removePartial(audioDirParts(), fileName);
  } catch {
    /* ignore */
  }
}

export async function listQueue() {
  const items = await getAll("queue");
  return items.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
}

/**
 * Enqueue accepts a client Track (or coerceable track object).
 * @param {import("../models/track.js").Track|object} track
 * @param {string} codec
 * @param {{ userPaused: boolean }} ctx
 */
export async function enqueueTrackItem(track, codec, ctx) {
  const n = normalizeTrack(track);
  if (n.isMissing) throw new Error("Track file is missing on server");

  const key = trackCodecKey(n.id, codec);
  const existing = await withStore("queue", "readonly", (s) =>
    s.index("trackCodec").get(key)
  );
  if (existing && existing.state !== "failed" && existing.state !== "canceled") {
    return existing;
  }
  if (existing && (existing.state === "failed" || existing.state === "canceled")) {
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
    },
    state: initialState(ctx.userPaused),
    error: null,
    loaded: 0,
    total: null,
    addedAt: Date.now(),
  };
  item.id = await withStore("queue", "readwrite", (s) => s.add(item));
  emitQueueChange();
  return item;
}

/**
 * @param {import("../models/track.js").Track[]|object[]} tracks
 * @param {string} codec
 * @param {{ userPaused: boolean }} ctx
 */
export async function enqueueManyItems(tracks, codec, ctx) {
  const results = [];
  for (const t of tracks) {
    try {
      const n = normalizeTrack(t);
      if (n.isMissing) continue;
      results.push(await enqueueTrackItem(n, codec, ctx));
    } catch {
      /* skip */
    }
  }
  return results;
}

export async function cancelQueueItemInternal(id) {
  const item = await getOne("queue", id);
  if (!item) return;
  if (item.state === "active") {
    item.state = "canceled";
    await putOne("queue", item);
    abortJob(id, "cancel");
  } else {
    await discardPartialForItem(item);
    clearLiveProgress(id);
    await deleteOne("queue", id);
  }
  activeIds.delete(id);
  emitQueueChange();
}

/**
 * @param {number} id
 * @param {{ userPaused: boolean }} ctx
 */
export async function retryQueueItemInternal(id, ctx) {
  const item = await getOne("queue", id);
  if (!item) return;
  item.state = initialState(ctx.userPaused);
  item.error = null;
  await putOne("queue", item);
  emitQueueChange();
}

export async function clearFinishedQueueInternal() {
  const items = await listQueue();
  await withStores(["queue"], "readwrite", async (stores) => {
    for (const it of items) {
      if (it.state === "failed" || it.state === "canceled") {
        stores.queue.delete(it.id);
      }
    }
  });
  for (const it of items) {
    if (it.state === "failed" || it.state === "canceled") {
      await discardPartialForItem(it);
      clearLiveProgress(it.id);
    }
  }
  emitQueueChange();
}

/**
 * @param {() => void} stopWorkers
 */
export async function clearAllQueueInternal(stopWorkers) {
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
      if (it.state !== "active" && it.state !== "pending") continue;
      if (it.state === "active") abortIds.push(it.id);
      it.state = "paused";
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
      if (it.state === "paused") {
        it.state = "pending";
        it.error = null;
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
      i.state === "pending" || i.state === "active" || i.state === "paused"
  );
}

// ── policy (pause / connectivity) ───────────────────────────────────

const META_USER_PAUSED = "userPaused";

/** @type {boolean} */
let userPaused = false;
let policyBound = false;
/** @type {null | (() => void)} */
let schedulePumpFn = null;
/** @type {boolean} */
let downloadsEnabled = false;

/**
 * @param {{ schedulePump: () => void }} hooks
 */
export function initPolicy(hooks) {
  schedulePumpFn = hooks.schedulePump;
  if (policyBound) return;
  policyBound = true;

  onConnectivityChange(() => {
    const reason = autoPauseReason();
    if (reason) {
      freezeWork(reason).catch(console.error);
    }
    syncHealthFromPolicy().catch(console.error);
    emitQueueChange();
  });

  onConnectivityRecovered(() => {
    onNetworkRecovered().catch(console.error);
  });
}

/**
 * @param {boolean} enabled
 */
export async function setDownloadsEnabled(enabled) {
  downloadsEnabled = !!enabled;
  await syncHealthFromPolicy();
}

export function getUserPaused() {
  return userPaused;
}

export async function loadUserPausedFlag() {
  try {
    const row = await getOne("meta", META_USER_PAUSED);
    userPaused = !!(row && row.value);
  } catch {
    userPaused = false;
  }
  return userPaused;
}

async function saveUserPausedFlag(on) {
  userPaused = !!on;
  try {
    await putOne("meta", { key: META_USER_PAUSED, value: userPaused });
  } catch {
    /* ignore */
  }
}

export function canPump() {
  return !userPaused && canReachServer() && !isHardOffline();
}

export function getQueueControlState() {
  const reason = autoPauseReason();
  return {
    userPaused,
    autoPausedReason: reason,
    isPaused: userPaused || !!reason,
  };
}

export function getPauseBanner() {
  if (userPaused) {
    return "Paused by you — downloads won't start until you resume.";
  }
  const reason = autoPauseReason();
  if (reason === "offline") {
    return "Paused — you're offline. Downloads will resume when you're back online.";
  }
  if (reason === "server") {
    return "Paused — waiting for the library server. Retrying automatically…";
  }
  return "";
}

export async function syncHealthFromPolicy() {
  const hasWork = await queueHasWork();
  setHealthContext({ enabled: downloadsEnabled, queueHasWork: hasWork });
  if (downloadsEnabled && hasWork && !isHardOffline() && !canReachServer()) {
    requestHealthProbe(0);
  }
}

export async function pauseAllDownloads() {
  await saveUserPausedFlag(true);
  const items = await listQueue();
  for (const it of items) {
    if (it.state === "active") {
      await flushProgressToIdb(it.id);
    }
  }
  await freezeWork("user-pause");
  await syncHealthFromPolicy();
  emitQueueChange();
}

export async function resumeAllDownloads() {
  await saveUserPausedFlag(false);
  if (isHardOffline()) {
    emitQueueChange();
    await syncHealthFromPolicy();
    return;
  }
  if (!canReachServer()) {
    requestHealthProbe(0);
    emitQueueChange();
    await syncHealthFromPolicy();
    return;
  }
  await unpauseItemsToPending();
  if (schedulePumpFn) schedulePumpFn();
  await syncHealthFromPolicy();
  emitQueueChange();
}

async function onNetworkRecovered() {
  if (userPaused || isHardOffline() || !canReachServer()) {
    await syncHealthFromPolicy();
    return;
  }
  await unpauseItemsToPending();
  if (schedulePumpFn) schedulePumpFn();
  await syncHealthFromPolicy();
  emitQueueChange();
}

export async function onJobNetworkFailure() {
  await freezeWork(autoPauseReason() || "server");
  await syncHealthFromPolicy();
}

// ── public control API ──────────────────────────────────────────────

/**
 * @param {import("../models/track.js").Track|object} track
 * @param {string} codec
 */
export async function enqueueTrack(track, codec) {
  const item = await enqueueTrackItem(track, codec, {
    userPaused: getUserPaused(),
  });
  await syncHealthFromPolicy();
  if (schedulePumpFn) schedulePumpFn();
  return item;
}

/**
 * @param {import("../models/track.js").Track[]|object[]} tracks
 * @param {string} codec
 */
export async function enqueueMany(tracks, codec) {
  const results = await enqueueManyItems(tracks, codec, {
    userPaused: getUserPaused(),
  });
  await syncHealthFromPolicy();
  if (schedulePumpFn) schedulePumpFn();
  return results;
}

export async function cancelQueueItem(id) {
  await cancelQueueItemInternal(id);
  await syncHealthFromPolicy();
  if (schedulePumpFn) schedulePumpFn();
}

export async function retryQueueItem(id) {
  await retryQueueItemInternal(id, { userPaused: getUserPaused() });
  await syncHealthFromPolicy();
  if (schedulePumpFn) schedulePumpFn();
}

export async function clearFinishedQueue() {
  await clearFinishedQueueInternal();
  await syncHealthFromPolicy();
}

/**
 * @param {() => void} stopWorkers
 */
export async function clearAllQueue(stopWorkers) {
  await clearAllQueueInternal(stopWorkers);
  await syncHealthFromPolicy();
}

export async function resumeQueue() {
  await loadUserPausedFlag();
  const items = await listQueue();
  for (const it of items) {
    if (it.state === "active") {
      it.state = "paused";
      try {
        const ext = codecExt(it.codec);
        const fileName = audioFileName(it.trackId, it.codec, ext);
        const size = await partialByteSize(audioDirParts(), fileName);
        if (size > 0) {
          it.loaded = size;
          updateLiveProgress(it.id, size, it.total ?? null, {
            forceUi: true,
            persistNow: true,
          });
        }
      } catch {
        /* ignore */
      }
      await putOne("queue", it);
    } else if (it.loaded || it.total) {
      seedLiveProgress(it.id, it.loaded || 0, it.total ?? null);
    }
  }
  emitQueueChange();

  await setDownloadsEnabled(true);
  await syncHealthFromPolicy();

  if (isHardOffline()) {
    emitQueueChange();
    return;
  }

  if (getUserPaused()) {
    emitQueueChange();
    return;
  }

  const hasWork = await queueHasWork();
  if (hasWork && !canReachServer()) {
    requestHealthProbe(0);
    return;
  }
  if (hasWork) {
    await unpauseItemsToPending();
    if (schedulePumpFn) schedulePumpFn();
  }
}
