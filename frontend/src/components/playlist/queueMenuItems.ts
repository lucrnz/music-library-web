/**
 * Queue-row action items. Owner of order and run() wiring.
 */
import {
  downloadActionKind,
  isBusyDownloadKind,
} from "@/downloads/actionKind";
import {
  confirmRemoveDownloadedTrack,
  downloadTrack,
} from "@/downloads/ui";
import { router } from "@/router";
import { playIndex, stopPlayback } from "@/stores/player";
import { pl, removeIndices } from "@/stores/playlist";
import { queueActionsAllowed } from "@/playback/session";
import { copyText } from "@/clipboard";
import { copyAction } from "@/components/menu/copyItems";
import { showToast } from "@/stores/ui";
import type { ActionItem } from "@/components/menu/actionItem";
import type { Track } from "@/models/track";

/** Stable key for a queue slot (id preferred; path if missing). */
export function slotKey(track: Track | null | undefined): string {
  if (!track) return "";
  if (track.id) return `id:${track.id}`;
  if (track.path) return `path:${track.path}`;
  return "";
}

export function slotMatches(index: number, key: string): boolean {
  if (index < 0 || !key) return false;
  const t = pl.tracks[index];
  return !!(t && slotKey(t) === key);
}

export function buildQueueMenuItems({
  track,
  index,
  openedKey,
}: {
  track: Track;
  index: number;
  openedKey: string;
}): ActionItem[] {
  if (!queueActionsAllowed()) return [];
  const items: ActionItem[] = [];

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

  for (const copy of [
    copyAction({
      id: "copy-title",
      label: "Copy title",
      value: track.title,
      run: async (text) => {
        if (!slotMatches(index, openedKey)) return;
        await copyText(text);
      },
    }),
    copyAction({
      id: "copy-artist",
      label: "Copy artist name",
      value: track.artist,
      run: async (text) => {
        if (!slotMatches(index, openedKey)) return;
        await copyText(text);
      },
    }),
    copyAction({
      id: "copy-album",
      label: "Copy album name",
      value: track.album,
      run: async (text) => {
        if (!slotMatches(index, openedKey)) return;
        await copyText(text);
      },
    }),
  ]) {
    if (copy) items.push(copy);
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
          } catch (err: unknown) {
            console.error(err);
            showToast(err instanceof Error ? err.message : "Download failed");
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
      const { removedCurrent, nextIndex } = removeIndices([index]);
      if (removedCurrent) {
        if (pl.length && nextIndex >= 0) playIndex(nextIndex);
        else stopPlayback();
      }
    },
  });
  return items;
}
