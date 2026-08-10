/**
 * Canonical client Lyrics type.
 *
 * API responses are snake_case; normalize once at the boundary with
 * fromApiLyrics. Leaf code (overlay, cache) uses camelCase only.
 */

/**
 * @typedef {object} Lyrics
 * @property {string|null} trackId
 * @property {'ok'|'not_found'|'error'|'instrumental'|'pending'|'skipped'} status
 * @property {string|null} source
 * @property {boolean} isSynced
 * @property {string|null} plainText
 * @property {string|null} syncedLrc
 * @property {boolean} instrumental
 */

/**
 * Coerce API / IDB / partial lyrics-like object into Lyrics.
 * Accepts snake_case (server) and camelCase (already normalized / new IDB).
 *
 * @param {object|null|undefined} raw
 * @returns {Lyrics}
 */
export function fromApiLyrics(raw) {
  if (!raw || typeof raw !== "object") {
    return emptyLyrics(null);
  }
  const status = raw.status || "not_found";
  const instrumental =
    !!(raw.instrumental) || status === "instrumental";
  return {
    trackId: raw.trackId ?? raw.track_id ?? null,
    status,
    source: raw.source ?? null,
    isSynced: !!(raw.isSynced ?? raw.is_synced),
    plainText: raw.plainText ?? raw.plain_text ?? null,
    syncedLrc: raw.syncedLrc ?? raw.synced_lrc ?? null,
    instrumental,
  };
}

/**
 * @param {string|null} trackId
 * @returns {Lyrics}
 */
export function emptyLyrics(trackId) {
  return {
    trackId: trackId ?? null,
    status: "not_found",
    source: null,
    isSynced: false,
    plainText: null,
    syncedLrc: null,
    instrumental: false,
  };
}
