/**
 * Volume / expanded persistence. Storage only — sink apply stays in player.js.
 */
import { pl } from "./playlist.js";
import { player } from "./playerState.js";

const VOLUME_STORAGE_KEY = "musicweb.volume";
const EXPANDED_STORAGE_KEY = "musicweb.nowPlayingExpanded.v1";

/** @returns {number | null} */
export function readVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw == null) return null;
    const v = Number(raw);
    if (Number.isFinite(v) && v >= 0 && v <= 1) return v;
  } catch {
    /* ignore */
  }
  return null;
}

/** @param {number} v */
export function writeVolume(v) {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(v));
  } catch {
    /* ignore */
  }
}

/** @returns {boolean} */
export function readExpanded() {
  try {
    return localStorage.getItem(EXPANDED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** @param {boolean} on */
export function writeExpanded(on) {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Open/close full now-playing and persist the preference. */
export function setExpanded(open) {
  const next = !!open;
  player.expanded = next;
  if (!next) {
    player.sheetOffset = 0;
    player.draggingSheet = false;
    player.lyricsOpen = false;
  }
  writeExpanded(next);
}

/**
 * Restore now-playing expanded flag from localStorage.
 * Call after loadPlaylist(); stays collapsed when the queue is empty.
 */
export function applyExpanded() {
  const want = readExpanded();
  player.expanded = !!(want && pl.length > 0);
}
