/**
 * Reactive downloads feature state + public API for UI.
 * Sole owner of the downloads-enabled flag (localStorage).
 */
import { reactive } from "vue";
import { apiPost } from "../api.js";
import {
  bindWindowConnectivity,
  canReachServer,
  connectivityNote as connNote,
  getConnectivityState,
  isHardOffline as connIsHardOffline,
  onConnectivityChange,
  reportFailure,
  reportSuccess,
  setDownloadsEnabledForNotes,
} from "../downloads/connectivity.js";
import { openDownloadsDb } from "../downloads/db.js";
import {
  buildDownloadsHierarchy,
  deleteAlbumDownloads,
  deleteArtistDownloads,
  deleteTrackDownload,
  getLocalArtistImageUrl,
  getLocalCoverUrl,
  listTrackRecords,
  markTrackBroken,
  markTrackOrphan,
  sumDownloadedBytes,
  wipeAllDownloads,
} from "../downloads/catalog.js";
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
} from "../downloads/queue.js";
import {
  formatBytes,
  formatDownloadsStorageLine,
  getStorageEstimate,
  isNearQuota,
  requestPersistentStorage,
} from "../downloads/storageInfo.js";
import { settings } from "./settings.js";

const DOWNLOADS_STORAGE_KEY = "musicweb.downloadsEnabled";

/** @typedef {'online'|'offline'|'server_down'} Connectivity */

export const downloads = reactive({
  enabled: false,
  ready: false,
  managerOpen: false,
  /** @type {Connectivity} */
  connectivity: "online",
  connectivityNote: "",
  /** @type {object[]} */
  queue: [],
  /** @type {Record<number, { loaded: number, total: number|null }>} */
  liveProgress: {},
  trackCount: 0,
  downloadedBytes: 0,
  storageUsage: 0,
  storageQuota: 0,
  storageSupported: false,
  nearQuota: false,
  persistent: false,
  /** trackId → ready|other|none|pending|active|failed|paused */
  statusMap: /** @type {Record<string, string>} */ ({}),
  error: "",
  userPaused: false,
  /** @type {null | 'offline' | 'server'} */
  autoPausedReason: null,
  pauseBanner: "",
  queueSummary: {
    active: 0,
    pending: 0,
    paused: 0,
    failed: 0,
    total: 0,
    loadedBytes: 0,
    totalBytes: 0,
    knownTotal: false,
  },
});

let statusRefreshTimer = null;
let queueListenerBound = false;
let connectivityMirrorBound = false;

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
  downloads.connectivityNote = connNote(downloads.enabled);
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

function bindQueueListener() {
  if (queueListenerBound) return;
  queueListenerBound = true;
  onQueueChange(() => {
    refreshQueue({ includeStorage: true }).catch(() => {});
  });
  onProgressChange((id, loaded, total) => {
    downloads.liveProgress = { ...downloads.liveProgress, [id]: { loaded, total } };
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
    if (
      q.state === "pending" ||
      q.state === "active" ||
      q.state === "failed" ||
      q.state === "paused"
    ) {
      map[q.trackId] = q.state;
    }
  }
  downloads.statusMap = map;
}

export function isHardOffline() {
  return connIsHardOffline();
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
  await rebuildStatusMapFull();
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
  await rebuildStatusMapFull();
  if (downloads.enabled) {
    await syncHealthFromPolicy();
  }
  if (opts.includeStorage) {
    await refreshStorageInfo();
  }
}

/** Rebuild status icons (no ignored track id list). */
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
  bindConnectivityListeners();
  const on = loadEnabledFlag();
  downloads.enabled = on;
  setDownloadsEnabledForNotes(on);
  if (!on) {
    downloads.ready = true;
    mirrorConnectivity();
    return;
  }
  try {
    await openDownloadsDb();
    downloads.persistent = await requestPersistentStorage();
    await setDownloadsEnabled(true);
    await resumeQueue();
    bindQueueListener();
    await refreshQueue({ includeStorage: true });
    downloads.ready = true;
  } catch (err) {
    console.error("Downloads init failed", err);
    downloads.error = err?.message || String(err);
    downloads.ready = true;
  }
  mirrorConnectivity();
}

export async function enableDownloads() {
  saveEnabledFlag(true);
  downloads.enabled = true;
  setDownloadsEnabledForNotes(true);
  await openDownloadsDb();
  downloads.persistent = await requestPersistentStorage();
  await setDownloadsEnabled(true);
  await resumeQueue();
  bindQueueListener();
  await refreshQueue({ includeStorage: true });
  downloads.ready = true;
  mirrorConnectivity();
}

/**
 * @param {{ wipe: boolean }} opts
 */
export async function disableDownloads({ wipe }) {
  await clearAllQueue();
  await setDownloadsEnabled(false);
  if (wipe) {
    await wipeAllDownloads();
    downloads.trackCount = 0;
    downloads.downloadedBytes = 0;
    downloads.statusMap = {};
  } else {
    try {
      await refreshStorageInfo();
    } catch {
      /* ignore */
    }
  }
  saveEnabledFlag(false);
  downloads.enabled = false;
  setDownloadsEnabledForNotes(false);
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

export async function downloadTrack(track) {
  if (!downloads.enabled) throw new Error("Downloads are disabled");
  if (isHardOffline()) throw new Error("Can't download while offline");
  if (!(await confirmIfNearQuota(1))) return;
  await enqueueTrack(track, settings.stream);
  await refreshQueue();
}

export async function downloadTracks(tracks) {
  if (!downloads.enabled) throw new Error("Downloads are disabled");
  if (isHardOffline()) throw new Error("Can't download while offline");
  const list = tracks.filter((t) => t?.id && !t.is_missing);
  if (!list.length) return;
  if (!(await confirmIfNearQuota(list.length))) return;
  await enqueueMany(list, settings.stream);
  await refreshQueue();
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

export { buildDownloadsHierarchy, getLocalCoverUrl, getLocalArtistImageUrl };
export { cancelQueueItem, retryQueueItem, clearFinishedQueue, formatBytes };
export { canReachServer };

export async function checkOrphans() {
  if (!downloads.enabled || isHardOffline()) return;
  const tracks = await listTrackRecords();
  if (!tracks.length) return;
  const ids = tracks.map((t) => t.trackId);
  const found = new Set();
  try {
    for (let i = 0; i < ids.length; i += 1000) {
      const chunk = ids.slice(i, i + 1000);
      const data = await apiPost("/api/tracks/meta", { ids: chunk });
      for (const r of data.results || []) found.add(r.id);
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
