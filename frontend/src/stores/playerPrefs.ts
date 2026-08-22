/**
 * Volume / expanded / resume-position persistence.
 * One watch on player.volume; sinks subscribe (queue + radio).
 */
import { watch } from "vue";
import {
  readPlaybackPosition,
  resumeSeconds,
} from "@/stores/playbackPosition";
import { pl } from "@/stores/playlist";
import { player } from "@/stores/playerState";

const VOLUME_STORAGE_KEY = "musicweb.volume";
const EXPANDED_STORAGE_KEY = "musicweb.nowPlayingExpanded.v1";

const volumeSubscribers = new Set<(v: number) => void>();
let volumeWatchBound = false;

export function readVolume(): number | null {
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

export function writeVolume(v: number) {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, String(v));
  } catch {
    /* ignore */
  }
}

/** Face + storage. The only writer of player.volume and musicweb.volume. */
export function setOutputVolume(v: number) {
  const n = Math.min(1, Math.max(0, Number(v)));
  player.volume = n;
  writeVolume(n);
}

/** Read musicweb.volume into the face. Does not notify sinks. */
export function hydrateOutputVolume(): void {
  const stored = readVolume();
  if (stored != null) player.volume = stored;
}

/** Invoke fn now and on every later player.volume change. */
export function subscribeOutputVolume(fn: (v: number) => void): () => void {
  volumeSubscribers.add(fn);
  fn(player.volume);
  return () => {
    volumeSubscribers.delete(fn);
  };
}

/** One detached watch. Call from main.ts before createApp(). */
export function initOutputVolume(): void {
  if (volumeWatchBound) return;
  volumeWatchBound = true;
  watch(
    () => player.volume,
    (v) => {
      for (const fn of volumeSubscribers) fn(v);
    },
  );
}

export function readExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeExpanded(on: boolean) {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Open/close full now-playing and persist the preference. */
export function setExpanded(open: boolean) {
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

/**
 * Restore last paused/hidden position onto the player face.
 * Call after loadPlaylist(); does not load media or start playback.
 */
export function applyPlaybackPosition() {
  const t = pl.current;
  if (!t?.id) return;
  const seconds = resumeSeconds({
    trackId: t.id,
    saved: readPlaybackPosition(),
    duration: t.duration,
  });
  if (seconds == null) return;
  player.currentTime = seconds;
  if (t.duration != null && t.duration > 0) player.duration = t.duration;
}
