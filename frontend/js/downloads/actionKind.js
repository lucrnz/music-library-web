/**
 * Download action kind join. Returns { kind } only — callers own copy/glyphs.
 */
import { catalogIndex, trackDownloadState } from "./catalog.js";
import { downloads } from "./state.js";
import { settings } from "../stores/settings.js";

/**
 * Action kinds. Queue treats pending/active/paused as busy; the icon keeps
 * per-state titles. `other` is distinct from `download` so the icon’s
 * other-quality title/glyph stay accurate.
 *
 * @typedef {"hide"|"download"|"other"|"pending"|"active"|"paused"|"retry"|"ready"} DownloadActionKind
 */

/** @param {DownloadActionKind} kind */
export function isBusyDownloadKind(kind) {
  return kind === "pending" || kind === "active" || kind === "paused";
}

/**
 * @param {object|null|undefined} track
 * @returns {{ kind: DownloadActionKind }}
 */
export function downloadActionKind(track) {
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
