/**
 * Playback queue (tracks + shuffle cursor) and localStorage persistence.
 * Does not import components — player store imports this.
 */
import { reactive } from "vue";
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  fetchPlaylistTracks,
  fetchTracksMeta,
  requestPrepare,
  preparedKeys,
  clearCache,
} from "../api.js";
import { coerceTrack, isTrack, mapTracks } from "../models/track.js";
import { catalogIndex } from "../downloads/catalog.js";
import { shouldPreferLocalOnline } from "../downloads/resolve.js";
import { downloads } from "../downloads/state.js";
import { getActiveStreamCodec, settings } from "./settings.js";

const STORAGE_KEY = "musicweb.playlist.v1";

/**
 * @typedef {import("../models/track.js").Track} Track
 */

/**
 * Pure next-queue index from playlist cursor state. No side effects.
 * Returns -1 when there is no next track, or when the next id is unknown
 * (shuffle wrap that would require a fresh random order).
 *
 * @param {{
 *   tracks: Track[],
 *   index: number,
 *   shuffle: boolean,
 *   shuffleOrder: number[],
 *   shufflePos: number,
 *   repeat: 'off'|'one'|'all',
 * }} state
 * @returns {number}
 */
function computeNextIndex(state) {
  const { tracks, index, shuffle, shuffleOrder, shufflePos, repeat } = state;
  if (!tracks.length) return -1;
  if (repeat === "one") return index;
  if (shuffle) {
    if (!shuffleOrder.length) return -1;
    const nextPos = shufflePos + 1;
    if (nextPos >= shuffleOrder.length) return -1;
    return shuffleOrder[nextPos];
  }
  const next = index + 1;
  if (next < tracks.length) return next;
  if (repeat === "all") return 0;
  return -1;
}

export const pl = reactive({
  /** @type {Track[]} */
  tracks: [],
  /** Index of the loaded track; -1 when nothing is loaded. */
  index: -1,
  shuffle: false,
  /** @type {'off'|'one'|'all'} */
  repeat: "off",
  /** @type {number[]} */
  shuffleOrder: [],
  shufflePos: -1,
  /** Playlist edit mode (delete / reorder / clear). */
  editing: false,

  get length() {
    return this.tracks.length;
  },

  get current() {
    return this.index >= 0 ? this.tracks[this.index] : null;
  },

  add(items) {
    this.tracks.push(...items);
    this.rebuildShuffle();
  },

  /** Removes indices (any order); returns true if the current track was removed. */
  removeIndices(indices) {
    const removingCurrent = indices.includes(this.index);
    for (const i of [...indices].sort((a, b) => b - a)) {
      this.tracks.splice(i, 1);
      if (i < this.index) this.index -= 1;
      else if (i === this.index) this.index = -1;
    }
    if (this.index >= this.tracks.length) this.index = this.tracks.length - 1;
    this.rebuildShuffle();
    return removingCurrent;
  },

  reorder(from, to) {
    const [item] = this.tracks.splice(from, 1);
    this.tracks.splice(to, 0, item);
    if (this.index === from) this.index = to;
    else if (from < this.index && to >= this.index) this.index -= 1;
    else if (from > this.index && to <= this.index) this.index += 1;
    this.rebuildShuffle();
  },

  clear() {
    this.tracks = [];
    this.index = -1;
    this.shuffleOrder = [];
    this.shufflePos = -1;
  },

  /**
   * Fresh shuffle of all tracks. Always anchored at the current track so
   * mid-playback playlist edits don't reset shufflePos and restart the
   * order from position 0.
   */
  rebuildShuffle() {
    const n = this.tracks.length;
    this.shuffleOrder = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffleOrder[i], this.shuffleOrder[j]] = [
        this.shuffleOrder[j],
        this.shuffleOrder[i],
      ];
    }
    this.shufflePos =
      this.index >= 0 ? this.shuffleOrder.indexOf(this.index) : -1;
  },

  /**
   * Advance to the next queue index (mutates shuffle cursor when needed).
   * Uses the same rules as {@link peekNextIndex}, then applies side effects.
   * @returns {number}
   */
  nextIndex() {
    if (!this.tracks.length) return -1;
    if (this.repeat === "one") return this.index;
    if (this.shuffle) {
      // Empty order: rebuild on advance (peek cannot invent a random order).
      if (!this.shuffleOrder.length) {
        this.rebuildShuffle();
        this.shufflePos = 0;
        return this.shuffleOrder[0];
      }
      const peeked = computeNextIndex(this);
      if (peeked < 0) {
        // Past end of shuffle order: reshape only when advancing under repeat-all.
        if (this.repeat === "all") {
          this.rebuildShuffle();
          this.shufflePos = 0;
          return this.shuffleOrder[0];
        }
        return -1;
      }
      this.shufflePos += 1;
      return peeked;
    }
    return computeNextIndex(this);
  },

  /**
   * Next queue index without advancing shuffle / rebuilding order.
   * When the next track is unknown (shuffle wrap that would reshuffle),
   * returns -1 so callers (e.g. near-end prepare) can skip.
   * @returns {number}
   */
  peekNextIndex() {
    return computeNextIndex(this);
  },

  /**
   * @param {number} currentTime audio.currentTime for restart-vs-prev rule
   */
  prevIndex(currentTime) {
    if (!this.tracks.length) return -1;
    if (currentTime > 3) {
      return { restart: true, index: this.index };
    }
    if (this.shuffle) {
      if (this.shufflePos > 0) {
        this.shufflePos -= 1;
        return this.shuffleOrder[this.shufflePos];
      }
      if (this.repeat === "all" && this.shuffleOrder.length > 1) {
        this.shufflePos = this.shuffleOrder.length - 1;
        return this.shuffleOrder[this.shufflePos];
      }
      return this.index;
    }
    if (this.index > 0) return this.index - 1;
    if (this.repeat === "all") return this.tracks.length - 1;
    return this.index;
  },
});

function savePlaylist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        playlist: pl.tracks,
        currentIndex: pl.index,
        shuffle: pl.shuffle,
        repeat: pl.repeat,
      })
    );
  } catch {
    /* ignore quota */
  }
}

/** Prefer localStorage; migrate once from sessionStorage if needed. */
function readPlaylistRaw() {
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) return local;
  } catch {
    /* ignore */
  }
  try {
    const session = sessionStorage.getItem(STORAGE_KEY);
    if (session) {
      try {
        localStorage.setItem(STORAGE_KEY, session);
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* keep reading from session if migrate fails */
      }
      return session;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function loadPlaylist() {
  try {
    const raw = readPlaylistRaw();
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.playlist)) {
      pl.tracks = mapTracks(data.playlist);
    }
    if (typeof data.currentIndex === "number") pl.index = data.currentIndex;
    if (typeof data.shuffle === "boolean") pl.shuffle = data.shuffle;
    if (
      data.repeat === "off" ||
      data.repeat === "one" ||
      data.repeat === "all"
    ) {
      pl.repeat = data.repeat;
    }
    if (pl.shuffle && pl.tracks.length) pl.rebuildShuffle();
    // Re-persist camelCase after migrating legacy snake_case rows.
    savePlaylist();
  } catch {
    /* ignore */
  }
}

/** Persist after any playlist-state mutation. */
export function commit() {
  savePlaylist();
}

/**
 * Add tracks to the playback queue.
 * Accepts full Track objects, or bare ids / { id } (meta-fetched).
 */
export async function addToQueue(entries) {
  if (!entries?.length) return;

  /** @type {string[]} */
  const ids = [];
  /** @type {Track[]} */
  const preloaded = [];

  for (const entry of entries) {
    if (typeof entry === "string") {
      ids.push(entry);
    } else if (entry && typeof entry === "object" && entry.id) {
      if (isTrack(entry)) {
        const t = coerceTrack(entry);
        if (t) preloaded.push(t);
      } else {
        ids.push(String(entry.id));
      }
    }
  }

  /** @type {Track[]} */
  const items = [...preloaded];

  if (ids.length) {
    try {
      const meta = await fetchTracksMeta(ids);
      const byId = new Map(meta.map((m) => [m.id, m]));
      for (const id of ids) {
        const t = byId.get(id);
        if (t) items.push(t);
      }
    } catch (err) {
      console.error(err);
    }
  }

  const playable = items.filter((t) => t.id && !t.isMissing);
  if (!playable.length) return;
  pl.add(playable);
  commit();

  // Skip prepare when playback policy will prefer a local download.
  const active = getActiveStreamCodec();
  const toPrepare = tracksNeedingPrepare(playable, active);
  if (toPrepare.length) requestPrepare(toPrepare, active);
}

/**
 * Tracks that still need a server stream prepare under current playback policy.
 * Skips ids that will prefer a local download when online, using in-memory
 * catalog projection (missing entry ⇒ still prepare; no IDB).
 * @param {Track[]} tracks
 * @param {string} activeCodec
 * @returns {Track[]}
 */
export function tracksNeedingPrepare(tracks, activeCodec) {
  if (!downloads.enabled) {
    return (tracks || []).filter((t) => t?.id);
  }
  const out = [];
  const policy = settings.playbackPolicy;
  const codecCatalog = settings.options;
  const byTrack = catalogIndex.byTrack;
  for (const t of tracks || []) {
    if (!t?.id) continue;
    const proj = byTrack[t.id];
    if (
      proj &&
      proj.status !== "broken" &&
      proj.codec &&
      shouldPreferLocalOnline(proj.codec, activeCodec, policy, codecCatalog)
    ) {
      continue;
    }
    out.push(t);
  }
  return out;
}

/**
 * @param {Track|null|undefined} track
 * @param {string} activeCodec
 * @returns {boolean}
 */
export function trackNeedsStreamPrepare(track, activeCodec) {
  if (!track?.id) return false;
  return tracksNeedingPrepare([track], activeCodec).length > 0;
}

/**
 * @param {(index: number) => void} playIndex
 * @param {() => void} stopPlayback
 */
export function removeIndices(indices, playIndex, stopPlayback) {
  if (!indices.length) return;
  const removingCurrent = pl.removeIndices(indices);
  commit();
  if (removingCurrent) {
    if (pl.length && pl.index >= 0) playIndex(pl.index);
    else stopPlayback();
  }
}

export function clearPlaylist(stopPlayback) {
  pl.clear();
  stopPlayback();
  preparedKeys.clear();
  clearCache("streams");
  commit();
}

export function reorderPlaylist(from, to) {
  pl.reorder(from, to);
  commit();
}

export async function fetchSavedPlaylists() {
  const data = await apiGet("/api/playlists");
  return data.items || [];
}

export async function loadSavedPlaylist(id, stopPlayback) {
  const tracks = (await fetchPlaylistTracks(id)).filter(
    (t) => !t.isMissing && t.id
  );
  if (!tracks.length) return;
  stopPlayback();
  pl.clear();
  await addToQueue(tracks);
}

export async function deleteSavedPlaylist(id) {
  await apiDelete(`/api/playlists/${encodeURIComponent(id)}`);
}

export async function saveQueueAsPlaylist(name) {
  const ids = pl.tracks.map((t) => t.id).filter(Boolean);
  if (!ids.length) {
    throw new Error(
      "Queue has no indexed tracks to save (wait for scan / use Artists or Albums)."
    );
  }
  const created = await apiPost("/api/playlists", { name: name.trim() });
  await apiPut(`/api/playlists/${encodeURIComponent(created.id)}/tracks`, {
    track_ids: ids,
  });
  return created;
}
