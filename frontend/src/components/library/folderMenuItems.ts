/**
 * Folder row/card/tree action items.
 */
import { copyAction } from "@/components/menu/copyItems";
import type { ActionItem } from "@/components/menu/actionItem";
import type { BrowseDir } from "@/api";

export function buildFolderMenuItems({
  dir,
  addAll,
}: {
  dir: BrowseDir;
  addAll: () => void | Promise<void>;
}): ActionItem[] {
  const items: ActionItem[] = [
    {
      id: "add-all",
      label: "Add all to playlist",
      icon: "plus",
      run: () => addAll(),
    },
  ];
  for (const copy of [
    copyAction({
      id: "copy-folder-name",
      label: "Copy folder name",
      value: dir.name,
    }),
    copyAction({
      id: "copy-folder-path",
      label: "Copy full path",
      value: dir.path,
    }),
  ]) {
    if (copy) items.push(copy);
  }
  return items;
}
