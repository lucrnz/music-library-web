/**
 * Client-side state: the playlist (tracks + shuffle cursor) and the codec
 * catalog/preference, plus sessionStorage persistence. Imports only dom.js
 * (for the audio element in prevIndex), so it stays below the UI layers.
 */
import { audio } from "./dom.js";

const STORAGE_KEY = "musicweb.playlist.v1";
const DEFAULT_CODEC = "aac_256_44100";

/**
 * Render callbacks registered by the UI layer (ui.js) at startup. State and
 * playback code call these instead of importing UI modules — this indirection
 * is what keeps the module graph acyclic (commit() is needed by player.js and
 * playlist.js, while the renders themselves live in those same UI modules).
 */
export const render = {
  sync: () => {},
  playlist: () => {},
};

// ── Playlist ─────────────────────────────────────────────────────────
class Playlist {
  constructor() {
    /** @type {{ path: string, title: string, artist: string, album: string, duration: number|null }[]} */
    this.tracks = [];
    /** Index of the loaded track; -1 when nothing is loaded. */
    this.index = -1;
    this.shuffle = false;
    /** @type {'off'|'one'|'all'} */
    this.repeat = "off";
    /** @type {number[]} */
    this.shuffleOrder = [];
    this.shufflePos = -1;
  }

  get length() {
    return this.tracks.length;
  }

  get current() {
    return this.index >= 0 ? this.tracks[this.index] : null;
  }

  add(items) {
    this.tracks.push(...items);
    this.rebuildShuffle();
  }

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
  }

  reorder(from, to) {
    const [item] = this.tracks.splice(from, 1);
    this.tracks.splice(to, 0, item);
    if (this.index === from) this.index = to;
    else if (from < this.index && to >= this.index) this.index -= 1;
    else if (from > this.index && to <= this.index) this.index += 1;
    this.rebuildShuffle();
  }

  clear() {
    this.tracks = [];
    this.index = -1;
    this.shuffleOrder = [];
    this.shufflePos = -1;
  }

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
      [this.shuffleOrder[i], this.shuffleOrder[j]] = [this.shuffleOrder[j], this.shuffleOrder[i]];
    }
    this.shufflePos = this.index >= 0 ? this.shuffleOrder.indexOf(this.index) : -1;
  }

  nextIndex() {
    if (!this.tracks.length) return -1;
    if (this.repeat === "one") return this.index;
    if (this.shuffle) {
      if (!this.shuffleOrder.length) {
        // Only reachable right after a session restore.
        this.rebuildShuffle();
        this.shufflePos = 0;
        return this.shuffleOrder[0];
      }
      this.shufflePos += 1;
      if (this.shufflePos >= this.shuffleOrder.length) {
        if (this.repeat === "all") {
          this.rebuildShuffle();
          this.shufflePos = 0;
        } else {
          return -1;
        }
      }
      return this.shuffleOrder[this.shufflePos];
    }
    const next = this.index + 1;
    if (next < this.tracks.length) return next;
    if (this.repeat === "all") return 0;
    return -1;
  }

  prevIndex() {
    if (!this.tracks.length) return -1;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return this.index;
    }
    if (this.shuffle) {
      if (this.shufflePos > 0) {
        this.shufflePos -= 1;
        return this.shuffleOrder[this.shufflePos];
      }
      // Symmetric with nextIndex's wrap: at the start of the order,
      // repeat-all wraps to the end instead of dead-ending here.
      if (this.repeat === "all" && this.shuffleOrder.length > 1) {
        this.shufflePos = this.shuffleOrder.length - 1;
        return this.shuffleOrder[this.shufflePos];
      }
      return this.index;
    }
    if (this.index > 0) return this.index - 1;
    if (this.repeat === "all") return this.tracks.length - 1;
    return this.index;
  }
}

export const pl = new Playlist();

/**
 * Codec catalog from GET /api/codecs, the validated stream preference, and
 * the server-provided default. Falls back to a single hardcoded default
 * entry if the fetch fails so the player still works.
 */
export const codec = {
  stream: DEFAULT_CODEC,
  /**
   * Catalog entries from GET /api/codecs, already filtered to formats this
   * browser can decode (silent fixture probes in codecSupport.js).
   * @type {{ id: string, label: string, kind?: string, media_type?: string, can_play?: string }[]}
   */
  options: [{ id: DEFAULT_CODEC, label: "AAC 256k 44.1kHz" }],
  default: DEFAULT_CODEC,
};

// ── Persistence (sessionStorage) ───────────────────────────────────────
function savePlaylist() {
  try {
    sessionStorage.setItem(
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

export function loadPlaylist() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.playlist)) pl.tracks = data.playlist;
    if (typeof data.currentIndex === "number") pl.index = data.currentIndex;
    if (typeof data.shuffle === "boolean") pl.shuffle = data.shuffle;
    if (data.repeat === "off" || data.repeat === "one" || data.repeat === "all") {
      pl.repeat = data.repeat;
    }
  } catch {
    /* ignore */
  }
}

/**
 * Full re-sync after any playlist-state mutation. All the renders are
 * idempotent, so call sites never hand-pick a subset.
 */
export function commit() {
  render.sync();
  savePlaylist();
}
