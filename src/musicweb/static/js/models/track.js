/**
 * Canonical client Track type.
 *
 * API responses are snake_case; normalize once at the boundary with
 * fromApiTrack / mapTracks / fromCatalogRecord. Leaf code uses camelCase only.
 */

/**
 * @typedef {object} Track
 * @property {string} id
 * @property {string|null} path
 * @property {string} title
 * @property {string} artist
 * @property {string} album
 * @property {string|null} albumId
 * @property {string|null} artistId
 * @property {string} albumArtist
 * @property {string|null} albumArtistId
 * @property {number|null} track
 * @property {number|null} disc
 * @property {number|null} year
 * @property {number|null} duration  seconds
 * @property {number|null} durationMs
 * @property {boolean} isMissing
 */

/**
 * IDB catalog track record (denormalized for offline). Project to Track via
 * fromCatalogRecord before UI / playlist / player / enqueue.
 *
 * @typedef {object} CatalogTrackRecord
 * @property {string} trackId
 * @property {string} [title]
 * @property {string} [artist]
 * @property {string} [album]
 * @property {string|null} [albumId]
 * @property {string[]} [artistIds]
 * @property {string} [primaryArtistId]
 * @property {string} [primaryArtistName]
 * @property {number|null} [trackNum]
 * @property {number|null} [disc]
 * @property {number|null} [duration]
 * @property {number|null} [year]
 * @property {string} [codec]
 * @property {string} [status]
 */

/**
 * Coerce any API / storage / partial track-like object into a Track.
 * Accepts snake_case, camelCase, and download-catalog fields.
 *
 * @param {object} raw
 * @returns {Track}
 */
export function fromApiTrack(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Track required");
  }
  const id = raw.id || raw.trackId;
  if (!id) throw new Error("Track id required");

  const albumArtistId = raw.albumArtistId ?? raw.album_artist_id ?? null;
  const artistId = raw.artistId ?? raw.artist_id ?? null;
  const albumArtist =
    raw.albumArtist ?? raw.album_artist ?? raw.artist ?? "";

  let duration = raw.duration ?? null;
  let durationMs = raw.durationMs ?? raw.duration_ms ?? null;
  if (durationMs == null && duration != null && Number.isFinite(Number(duration))) {
    durationMs = Math.round(Number(duration) * 1000);
  }
  if (duration == null && durationMs != null && Number.isFinite(Number(durationMs))) {
    duration = Number(durationMs) / 1000;
  }

  return {
    id: String(id),
    path: raw.path ?? raw.rel_path ?? null,
    title: raw.title || "",
    artist: raw.artist || "",
    album: raw.album || "",
    albumId: raw.albumId ?? raw.album_id ?? null,
    artistId: artistId != null ? String(artistId) : null,
    albumArtistId: albumArtistId != null ? String(albumArtistId) : null,
    albumArtist: albumArtist || "",
    track: raw.track ?? raw.track_no ?? raw.trackNum ?? null,
    disc: raw.disc ?? raw.disc_no ?? null,
    year: raw.year ?? null,
    duration: duration != null ? Number(duration) : null,
    durationMs: durationMs != null ? Number(durationMs) : null,
    isMissing: !!(raw.isMissing ?? raw.is_missing),
  };
}

/**
 * Project an IDB catalog track record to the client Track type.
 * Catalog keeps trackId / trackNum / primaryArtist* for offline storage.
 *
 * @param {CatalogTrackRecord|object} rec
 * @returns {Track}
 */
export function fromCatalogRecord(rec) {
  if (!rec || typeof rec !== "object") {
    throw new Error("Catalog track record required");
  }
  const artistIds = Array.isArray(rec.artistIds) ? rec.artistIds : [];
  return fromApiTrack({
    id: rec.trackId || rec.id,
    title: rec.title,
    artist: rec.artist,
    album: rec.album,
    albumId: rec.albumId ?? null,
    artistId: artistIds[0] || rec.primaryArtistId || rec.artistId || null,
    albumArtistId: rec.primaryArtistId || rec.albumArtistId || null,
    albumArtist: rec.primaryArtistName || rec.albumArtist || rec.artist || "",
    track: rec.trackNum ?? rec.track ?? null,
    disc: rec.disc ?? null,
    year: rec.year ?? null,
    duration: rec.duration ?? null,
    isMissing: false,
  });
}

/**
 * True when value is already a full client Track (not a bare id ref).
 * Bare `{ id }` / collect file rows fail this and must go through meta fetch.
 *
 * @param {unknown} obj
 * @returns {obj is Track}
 */
export function isTrack(obj) {
  if (!obj || typeof obj !== "object") return false;
  const t = /** @type {Record<string, unknown>} */ (obj);
  return (
    typeof t.id === "string" &&
    t.id.length > 0 &&
    typeof t.title === "string" &&
    typeof t.artist === "string" &&
    typeof t.album === "string" &&
    "albumId" in t &&
    typeof t.albumArtist === "string" &&
    typeof t.isMissing === "boolean"
  );
}

/**
 * Like fromApiTrack but returns null instead of throwing.
 * @param {unknown} raw
 * @returns {Track|null}
 */
export function coerceTrack(raw) {
  try {
    return fromApiTrack(/** @type {object} */ (raw));
  } catch {
    return null;
  }
}

/**
 * @param {unknown[]} list
 * @returns {Track[]}
 */
export function mapTracks(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const t = coerceTrack(item);
    if (t) out.push(t);
  }
  return out;
}

/** Alias used by downloads enqueue/commit — same as fromApiTrack. */
export function normalizeTrack(track) {
  return fromApiTrack(track);
}

/** Artist ids to pin art for (album artist + track artist, unique). */
export function artistIdsOf(/** @type {Track} */ n) {
  const ids = [];
  if (n.albumArtistId) ids.push(n.albumArtistId);
  if (n.artistId && n.artistId !== n.albumArtistId) ids.push(n.artistId);
  return ids;
}

export function primaryArtistIdOf(/** @type {Track} */ n) {
  return n.albumArtistId || n.artistId || "_unknown";
}

export function primaryArtistNameOf(/** @type {Track} */ n) {
  return n.albumArtist || n.artist || "Unknown artist";
}
