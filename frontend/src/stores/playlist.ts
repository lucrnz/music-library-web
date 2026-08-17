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
} from "@/api";
import { coerceTrack, isTrack, mapTracks, type Track } from "@/models/track";
import { catalogIndex } from "@/downloads/catalog";
import { shouldPreferLocalOnline } from "@/downloads/resolve";
import { downloads } from "@/downloads/state";
import {
  getExclusiveProfileTag,
  isExclusiveEnabled,
} from "@/stores/exclusiveAudio";
import { getActiveStreamCodec, settings } from "@/stores/settings";

const STORAGE_KEY = "musicweb.playlist.v1";

export type RepeatMode = "off" | "one" | "all";

export interface PlaylistCursor {
  tracks: Track[];
  index: number;
  shuffle: boolean;
  shuffleOrder: number[];
  shufflePos: number;
  repeat: RepeatMode;
}

export interface PlaylistState extends PlaylistCursor {
  editing: boolean;
  readonly length: number;
  readonly current: Track | null;
  add(items: Track[]): void;
  removeIndices(indices: number[]): boolean;
  reorder(from: number, to: number): void;
  clear(): void;
  rebuildShuffle(): void;
  nextIndex(): number;
  peekNextIndex(): number;
  prevIndex(currentTime: number): number | { restart: true; index: number };
  advanceToPlayable(
    dir: "next" | "prev",
    isPlayable: (track: Track | undefined) => boolean,
  ): number;
}

export interface SavedPlaylist {
  id: string;
  name?: string;
}

export type QueueEntry = string | Track | { id?: string };

/**
 * Pure next-queue index from playlist cursor state. No side effects.
 * Returns -1 when there is no next track, or when the next id is unknown
 * (shuffle wrap that would require a fresh random order).
 */
export function computeNextIndex(state: PlaylistCursor): number {
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

function rebuildShuffleOn(cursor: PlaylistCursor) {
  const n = cursor.tracks.length;
  cursor.shuffleOrder = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cursor.shuffleOrder[i], cursor.shuffleOrder[j]] = [
      cursor.shuffleOrder[j],
      cursor.shuffleOrder[i],
    ];
  }
  cursor.shufflePos =
    cursor.index >= 0 ? cursor.shuffleOrder.indexOf(cursor.index) : -1;
}

function stepNext(cursor: PlaylistCursor): number {
  if (!cursor.tracks.length) return -1;
  if (cursor.repeat === "one") return cursor.index;
  if (cursor.shuffle) {
    if (!cursor.shuffleOrder.length) {
      rebuildShuffleOn(cursor);
      cursor.shufflePos = 0;
      return cursor.shuffleOrder[0];
    }
    const peeked = computeNextIndex(cursor);
    if (peeked < 0) {
      if (cursor.repeat === "all") {
        rebuildShuffleOn(cursor);
        cursor.shufflePos = 0;
        return cursor.shuffleOrder[0];
      }
      return -1;
    }
    cursor.shufflePos += 1;
    return peeked;
  }
  return computeNextIndex(cursor);
}

function stepPrev(cursor: PlaylistCursor): number {
  if (!cursor.tracks.length) return -1;
  if (cursor.shuffle) {
    if (cursor.shufflePos > 0) {
      cursor.shufflePos -= 1;
      return cursor.shuffleOrder[cursor.shufflePos];
    }
    if (cursor.repeat === "all" && cursor.shuffleOrder.length > 1) {
      cursor.shufflePos = cursor.shuffleOrder.length - 1;
      return cursor.shuffleOrder[cursor.shufflePos];
    }
    return cursor.index;
  }
  if (cursor.index > 0) return cursor.index - 1;
  if (cursor.repeat === "all") return cursor.tracks.length - 1;
  return cursor.index;
}

const playlistState: PlaylistState = {
  tracks: [],
  /** Index of the loaded track; -1 when nothing is loaded. */
  index: -1,
  shuffle: false,
  repeat: "off",
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

  add(this: PlaylistState, items) {
    this.tracks.push(...items);
    this.rebuildShuffle();
  },

  /** Removes indices (any order); returns true if the current track was removed. */
  removeIndices(this: PlaylistState, indices) {
    const removingCurrent = indices.includes(this.index);
    for (const i of [...indices].sort((a, b) => b - a)) {
      this.tracks.splice(i, 1);
      if (i < this.index) this.index -= 1;
    }
    if (this.index >= this.tracks.length) this.index = this.tracks.length - 1;
    this.rebuildShuffle();
    return removingCurrent;
  },

  reorder(this: PlaylistState, from, to) {
    const [item] = this.tracks.splice(from, 1);
    this.tracks.splice(to, 0, item);
    if (this.index === from) this.index = to;
    else if (from < this.index && to >= this.index) this.index -= 1;
    else if (from > this.index && to <= this.index) this.index += 1;
    this.rebuildShuffle();
  },

  clear(this: PlaylistState) {
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
  rebuildShuffle(this: PlaylistState) {
    rebuildShuffleOn(this);
  },

  /**
   * Advance to the next queue index (mutates shuffle cursor when needed).
   * Uses the same rules as {@link peekNextIndex}, then applies side effects.
   */
  nextIndex(this: PlaylistState) {
    return stepNext(this);
  },

  /**
   * Next queue index without advancing shuffle / rebuilding order.
   * When the next track is unknown (shuffle wrap that would reshuffle),
   * returns -1 so callers (e.g. near-end prepare) can skip.
   */
  peekNextIndex(this: PlaylistState) {
    return computeNextIndex(this);
  },

  prevIndex(this: PlaylistState, currentTime) {
    if (!this.tracks.length) return -1;
    if (currentTime > 3) {
      return { restart: true, index: this.index };
    }
    return stepPrev(this);
  },

  /**
   * Step a cursor copy until isPlayable; commit landing or write nothing.
   */
  advanceToPlayable(this: PlaylistState, dir, isPlayable) {
    const clone: PlaylistCursor = {
      tracks: this.tracks,
      index: this.index,
      shuffle: this.shuffle,
      shuffleOrder: this.shuffleOrder.slice(),
      shufflePos: this.shufflePos,
      repeat: this.repeat,
    };
    const step = dir === "prev" ? stepPrev : stepNext;
    const seen = new Set<number>();
    let idx = step(clone);
    while (idx >= 0 && !isPlayable(clone.tracks[idx])) {
      if (seen.has(idx)) {
        idx = -1;
        break;
      }
      seen.add(idx);
      clone.index = idx;
      idx = step(clone);
    }
    if (idx < 0) return -1;
    this.index = idx;
    this.shufflePos = clone.shufflePos;
    this.shuffleOrder = clone.shuffleOrder;
    return idx;
  },
};

export const pl = reactive(playlistState);

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
function readPlaylistRaw(): string | null {
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
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return;
    const rec = data as {
      playlist?: unknown;
      currentIndex?: unknown;
      shuffle?: unknown;
      repeat?: unknown;
    };
    if (Array.isArray(rec.playlist)) {
      pl.tracks = mapTracks(rec.playlist);
    }
    if (typeof rec.currentIndex === "number") pl.index = rec.currentIndex;
    if (typeof rec.shuffle === "boolean") pl.shuffle = rec.shuffle;
    if (
      rec.repeat === "off" ||
      rec.repeat === "one" ||
      rec.repeat === "all"
    ) {
      pl.repeat = rec.repeat;
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
export async function addToQueue(
  entries: Array<QueueEntry | null | undefined> | null | undefined,
) {
  if (!entries?.length) return;

  const ids: string[] = [];
  const preloaded: Track[] = [];

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

  const items: Track[] = [...preloaded];

  if (ids.length) {
    try {
      const meta = await fetchTracksMeta(ids);
      const byId = new Map(meta.map((m) => [m.id, m]));
      for (const id of ids) {
        const t = byId.get(id);
        if (t) items.push(t);
      }
    } catch (err: unknown) {
      console.error(err);
    }
  }

  const playable = items.filter((t) => t.id && !t.isMissing);
  if (!playable.length) return;
  pl.add(playable);
  commit();

  // Exclusive: prepare by per-track exclusive tags (never browser codec).
  if (isExclusiveEnabled()) {
    requestExclusivePrepare(playable);
    return;
  }
  // Skip prepare when playback policy will prefer a local download.
  const active = getActiveStreamCodec();
  const toPrepare = tracksNeedingPrepare(playable, active);
  if (toPrepare.length) requestPrepare(toPrepare, active);
}

/**
 * Group tracks by exclusive profile tag and prepare each group.
 * Caps depth to next N when queue is long (worker pressure).
 */
export function requestExclusivePrepare(
  tracks: Track[],
  opts: { urgent?: boolean; limit?: number } = {},
) {
  const limit = opts.limit ?? 24;
  const list = (tracks || []).filter((t) => t?.id).slice(0, limit);
  const byTag = new Map<string, Track[]>();
  for (const t of list) {
    const tag = getExclusiveProfileTag(t);
    if (!tag) continue;
    let bucket = byTag.get(tag);
    if (!bucket) {
      bucket = [];
      byTag.set(tag, bucket);
    }
    bucket.push(t);
  }
  for (const [tag, group] of byTag) {
    requestPrepare(group, tag, { urgent: !!opts.urgent });
  }
}

/**
 * Tracks that still need a server stream prepare under current playback policy.
 * Skips ids that will prefer a local download when online, using in-memory
 * catalog projection (missing entry ⇒ still prepare; no IDB).
 */
export function tracksNeedingPrepare(
  tracks: Array<Track | null | undefined>,
  activeCodec: string,
): Track[] {
  const eligible = (tracks || []).filter((t): t is Track => !!(t?.id && !t.isLossy));
  // Exclusive always needs server stream tags (never skip for downloads).
  if (isExclusiveEnabled()) {
    return eligible;
  }
  if (!downloads.enabled) {
    return eligible;
  }
  const out: Track[] = [];
  const policy = settings.playbackPolicy;
  const codecCatalog = settings.options;
  const byTrack = catalogIndex.byTrack;
  for (const t of eligible) {
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

export function trackNeedsStreamPrepare(
  track: Track | null | undefined,
  activeCodec: string,
): boolean {
  return tracksNeedingPrepare(track ? [track] : [], activeCodec).length > 0;
}

export function removeIndices(
  indices: number[],
  playIndex: (index: number) => void,
  stopPlayback: () => void,
) {
  if (!indices.length) return;
  const removingCurrent = pl.removeIndices(indices);
  commit();
  if (removingCurrent) {
    if (pl.length && pl.index >= 0) playIndex(pl.index);
    else stopPlayback();
  }
}

export function clearPlaylist(stopPlayback: () => void) {
  pl.clear();
  stopPlayback();
  preparedKeys.clear();
  clearCache("streams");
  commit();
}

export function reorderPlaylist(from: number, to: number) {
  pl.reorder(from, to);
  commit();
}

export async function fetchSavedPlaylists(): Promise<SavedPlaylist[]> {
  const data = await apiGet<{ items?: SavedPlaylist[] }>("/api/playlists");
  return data.items || [];
}

export async function loadSavedPlaylist(
  id: string,
  stopPlayback: () => void,
) {
  const tracks = (await fetchPlaylistTracks(id)).filter(
    (t) => !t.isMissing && t.id
  );
  if (!tracks.length) return;
  stopPlayback();
  pl.clear();
  await addToQueue(tracks);
}

export async function deleteSavedPlaylist(id: string) {
  await apiDelete(`/api/playlists/${encodeURIComponent(id)}`);
}

export async function saveQueueAsPlaylist(name: string) {
  const ids = pl.tracks.map((t) => t.id).filter(Boolean);
  if (!ids.length) {
    throw new Error(
      "Queue has no indexed tracks to save (wait for scan / use Artists or Albums)."
    );
  }
  const created = await apiPost<{ id: string }>("/api/playlists", {
    name: name.trim(),
  });
  await apiPut(`/api/playlists/${encodeURIComponent(created.id)}/tracks`, {
    track_ids: ids,
  });
  return created;
}
