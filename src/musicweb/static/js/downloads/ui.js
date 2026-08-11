/**
 * User-facing download actions (themed confirms). Pure enqueue lives in index.js.
 */
import { confirmDialog } from "../stores/dialog.js";
import {
  downloadTrack as enqueueDownloadTrack,
  downloadTracks as enqueueDownloadTracks,
  getNearQuotaWarning,
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
  await enqueueDownloadTrack(track);
}

/**
 * @param {import("../models/track.js").Track[]} tracks
 */
export async function downloadTracks(tracks) {
  const list = (tracks || []).filter((t) => t?.id && !t.isMissing);
  if (!list.length) return;
  if (!(await confirmNearQuotaIfNeeded(list.length))) return;
  await enqueueDownloadTracks(list);
}
