/**
 * Download action kind join. Returns { kind } only — callers own copy/glyphs.
 */
import { catalogIndex, trackDownloadState } from "@/downloads/catalog";
import { downloads } from "@/downloads/state";
import type { Track } from "@/models/track";
import { settings } from "@/stores/settings";

/**
 * Action kinds. Queue treats pending/active/paused as busy; the icon keeps
 * per-state titles. `other` is distinct from `download` so the icon’s
 * other-quality title/glyph stay accurate.
 */
export type DownloadActionKind =
  | "hide"
  | "download"
  | "other"
  | "pending"
  | "active"
  | "paused"
  | "retry"
  | "ready";

export function isBusyDownloadKind(kind: DownloadActionKind) {
  return kind === "pending" || kind === "active" || kind === "paused";
}

export function downloadActionKind(
  track: Track | null | undefined,
): { kind: DownloadActionKind } {
  // Touch reactive sources used by the on-read join.
  void downloads.enabled;
  void downloads.queue;
  void settings.download;
  void catalogIndex.byTrack;

  if (!downloads.enabled || !track?.id || track.isMissing) {
    return { kind: "hide" };
  }

  const state = trackDownloadState(track.id);
  switch (state) {
    case "pending":
      return { kind: "pending" };
    case "active":
      return { kind: "active" };
    case "paused":
      return { kind: "paused" };
    case "failed":
      return { kind: "retry" };
    case "ready":
      return { kind: "ready" };
    case "other":
      return { kind: "other" };
    default:
      return { kind: "download" };
  }
}
