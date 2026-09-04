/**
 * Yellow Book filesystem / queue ⋯ items. No Download / Save / Go to.
 */
import type { ActionItem } from "@/components/menu/actionItem";

export function buildCdromFileMenuItems({
  add,
}: {
  add: () => void;
}): ActionItem[] {
  return [{ id: "add", label: "Add", icon: "plus", run: add }];
}

export function buildCdromFolderMenuItems({
  addAll,
  playAll,
}: {
  addAll: () => void;
  playAll: () => void;
}): ActionItem[] {
  return [
    { id: "add-all", label: "Add all", icon: "plus", run: addAll },
    { id: "play-all", label: "Play all", icon: "play", run: playAll },
  ];
}

export function buildCdromQueueMenuItems({
  remove,
}: {
  remove: () => void;
}): ActionItem[] {
  return [{ id: "remove", label: "Remove", icon: "trash", danger: true, run: remove }];
}
