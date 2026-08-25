/**
 * User-facing download actions (themed confirms). Pure enqueue lives in index.js.
 */
import { confirmDialog } from "@/stores/dialog";
import {
  enqueueTrack,
  enqueueTracks,
  removeDownloadedTrack,
} from "@/downloads/index";
import {
  migrateOpfsToCompanion,
  refreshLeftoverFlag,
} from "@/downloads/migrate";
import { downloads } from "@/downloads/state";
import {
  canUseCompanionDownloads,
  isDesktopPlatform,
  isInstalledPwa,
} from "@/exclusive/capability";
import { exclusiveAudio } from "@/stores/exclusiveAudio";
import { showToast } from "@/stores/ui";
import type { Track } from "@/models/track";

export async function confirmMigrateDownloads(
  opts: { required?: boolean } = {},
): Promise<boolean> {
  const required = !!opts.required;
  const ok = await confirmDialog({
    title: "Migrate downloads",
    message: required
      ? "Downloads on this computer now live in the Desktop companion. Migrate leftover browser files to continue."
      : "Move leftover browser downloads to the Desktop companion for more reliable storage?",
    confirmLabel: "Yes",
    cancelLabel: "Later",
  });
  if (!ok) {
    showToast("Remember to migrate leftover downloads to the Desktop companion.");
    return false;
  }
  const moved = await migrateOpfsToCompanion();
  if (!moved && downloads.migrate.error) {
    showToast(downloads.migrate.error);
  }
  return moved;
}

function desktopDownloadBlocked(): boolean {
  if (isDesktopPlatform() && !isInstalledPwa()) {
    showToast("Use the installed app to download.");
    return true;
  }
  if (canUseCompanionDownloads() && exclusiveAudio.connection !== "connected") {
    showToast("Start the Desktop companion to download.");
    return true;
  }
  return false;
}

/**
 * @param {import("../models/track.js").Track} track
 */
export async function downloadTrack(track: Track) {
  if (desktopDownloadBlocked()) return;
  if (canUseCompanionDownloads() && downloads.hasOpfsLeftovers) {
    const moved = await confirmMigrateDownloads({ required: true });
    if (!moved) return;
    await refreshLeftoverFlag();
    if (downloads.hasOpfsLeftovers) return;
  }
  await enqueueTrack(track);
}

/**
 * @param {import("../models/track.js").Track[]} tracks
 */
export async function downloadTracks(tracks: Track[]) {
  const list = (tracks || []).filter((t) => t?.id && !t.isMissing);
  if (!list.length) return;
  if (desktopDownloadBlocked()) return;
  if (canUseCompanionDownloads() && downloads.hasOpfsLeftovers) {
    const moved = await confirmMigrateDownloads({ required: true });
    if (!moved) return;
    await refreshLeftoverFlag();
    if (downloads.hasOpfsLeftovers) return;
  }
  await enqueueTracks(list);
}

/**
 * Confirm + remove a local download. Shared by the manager and queue menu.
 * @param {string} trackId
 * @returns {Promise<boolean>} true if the download was removed
 */
export async function confirmRemoveDownloadedTrack(trackId: string): Promise<boolean> {
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
