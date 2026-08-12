/**
 * Downloads lifecycle + user-facing queue/catalog actions.
 *
 * Import map (see docs/frontend/conventions.md):
 *   - Actions / lifecycle: this module
 *   - User download confirm: `downloads/ui.js`
 *   - Reactive fields: `downloads/state.js`
 *   - Catalog / status: `downloads/catalog.js`
 *   - Play/cover resolve: `downloads/resolve.js`
 *   - Hierarchy / formatters: `hierarchy.js` / `storageInfo.js`
 */

import { fetchTracksMeta } from "../api.js";
import {
  getConnectivityState,
  isHardOffline,
  onConnectivityChange,
  reportFailure,
} from "../connectivity.js";
import { settings } from "../stores/settings.js";
import { acquireModalLock, releaseModalLock } from "../stores/modalLock.js";
import {
  deleteAlbumDownloads,
  deleteArtistDownloads,
  deleteTrackDownload,
  listTrackRecords,
  markTrackBroken,
  markTrackOrphan,
  setCatalogProjectionMap,
  sumDownloadedBytes,
  wipeAllDownloads,
} from "./catalog.js";
import { openDownloadsDb } from "./db.js";
import { requireOpfs } from "./opfs.js";
import {
  cancelQueueItem as queueCancelItem,
  clearAllQueue,
  clearFinishedQueue as queueClearFinished,
  enqueueMany as queueEnqueueMany,
  enqueueTrack as queueEnqueueTrack,
  getAllLiveProgress,
  listQueue,
  onProgressChange,
  onQueueChange,
  QueueState,
  retryQueueItem as queueRetryQueueItem,
} from "./queue.js";
import {
  getPauseBanner,
  getQueueControlState,
  getUserPaused,
  pauseAllDownloads as queuePauseAll,
  resumeAllDownloads as queueResumeAll,
  resumeQueue,
  setDownloadsEnabled,
} from "./queuePolicy.js";
import { downloads } from "./state.js";
import {
  formatBytes,
  formatDownloadsStorageLine,
  formatIdleDownloadsSummary,
  getStorageEstimate,
  isNearQuota,
  requestPersistentStorage,
} from "./storageInfo.js";
import { stopAllWorkers } from "./worker.js";

const DOWNLOADS_STORAGE_KEY = "musicweb.downloadsEnabled";

let queueListenerBound = false;
let downloadsConnectivityBound = false;

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
    if (q.state === QueueState.ACTIVE) active++;
    else if (q.state === QueueState.PENDING) pending++;
    else if (q.state === QueueState.PAUSED) paused++;
    else if (q.state === QueueState.FAILED) failed++;

    if (
      q.state === QueueState.ACTIVE ||
      q.state === QueueState.PENDING ||
      q.state === QueueState.PAUSED
    ) {
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

/**
 * Reload catalog-only projection from IDB (boot / enable).
 * Queue overlay is always joined at read time — not stored here.
 */
export async function hydrateCatalogProjection() {
  /** @type {Record<string, { codec: string, status: string }>} */
  const map = {};
  try {
    const tracks = await listTrackRecords();
    for (const t of tracks) {
      if (!t?.trackId || !t.codec) continue;
      map[t.trackId] = {
        codec: t.codec,
        status: t.status || "ready",
      };
    }
  } catch {
    /* ignore */
  }
  setCatalogProjectionMap(map);
}

function bindQueueListener() {
  if (queueListenerBound) return;
  queueListenerBound = true;
  onQueueChange(() => {
    refreshQueue({ includeStorage: true }).catch(() => {});
  });
  onProgressChange((id, loaded, total) => {
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

/**
 * Downloads-specific connectivity hooks (orphan check + pause banners).
 * Window/probe binding lives in stores/connectivity.js — call bindConnectivityStore first.
 */
export function bindConnectivityListeners() {
  if (downloadsConnectivityBound || typeof window === "undefined") return;
  downloadsConnectivityBound = true;
  onConnectivityChange(() => {
    syncControlFlags();
    if (downloads.enabled && getConnectivityState() === "online") {
      checkOrphans().catch(() => {});
    }
  });
  syncControlFlags();
}

export async function markDownloadBroken(trackId) {
  await markTrackBroken(trackId);
}

/**
 * Pure near-quota probe for UI (no dialogs).
 * @param {number} [trackCount=1]
 * @returns {Promise<{ near: boolean, message?: string }>}
 */
export async function getNearQuotaWarning(trackCount = 1) {
  await refreshStorageInfo();
  if (!downloads.nearQuota) return { near: false };
  const n = Math.max(1, Number(trackCount) || 1);
  const message =
    n > 1
      ? `Storage almost full (${formatBytes(downloads.storageUsage)} used). Download ${n} tracks anyway?`
      : `Storage almost full (${formatBytes(downloads.storageUsage)} used). Download anyway?`;
  return { near: true, message };
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
 * @param {{ includeStorage?: boolean }} [opts]
 */
export async function refreshQueue(opts = {}) {
  try {
    const items = await listQueue();
    downloads.queue = overlayQueue(items);
  } catch {
    downloads.queue = [];
  }
  computeQueueSummary(downloads.queue);
  syncControlFlags();
  if (opts.includeStorage) {
    await refreshStorageInfo();
  }
}

/**
 * Shared enable path: OPFS + IDB + queue resume + UI listeners.
 * Safe to call when already booted (idempotent open/bind guards).
 */
async function bootDownloadsRuntime() {
  await import("./worker.js");
  await requireOpfs();
  await openDownloadsDb();
  downloads.persistent = await requestPersistentStorage();
  await setDownloadsEnabled(true);
  await resumeQueue();
  bindQueueListener();
  await hydrateCatalogProjection();
  await refreshQueue({ includeStorage: true });
}

export async function initDownloads() {
  bindConnectivityListeners();
  const on = loadEnabledFlag();
  downloads.enabled = on;
  if (!on) {
    try {
      await refreshStorageInfo();
    } catch {
      /* ignore */
    }
    downloads.ready = true;
    syncControlFlags();
    return;
  }
  try {
    await bootDownloadsRuntime();
    downloads.enabled = true;
    downloads.ready = true;
  } catch (err) {
    console.error("Downloads init failed", err);
    downloads.error = err?.message || String(err);
    downloads.enabled = false;
    saveEnabledFlag(false);
    downloads.ready = true;
  }
  syncControlFlags();
}

export async function enableDownloads() {
  saveEnabledFlag(true);
  downloads.enabled = true;
  try {
    await bootDownloadsRuntime();
    downloads.ready = true;
  } catch (err) {
    console.error("Downloads enable failed", err);
    downloads.error = err?.message || String(err);
    downloads.enabled = false;
    saveEnabledFlag(false);
    downloads.ready = true;
    throw err;
  }
  syncControlFlags();
}

/**
 * Wipe OPFS/IDB download catalog and refresh reactive size fields.
 * Caller must ensure the download queue/workers are already stopped
 * (or downloads are disabled with an empty queue).
 */
async function wipeCatalogStorage() {
  await wipeAllDownloads();
  downloads.trackCount = 0;
  downloads.downloadedBytes = 0;
  try {
    await refreshStorageInfo();
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ wipe: boolean }} opts
 */
export async function disableDownloads({ wipe }) {
  await clearAllQueue(() => stopAllWorkers());
  await setDownloadsEnabled(false);
  if (wipe) {
    await wipeCatalogStorage();
  }
  saveEnabledFlag(false);
  downloads.enabled = false;
  downloads.queue = [];
  downloads.liveProgress = {};
  downloads.userPaused = false;
  downloads.autoPausedReason = null;
  downloads.pauseBanner = "";
  downloads.managerOpen = false;
  if (!wipe) {
    try {
      await refreshStorageInfo();
    } catch {
      /* ignore */
    }
  }
  syncControlFlags();
}

export function openDownloadsManager() {
  downloads.managerOpen = true;
  acquireModalLock("downloads");
  refreshQueue({ includeStorage: true });
  checkOrphans().catch(() => {});
}

export function closeDownloadsManager() {
  downloads.managerOpen = false;
  releaseModalLock("downloads");
}

/**
 * Delete all kept download files while downloads remain disabled.
 * @throws {Error} if downloads are still enabled
 */
export async function clearStoredDownloads() {
  if (downloads.enabled) {
    throw new Error("Clear stored downloads only when downloads are disabled");
  }
  await wipeCatalogStorage();
}

/**
 * Enqueue a single track (no UI confirm). Prefer `downloads/ui.js` for user actions.
 * @param {import("../models/track.js").Track} track
 */
export async function enqueueTrack(track) {
  if (!downloads.enabled) throw new Error("Downloads are disabled");
  if (isHardOffline()) throw new Error("Can't download while offline");
  await queueEnqueueTrack(track, settings.download, getUserPaused());
  await refreshQueue();
}

/**
 * Enqueue many tracks (no UI confirm). Prefer `downloads/ui.js` for user actions.
 * @param {import("../models/track.js").Track[]} tracks
 */
export async function enqueueTracks(tracks) {
  if (!downloads.enabled) throw new Error("Downloads are disabled");
  if (isHardOffline()) throw new Error("Can't download while offline");
  const list = tracks.filter((t) => t?.id && !t.isMissing);
  if (!list.length) return;
  await queueEnqueueMany(list, settings.download, getUserPaused());
  await refreshQueue();
}

/** Thin queue manager wrappers — UI imports from index, not queue guts. */
export async function cancelQueueItem(id) {
  await queueCancelItem(id);
}

export async function retryQueueItem(id) {
  await queueRetryQueueItem(id, getUserPaused());
  await refreshQueue();
}

export async function clearFinishedQueue() {
  await queueClearFinished();
}

export async function removeDownloadedTrack(trackId) {
  await deleteTrackDownload(trackId);
  await refreshQueue({ includeStorage: true });
}

export async function removeDownloadedAlbum(albumId) {
  await deleteAlbumDownloads(albumId);
  await refreshQueue({ includeStorage: true });
}

export async function removeDownloadedArtist(artistId) {
  await deleteArtistDownloads(artistId);
  await refreshQueue({ includeStorage: true });
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

/** Catalog-only leftover summary when downloads are off. */
export function downloadsIdleSummaryLine() {
  return formatIdleDownloadsSummary(downloads);
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

/** Cellular / Wi‑Fi constraint flip — re-evaluate only-download-on-Wi‑Fi pause. */
export function onNetworkConstraintChanged() {
  syncControlFlags();
  import("./queuePolicy.js")
    .then((q) => q.reapplyNetworkPolicy?.())
    .catch(() => {});
}
