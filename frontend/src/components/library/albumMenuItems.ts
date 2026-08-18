/**
 * Album row/card/header action items.
 */
import { copyAction } from "@/components/menu/copyItems";
import type { ActionItem } from "@/components/menu/actionItem";
import type { LibraryAlbum } from "@/components/library/loaders";

export function buildAlbumMenuItems({
  album,
  addAll,
  download,
}: {
  album: LibraryAlbum;
  addAll: () => void | Promise<void>;
  download?: () => void | Promise<void>;
}): ActionItem[] {
  const items: ActionItem[] = [
    {
      id: "add-all",
      label: "Add all to playlist",
      icon: "plus",
      run: () => addAll(),
    },
  ];
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
