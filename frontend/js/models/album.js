/**
 * Canonical client Album type.
 *
 * API responses are snake_case; normalize once at the boundary with
 * fromApiAlbum / mapAlbums. Leaf code uses camelCase only.
 */

/**
 * @typedef {object} Album
 * @property {string} id
 * @property {string} title
 * @property {string} artist
 * @property {string|null} artistId
 * @property {number|null} year
 * @property {number|null} trackCount
 * @property {boolean} hasCover
 * @property {string|null} lossyKind
 */

/**
 * @param {object} raw
 * @returns {Album}
 */
export function fromApiAlbum(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Album required");
  }
  const id = raw.id;
  if (!id) throw new Error("Album id required");
  const artistId = raw.artistId ?? raw.artist_id ?? null;
  const trackCount = raw.trackCount ?? raw.track_count ?? null;
  const lossyKind = raw.lossyKind ?? raw.lossy_kind ?? null;
  return {
    id: String(id),
    title: raw.title || "",
    artist: raw.artist || "",
    artistId: artistId != null ? String(artistId) : null,
    year: raw.year ?? null,
    trackCount: trackCount != null ? Number(trackCount) : null,
    hasCover: !!(raw.hasCover ?? raw.has_cover),
    lossyKind:
      lossyKind === "mp3" ||
      lossyKind === "aac" ||
      lossyKind === "mixed" ||
      lossyKind === "lossy"
        ? lossyKind
        : null,
  };
}

/**
 * @param {unknown} raw
 * @returns {Album|null}
 */
export function coerceAlbum(raw) {
  try {
    return fromApiAlbum(/** @type {object} */ (raw));
  } catch {
    return null;
  }
}

/**
 * @param {unknown[]} list
 * @returns {Album[]}
 */
export function mapAlbums(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const a = coerceAlbum(item);
    if (a) out.push(a);
  }
  return out;
}
