/**
 * Shared row-menu helpers. Toggle identity is the caller's:
 * artist hosts use nextOpenKey; PlaylistView keeps index toggle.
 */
import { isDesktopViewport } from "@/layout";

export function isDesktopContextMenu(): boolean {
  return isDesktopViewport();
}

/** Same key again → close (`""`). Artist-id surfaces only. */
export function nextOpenKey(currentKey: string, clickedKey: string): string {
  return currentKey === clickedKey ? "" : clickedKey;
}
