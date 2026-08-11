/**
 * Public downloads API for app code.
 *
 * Pattern:
 *   - Actions / lifecycle: import from `downloads/index.js`
 *   - Reactive fields: import `{ downloads }` from `downloads/state.js`
 *     (or from `stores/downloads.js` which re-exports both)
 *
 * Modules: enable → queue.js → worker.js → records/art. OPFS in opfs.js.
 */

import { fetchTracksMeta } from "../api.js";
import {
  bindWindowConnectivity,
  getConnectivityState,
  isHardOffline,
  onConnectivityChange,
  reportFailure,
  reportSuccess,
} from "../connectivity.js";
import { settings } from "../stores/settings.js";
import { getLocalArtistImageUrl, getLocalCoverUrl } from "./art.js";
import { openDownloadsDb } from "./db.js";
import { buildDownloadsHierarchy } from "./hierarchy.js";
import { requireOpfs } from "./opfs.js";
import {
  cancelQueueItem,
  clearAllQueue,
  clearFinishedQueue,
  enqueueMany,
  enqueueTrack,
  getAllLiveProgress,
  getPauseBanner,
  getQueueControlState,
  listQueue,
  onProgressChange,
  onQueueChange,
  pauseAllDownloads as queuePauseAll,
  resumeAllDownloads as queueResumeAll,
  resumeQueue,
  retryQueueItem,
  setDownloadsEnabled,
  syncHealthFromPolicy,
} from "./queue.js";
import {
  deleteAlbumDownloads,
  deleteArtistDownloads,
  deleteTrackDownload,
  getTrackRecord,
  listTrackRecords,
  markTrackBroken,
  markTrackOrphan,
  sumDownloadedBytes,
  wipeAllDownloads,
} from "./records.js";
import { resolveCoverUrl, resolvePlaySource } from "./resolve.js";
import { downloads } from "./state.js";
import {
  formatBytes,
  formatDownloadsStorageLine,
  getStorageEstimate,
  isNearQuota,
  requestPersistentStorage,
} from "./storageInfo.js";
import { stopAllWorkers } from "./worker.js";

export { downloads } from "./state.js";
export { buildDownloadsHierarchy } from "./hierarchy.js";
export { getLocalArtistImageUrl, getLocalCoverUrl } from "./art.js";
export { resolveCoverUrl, resolvePlaySource } from "./resolve.js";
export {
  cancelQueueItem,
  retryQueueItem,
  clearFinishedQueue,
} from "./queue.js";
export { formatBytes } from "./storageInfo.js";

const DOWNLOADS_STORAGE_KEY = "musicweb.downloadsEnabled";

let statusRefreshTimer = null;
let queueListenerBound = false;
let connectivityMirrorBound = false;
/** After first full rebuild, queue refresh uses incremental statusMap updates. */
let statusMapReady = false;

function loadEnabledFlag() {
  try {
    return localStorage.getItem(DOWNLOADS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveEnabledFlag(on) {
  try {
    if (on) localStorage.setItem(DOWNLOADS_STORAGE_KEY, "1");
    else localStorage.removeItem(DOWNLOADS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function mirrorConnectivity() {
  downloads.connectivity = getConnectivityState();
  syncControlFlags();
}

function syncControlFlags() {
  const s = getQueueControlState();
  downloads.userPaused = s.userPaused;
  downloads.autoPausedReason = s.autoPausedReason;
  downloads.pauseBanner = getPauseBanner();
}

function overlayQueue(items) {
  const live = getAllLiveProgress();
  downloads.liveProgress = live;
  return items.map((q) => {
    const p = live[q.id];
    if (!p) return q;
    return { ...q, loaded: p.loaded, total: p.total ?? q.total };
  });
}

function computeQueueSummary(items) {
  let active = 0;
  let pending = 0;
  let paused = 0;
  let failed = 0;
  let loadedBytes = 0;
  let totalBytes = 0;
  let knownTotal = true;
  let progressItems = 0;

  for (const q of items) {
    if (q.state === "active") active++;
    else if (q.state === "pending") pending++;
    else if (q.state === "paused") paused++;
    else if (q.state === "failed") failed++;

    if (q.state === "active" || q.state === "pending" || q.state === "paused") {
      progressItems++;
      loadedBytes += q.loaded || 0;
      if (q.total && q.total > 0) totalBytes += q.total;
      else knownTotal = false;
    }
  }

  downloads.queueSummary = {
    active,
    pending,
    paused,
    failed,
    total: items.length,
    loadedBytes,
    totalBytes,
    knownTotal: knownTotal && progressItems > 0 && totalBytes > 0,
  };
}

const QUEUE_STATUS = new Set(["pending", "active", "failed", "paused"]);

/**
 * Catalog-only status for a track id (no queue overlay).
 * @param {string} trackId
 * @returns {Promise<string|null>} null means none / remove key
 */
async function catalogStatusFor(trackId) {
  try {
    const rec = await getTrackRecord(trackId);
    if (!rec) return null;
    if (rec.status === "broken") return "failed";
    return rec.codec === settings.stream ? "ready" : "other";
  } catch {
    return null;
  }
}

/** Full rebuild: catalog + queue overlay. Init / enable / codec / wipe / explicit. */
async function rebuildStatusMapFull() {
  /** @type {Record<string, string>} */
  const map = {};
  try {
    const tracks = await listTrackRecords();
    for (const t of tracks) {
      if (t.status === "broken") map[t.trackId] = "failed";
      else map[t.trackId] = t.codec === settings.stream ? "ready" : "other";
    }
  } catch {
    /* ignore */
  }
  for (const q of downloads.queue) {
    if (QUEUE_STATUS.has(q.state)) {
      map[q.trackId] = q.state;
    }
  }
  downloads.statusMap = map;
  statusMapReady = true;
}

/**
 * Incremental statusMap after a queue refresh.
 * Queue states overlay; tracks that left active queue recompute from catalog.
 * @param {Set<string>} prevQueueTrackIds
 */
async function updateStatusMapIncremental(prevQueueTrackIds) {
  if (!statusMapReady) {
    await rebuildStatusMapFull();
    return;
  }
  /** @type {Record<string, string>} */
  const map = { ...downloads.statusMap };
  const nextActive = new Set();

  for (const q of downloads.queue) {
    if (QUEUE_STATUS.has(q.state)) {
      map[q.trackId] = q.state;
      nextActive.add(q.trackId);
    }
  }

  for (const tid of prevQueueTrackIds) {
    if (nextActive.has(tid)) continue;
    const st = await catalogStatusFor(tid);
    if (st) map[tid] = st;
    else delete map[tid];
  }

  downloads.statusMap = map;
}

function bindQueueListener() {
  if (queueListenerBound) return;
  queueListenerBound = true;
  onQueueChange(() => {
    refreshQueue({ includeStorage: true }).catch(() => {});
  });
  onProgressChange((id, loaded, total) => {
    // Progress ticks must not rebuild statusMap.
    downloads.liveProgress = {
      ...downloads.liveProgress,
      [id]: { loaded, total },
    };
    const idx = downloads.queue.findIndex((q) => q.id === id);
    if (idx >= 0) {
      const row = downloads.queue[idx];
      downloads.queue[idx] = { ...row, loaded, total: total ?? row.total };
      downloads.queue = [...downloads.queue];
      computeQueueSummary(downloads.queue);
    }
    syncControlFlags();
  });
}

export function bindConnectivityListeners() {
  if (connectivityMirrorBound || typeof window === "undefined") return;
  connectivityMirrorBound = true;
  bindWindowConnectivity();
  onConnectivityChange(() => {
    mirrorConnectivity();
    if (downloads.enabled && getConnectivityState() === "online") {
      checkOrphans().catch(() => {});
    }
  });
  // Initial mirror only — transition toasts live in connectivityUi (shell boot).
  mirrorConnectivity();
}

/** @param {unknown} [err] */
export function noteServerUnreachable(err) {
  reportFailure(err);
  mirrorConnectivity();
}

export function noteServerReachable() {
  reportSuccess();
  mirrorConnectivity();
}

export async function markDownloadBroken(trackId) {
  await markTrackBroken(trackId);
  const map = { ...downloads.statusMap, [trackId]: "failed" };
  downloads.statusMap = map;
}

export async function confirmIfNearQuota(trackCount = 1) {
  await refreshStorageInfo();
  if (!downloads.nearQuota) return true;
  const msg =
    trackCount > 1
      ? `Storage almost full (${formatBytes(downloads.storageUsage)} used). Download ${trackCount} tracks anyway?`
      : `Storage almost full (${formatBytes(downloads.storageUsage)} used). Download anyway?`;
  return confirm(msg);
}

export async function refreshStorageInfo() {
  const est = await getStorageEstimate();
  downloads.storageUsage = est.usage;
  downloads.storageQuota = est.quota;
  downloads.storageSupported = est.supported;
  downloads.nearQuota = isNearQuota(est);
  try {
    downloads.downloadedBytes = await sumDownloadedBytes();
    downloads.trackCount = (await listTrackRecords()).length;
  } catch {
    downloads.downloadedBytes = 0;
    downloads.trackCount = 0;
  }
}

/**
 * @param {{ includeStorage?: boolean, fullStatus?: boolean }} [opts]
 */
export async function refreshQueue(opts = {}) {
  const prevIds = new Set(downloads.queue.map((q) => q.trackId));
  try {
    const items = await listQueue();
    downloads.queue = overlayQueue(items);
  } catch {
    downloads.queue = [];
  }
  computeQueueSummary(downloads.queue);
  syncControlFlags();
  if (opts.fullStatus || !statusMapReady) {
    await rebuildStatusMapFull();
  } else {
    await updateStatusMapIncremental(prevIds);
  }
  if (downloads.enabled) {
    await syncHealthFromPolicy();
  }
  if (opts.includeStorage) {
    await refreshStorageInfo();
  }
}

/** Explicit full status rebuild (e.g. after library nav). */
export async function refreshDownloadStatuses() {
  await rebuildStatusMapFull();
}

/** @deprecated use refreshDownloadStatuses */
export async function refreshTrackStatuses() {
  await refreshDownloadStatuses();
}

export function trackDownloadState(trackId) {
  if (!downloads.enabled || !trackId) return "none";
  return downloads.statusMap[trackId] || "none";
}

export async function initDownloads() {
  // Ensure worker module loads (registers schedulePump with policy).
  await import("./worker.js");
  bindConnectivityListeners();
  const on = loadEnabledFlag();
  downloads.enabled = on;
  if (!on) {
    downloads.ready = true;
    mirrorConnectivity();
    return;
  }
  try {
    await requireOpfs();
    await openDownloadsDb();
    downloads.persistent = await requestPersistentStorage();
    await setDownloadsEnabled(true);
    await resumeQueue();
    bindQueueListener();
    await refreshQueue({ includeStorage: true, fullStatus: true });
    downloads.ready = true;
  } catch (err) {
    console.error("Downloads init failed", err);
    downloads.error = err?.message || String(err);
    downloads.enabled = false;
    saveEnabledFlag(false);
    downloads.ready = true;
  }
  mirrorConnectivity();
}

export async function enableDownloads() {
  await import("./worker.js");
  await requireOpfs();
  saveEnabledFlag(true);
  downloads.enabled = true;
  await openDownloadsDb();
  downloads.persistent = await requestPersistentStorage();
  await setDownloadsEnabled(true);
  await resumeQueue();
  bindQueueListener();
  await refreshQueue({ includeStorage: true, fullStatus: true });
  downloads.ready = true;
  mirrorConnectivity();
}

/**
 * @param {{ wipe: boolean }} opts
 */
export async function disableDownloads({ wipe }) {
  await clearAllQueue(() => stopAllWorkers());
  await setDownloadsEnabled(false);
  if (wipe) {
    await wipeAllDownloads();
    downloads.trackCount = 0;
    downloads.downloadedBytes = 0;
    downloads.statusMap = {};
    statusMapReady = false;
  } else {
    try {
      await refreshStorageInfo();
    } catch {
      /* ignore */
    }
  }
  saveEnabledFlag(false);
  downloads.enabled = false;
  downloads.queue = [];
  downloads.liveProgress = {};
  downloads.userPaused = false;
  downloads.autoPausedReason = null;
  downloads.pauseBanner = "";
  if (wipe) downloads.statusMap = {};
  downloads.managerOpen = false;
  await refreshStorageInfo();
  mirrorConnectivity();
}

export function openDownloadsManager() {
  downloads.managerOpen = true;
  document.body.classList.add("modal-open");
  refreshQueue({ includeStorage: true });
  checkOrphans().catch(() => {});
}

export function closeDownloadsManager() {
  downloads.managerOpen = false;
  if (!settings.open) document.body.classList.remove("modal-open");
}

/**
 * @param {import("../models/track.js").Track} track
 */
export async function downloadTrack(track) {
  if (!downloads.enabled) throw new Error("Downloads are disabled");
  if (isHardOffline()) throw new Error("Can't download while offline");
  if (!(await confirmIfNearQuota(1))) return;
  await enqueueTrack(track, settings.stream);
  await refreshQueue();
}

/**
 * @param {import("../models/track.js").Track[]} tracks
 */
export async function downloadTracks(tracks) {
  if (!downloads.enabled) throw new Error("Downloads are disabled");
  if (isHardOffline()) throw new Error("Can't download while offline");
  const list = tracks.filter((t) => t?.id && !t.isMissing);
  if (!list.length) return;
  if (!(await confirmIfNearQuota(list.length))) return;
  await enqueueMany(list, settings.stream);
  await refreshQueue();
}

export async function removeDownloadedTrack(trackId) {
  await deleteTrackDownload(trackId);
  const map = { ...downloads.statusMap };
  delete map[trackId];
  downloads.statusMap = map;
  await refreshQueue({ includeStorage: true });
}

export async function removeDownloadedAlbum(albumId) {
  await deleteAlbumDownloads(albumId);
  await refreshQueue({ includeStorage: true, fullStatus: true });
}

export async function removeDownloadedArtist(artistId) {
  await deleteArtistDownloads(artistId);
  await refreshQueue({ includeStorage: true, fullStatus: true });
}

export async function pauseAllDownloads() {
  await queuePauseAll();
  await refreshQueue();
}

export async function resumeAllDownloads() {
  await queueResumeAll();
  await refreshQueue();
}

export function downloadsStorageLine(style = "long") {
  return formatDownloadsStorageLine(downloads, style);
}

export async function checkOrphans() {
  if (!downloads.enabled || isHardOffline()) return;
  const tracks = await listTrackRecords();
  if (!tracks.length) return;
  const ids = tracks.map((t) => t.trackId);
  const found = new Set();
  try {
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const results = await fetchTracksMeta(chunk);
      for (const r of results) found.add(r.id);
    }
    for (const t of tracks) {
      if (!found.has(t.trackId)) await markTrackOrphan(t.trackId);
    }
  } catch (err) {
    reportFailure(err);
  }
}

export function onStreamCodecChanged() {
  if (!downloads.enabled) return;
  if (statusRefreshTimer) clearTimeout(statusRefreshTimer);
  statusRefreshTimer = setTimeout(() => {
    rebuildStatusMapFull().catch(() => {});
  }, 50);
}
