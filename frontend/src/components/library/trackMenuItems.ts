/**
 * Track and folder-file action items.
 */
import { copyAction } from "@/components/menu/copyItems";
import type { ActionItem } from "@/components/menu/actionItem";

export function buildTrackMenuItems({
  title,
  artist,
  album,
  addToPlaylist,
}: {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  addToPlaylist: () => void | Promise<void>;
}): ActionItem[] {
  const items: ActionItem[] = [
    {
      id: "add-to-playlist",
      label: "Add to playlist",
      icon: "plus",
      run: () => addToPlaylist(),
    },
  ];
  for (const copy of [
    copyAction({ id: "copy-title", label: "Copy title", value: title }),
    copyAction({
      id: "copy-artist",
      label: "Copy artist name",
      value: artist,
    }),
    copyAction({
      id: "copy-album",
      label: "Copy album name",
      value: album,
    }),
  ]) {
    if (copy) items.push(copy);
  }
  return items;
}
