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
} from "@/api";
import { coerceTrack, isTrack, mapTracks, type Track } from "@/models/track";
import { preparedKeys, prepareTracks, requestForget } from "@/playback/prepare";

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
  prevIndex(): number;
  advanceToPlayable(
    dir: "next" | "prev",
    isPlayable: (track: Track | undefined) => boolean,
  ): number;
}

export interface SavedPlaylist {
  id: string;
  name?: string;
  trackCount: number;
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

  prevIndex(this: PlaylistState) {
    if (!this.tracks.length) return -1;
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

/** Resolve queue entries to playable Track rows (full objects, ids, `{ id }`). */
async function resolveQueueEntries(
  entries: Array<QueueEntry | null | undefined> | null | undefined,
): Promise<Track[]> {
  if (!entries?.length) return [];

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

  return items.filter((t) => t.id && !t.isMissing);
}

/**
 * Add tracks to the playback queue.
 * Accepts full Track objects, or bare ids / { id } (meta-fetched).
 */
export async function addToQueue(
  entries: Array<QueueEntry | null | undefined> | null | undefined,
) {
  const playable = await resolveQueueEntries(entries);
  if (!playable.length) return;
  pl.add(playable);
  commit();
  prepareTracks(playable);
}

/**
 * Replace the session queue with the resolved playable set.
 * Empty / all-unplayable input is a no-op (returns false).
 */
export async function replaceQueue(
  entries: Array<QueueEntry | null | undefined> | null | undefined,
): Promise<boolean> {
  const playable = await resolveQueueEntries(entries);
  if (!playable.length) return false;
  const oldIds = pl.tracks
    .map((t) => t.id)
    .filter((id): id is string => !!id);
  requestForget(idsLeavingQueue(oldIds, playable));
  pl.clear();
  pl.add(playable);
  commit();
  prepareTracks(playable, { replace: true });
  return true;
}

export function idsLeavingQueue(
  removedIds: Iterable<string>,
  remaining: Array<{ id?: string }>,
): string[] {
  const still = new Set(
    remaining.map((t) => t.id).filter((id): id is string => !!id),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of removedIds) {
    if (!id || still.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function removeIndices(indices: number[]): {
  removedCurrent: boolean;
  nextIndex: number;
} {
  if (!indices.length) return { removedCurrent: false, nextIndex: pl.index };
  const removed = indices
    .map((i) => pl.tracks[i]?.id)
    .filter((id): id is string => !!id);
  const removedCurrent = pl.removeIndices(indices);
  commit();
  requestForget(idsLeavingQueue(removed, pl.tracks));
  return { removedCurrent, nextIndex: pl.index };
}

export function clearPlaylist(stopPlayback: () => void) {
  const ids = [
    ...new Set(pl.tracks.map((t) => t.id).filter((id): id is string => !!id)),
  ];
  pl.clear();
  stopPlayback();
  preparedKeys.clear();
  requestForget(ids);
  commit();
}

export function reorderPlaylist(from: number, to: number) {
  pl.reorder(from, to);
  commit();
}

export async function fetchSavedPlaylists(): Promise<SavedPlaylist[]> {
  const data = await apiGet<{
    items?: Array<{ id: string; name?: string; track_count?: number }>;
  }>("/api/playlists");
  return (data.items || []).map((item) => ({
    id: item.id,
    name: item.name,
    trackCount: Number(item.track_count) || 0,
  }));
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
