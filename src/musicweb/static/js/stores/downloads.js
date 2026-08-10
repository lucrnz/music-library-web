/**
 * Thin Vue adapter for downloads.
 * Reactive state + public API live in downloads/; this module re-exports
 * for components that already import from the store path.
 *
 * Prefer: `import { … } from "../downloads/index.js"` for new code.
 * Prefer: `import { downloads } from "../downloads/state.js"` for state only.
 */

export {
  downloads,
  initDownloads,
  enableDownloads,
  disableDownloads,
  openDownloadsManager,
  closeDownloadsManager,
  downloadTrack,
  downloadTracks,
  removeDownloadedTrack,
  removeDownloadedAlbum,
  removeDownloadedArtist,
  pauseAllDownloads,
  resumeAllDownloads,
  cancelQueueItem,
  retryQueueItem,
  clearFinishedQueue,
  trackDownloadState,
  refreshDownloadStatuses,
  refreshTrackStatuses,
  refreshQueue,
  refreshStorageInfo,
  downloadsStorageLine,
  formatBytes,
  buildDownloadsHierarchy,
  getLocalCoverUrl,
  getLocalArtistImageUrl,
  markDownloadBroken,
  noteServerUnreachable,
  noteServerReachable,
  bindConnectivityListeners,
  onStreamCodecChanged,
  checkOrphans,
  confirmIfNearQuota,
} from "../downloads/index.js";
