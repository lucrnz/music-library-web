/**
 * Queue-row action items. Owner of order and run() wiring.
 */
import {
  downloadActionKind,
  isBusyDownloadKind,
} from "../../downloads/actionKind.js";
import {
  confirmRemoveDownloadedTrack,
  downloadTrack,
} from "../../downloads/ui.js";
import { router } from "../../router.js";
import { playIndex, stopPlayback } from "../../stores/player.js";
import { pl, removeIndices } from "../../stores/playlist.js";
import { showToast } from "../../stores/ui.js";

/**
 * Stable key for a queue slot (id preferred; path if missing).
 * @param {object|null|undefined} track
 */
export function slotKey(track) {
  if (!track) return "";
  if (track.id) return `id:${track.id}`;
  if (track.path) return `path:${track.path}`;
  return "";
}

/**
 * @param {number} index
 * @param {string} key
 */
export function slotMatches(index, key) {
  if (index < 0 || !key) return false;
  const t = pl.tracks[index];
  return !!(t && slotKey(t) === key);
}

/**
 * @param {{
 *   track: object,
 *   index: number,
 *   openedKey: string,
 * }} args
 * @returns {Array<{
 *   id: string,
 *   label: string,
 *   icon: string,
 *   danger?: boolean,
 *   disabled?: boolean,
 *   run: () => void|Promise<void>,
 * }>}
 */
export function buildQueueMenuItems({ track, index, openedKey }) {
  const items = [];

  if (track.albumId) {
    items.push({
      id: "go-album",
      label: "Go to album",
      icon: "album",
      run: () => {
        if (!slotMatches(index, openedKey)) return;
        router.push({ name: "album", params: { albumId: track.albumId } });
      },
    });
  }
  if (track.artistId) {
    items.push({
      id: "go-artist",
      label: "Go to artist",
      icon: "artist",
      run: () => {
        if (!slotMatches(index, openedKey)) return;
        router.push({ name: "artist", params: { artistId: track.artistId } });
      },
    });
  }

  const { kind } = downloadActionKind(track);

  if (kind !== "hide") {
    if (kind === "ready") {
      items.push({
        id: "download-remove",
        label: "Remove download",
        icon: "download-check",
        run: async () => {
          if (!slotMatches(index, openedKey)) return;
          await confirmRemoveDownloadedTrack(track.id);
        },
      });
    } else if (isBusyDownloadKind(kind)) {
      items.push({
        id: "download",
        label: "Downloading…",
        icon: "download",
        disabled: true,
        run: () => {},
      });
    } else {
      items.push({
        id: "download",
        label: kind === "retry" ? "Retry download" : "Download",
        icon: "download",
        run: async () => {
          if (!slotMatches(index, openedKey)) return;
          try {
            await downloadTrack(track);
          } catch (err) {
            console.error(err);
            showToast(err.message || "Download failed");
          }
        },
      });
    }
  }

  items.push({
    id: "remove",
    label: "Remove from queue",
    icon: "trash",
    danger: true,
    run: () => {
      if (!slotMatches(index, openedKey)) return;
      removeIndices([index], playIndex, stopPlayback);
    },
  });
  return items;
}
