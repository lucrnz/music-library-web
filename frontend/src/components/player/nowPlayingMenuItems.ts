/**
 * Expanded now-playing action items. Copy-focused; go-to only after copies.
 */
import { copyAction } from "@/components/menu/copyItems";
import { router } from "@/router";
import type { ActionItem } from "@/components/menu/actionItem";
import type { Track } from "@/models/track";

export function buildNowPlayingMenuItems({
  track,
  offerCopyLyrics,
  copyLyrics,
}: {
  track: Track;
  offerCopyLyrics: boolean;
  copyLyrics: () => void | Promise<void>;
}): ActionItem[] {
  const items: ActionItem[] = [];
  for (const copy of [
    copyAction({ id: "copy-title", label: "Copy title", value: track.title }),
    copyAction({
      id: "copy-artist",
      label: "Copy artist name",
      value: track.artist,
    }),
    copyAction({
      id: "copy-album",
      label: "Copy album name",
      value: track.album,
    }),
  ]) {
    if (copy) items.push(copy);
  }
  if (offerCopyLyrics) {
    items.push({
      id: "copy-lyrics",
      label: "Copy lyrics",
      icon: "copy",
      run: () => copyLyrics(),
    });
  }
  if (track.albumId) {
    items.push({
      id: "go-album",
      label: "Go to album",
      icon: "album",
      run: () => {
        router.push({ name: "album", params: { albumId: track.albumId } });
      },
    });
  }
  if (track.artistBrowsable && track.artistId) {
    items.push({
      id: "go-artist",
      label: "Go to artist",
      icon: "artist",
      run: () => {
        router.push({ name: "artist", params: { artistId: track.artistId } });
      },
    });
  }
  return items;
}
