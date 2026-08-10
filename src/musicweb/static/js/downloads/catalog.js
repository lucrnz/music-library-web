/**
 * Catalog façade — re-exports records, art, hierarchy for internal callers.
 * Prefer importing from records.js / art.js / hierarchy.js when adding code.
 */

export {
  commitTrackDownload,
  deleteAlbumDownloads,
  deleteArtistDownloads,
  deleteTrackDownload,
  downloadStatusFor,
  getLocalAudioUrl,
  getTrackRecord,
  listAlbumRecords,
  listArtistRecords,
  listTrackRecords,
  markTrackBroken,
  markTrackOrphan,
  sumDownloadedBytes,
  wipeAllDownloads,
  audioDirParts,
  audioFileName,
  codecExt,
  codecMediaType,
  normalizeTrack,
} from "./records.js";

export {
  getLocalArtistImageUrl,
  getLocalCoverUrl,
} from "./art.js";

export { buildDownloadsHierarchy } from "./hierarchy.js";

export { fromCatalogRecord } from "../models/track.js";
