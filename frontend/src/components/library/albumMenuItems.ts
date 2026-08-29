/**
 * Album row/card/header action items.
 */
import { copyAction } from "@/components/menu/copyItems";
import type { ActionItem } from "@/components/menu/actionItem";
import type { LibraryAlbum } from "@/components/library/loaders";
import { queueActionsAllowed } from "@/playback/session";

export function buildAlbumMenuItems({
  album,
  addAll,
  playAll,
  download,
}: {
  album: LibraryAlbum;
  addAll: () => void | Promise<void>;
  playAll: () => void | Promise<void>;
  download?: () => void | Promise<void>;
}): ActionItem[] {
  const items: ActionItem[] = [];
  if (queueActionsAllowed()) {
    items.push({
      id: "add-all",
      label: "Add all to playlist",
      icon: "plus",
      run: () => addAll(),
    });
  }
  items.push({
    id: "play-all",
    label: "Play all",
    icon: "play",
    run: () => playAll(),
  });
  if (download) {
    items.push({
      id: "download",
      label: "Download",
      icon: "download",
      run: () => download(),
    });
  }
  for (const copy of [
    copyAction({
      id: "copy-album",
      label: "Copy album name",
      value: album.title,
    }),
    copyAction({
      id: "copy-artist",
      label: "Copy artist name",
      value: album.artist,
    }),
  ]) {
    if (copy) items.push(copy);
  }
  return items;
}
