/**
 * Offline download catalog barrel: projection, art, writer.
 */

export {
  QUEUE_UI_STATES,
  catalogIndex,
  catalogUiStatus,
  setCatalogProjectionMap,
  syncCatalogProjection,
  clearCatalogProjection,
  joinDownloadUiStatus,
  trackDownloadState,
  isLocallyPlayableDownload,
  type CatalogProjectionEntry,
  type CatalogUiStatus,
  type DownloadUiStatus,
} from "@/downloads/projection";

export {
  artUrlCache,
  revokeArtCached,
  wipeArtUrlCache,
  refreshArtistArtFile,
  getLocalCoverUrl,
  getLocalArtistImageUrl,
  ensureAlbumArtFiles,
  ensureArtistArtFile,
} from "@/downloads/art";

export {
  withCatalogLock,
  getTrackRecord,
  listTrackRecords,
  listAlbumRecords,
  listArtistRecords,
  getLocalAudioUrlForRecord,
  markTrackBroken,
  markTrackOrphan,
  commitTrackDownload,
  finalizeTrackDownload,
  deleteTrackDownload,
  deleteAlbumDownloads,
  deleteArtistDownloads,
  wipeAllDownloads,
  sumDownloadedBytes,
  type CatalogAlbumRecord,
  type CatalogArtistRecord,
  type CatalogTrackRecord,
  type CatalogTrackAudioMeta,
} from "@/downloads/writer";
