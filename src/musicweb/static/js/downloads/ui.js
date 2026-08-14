/**
 * User-facing download actions (themed confirms). Pure enqueue lives in index.js.
 */
import { confirmDialog } from "../stores/dialog.js";
import {
  enqueueTrack,
  enqueueTracks,
  getNearQuotaWarning,
  removeDownloadedTrack,
} from "./index.js";

/**
 * @param {number} trackCount
 * @returns {Promise<boolean>} true if the caller may proceed
 */
async function confirmNearQuotaIfNeeded(trackCount) {
  const warn = await getNearQuotaWarning(trackCount);
  if (!warn.near) return true;
  return confirmDialog({
    title: "Storage almost full",
    message: warn.message || "Storage almost full. Download anyway?",
    confirmLabel: "Download",
  });
}

/**
 * @param {import("../models/track.js").Track} track
 */
export async function downloadTrack(track) {
  if (!(await confirmNearQuotaIfNeeded(1))) return;
  await enqueueTrack(track);
}

/**
 * @param {import("../models/track.js").Track[]} tracks
 */
export async function downloadTracks(tracks) {
  const list = (tracks || []).filter((t) => t?.id && !t.isMissing);
  if (!list.length) return;
  if (!(await confirmNearQuotaIfNeeded(list.length))) return;
  await enqueueTracks(list);
}

/**
 * Confirm + remove a local download. Shared by the manager and queue menu.
 * @param {string} trackId
 * @returns {Promise<boolean>} true if the download was removed
 */
export async function confirmRemoveDownloadedTrack(trackId) {
  if (!trackId) return false;
  const ok = await confirmDialog({
    title: "Remove download",
    message: "Remove this download from this device?",
    confirmLabel: "Remove",
    danger: true,
  });
  if (!ok) return false;
  await removeDownloadedTrack(trackId);
  return true;
}
