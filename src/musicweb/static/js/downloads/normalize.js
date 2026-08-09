/**
 * Canonical track shape for the downloads subsystem.
 * Normalize at the boundary so catalog/queue never dual-read fields.
 */

/**
 * @typedef {object} NormalizedTrack
 * @property {string} id
 * @property {string} title
 * @property {string} artist
 * @property {string} album
 * @property {string|null} albumId
 * @property {string|null} artistId
 * @property {string|null} albumArtistId
 * @property {string} albumArtist
 * @property {number|null} track
 * @property {number|null} disc
 * @property {number|null} duration
 * @property {number|null} year
 * @property {boolean} isMissing
 */

/**
 * @param {object} track
 * @returns {NormalizedTrack}
 */
export function normalizeTrack(track) {
  if (!track || typeof track !== "object") {
    throw new Error("Track required");
  }
  const id = track.id || track.trackId;
  if (!id) throw new Error("Track id required");

  const albumArtistId =
    track.album_artist_id || track.albumArtistId || null;
  const artistId = track.artist_id || track.artistId || null;
  const albumArtist =
    track.album_artist || track.albumArtist || track.artist || "";

  return {
    id: String(id),
    title: track.title || "",
    artist: track.artist || "",
    album: track.album || "",
    albumId: track.album_id || track.albumId || null,
    artistId,
    albumArtistId,
    albumArtist,
    track: track.track ?? track.track_no ?? track.trackNum ?? null,
    disc: track.disc ?? track.disc_no ?? null,
    duration: track.duration ?? null,
    year: track.year ?? null,
    isMissing: !!(track.is_missing || track.isMissing),
  };
}

/** Artist ids to pin art for (album artist + track artist, unique). */
export function artistIdsOf(n) {
  const ids = [];
  if (n.albumArtistId) ids.push(n.albumArtistId);
  if (n.artistId && n.artistId !== n.albumArtistId) ids.push(n.artistId);
  return ids;
}

export function primaryArtistIdOf(n) {
  return n.albumArtistId || n.artistId || "_unknown";
}

export function primaryArtistNameOf(n) {
  return n.albumArtist || n.artist || "Unknown artist";
}

export function codecExt(codec) {
  if (typeof codec === "string" && codec.startsWith("flac")) return "flac";
  return "opus";
}

export function codecMediaType(codec) {
  if (typeof codec === "string" && codec.startsWith("flac")) return "audio/flac";
  return "audio/ogg";
}
