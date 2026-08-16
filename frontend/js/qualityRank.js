/**
 * Client-side quality ranking for stream / download profile tags.
 * FLAC always ranks above Opus; within kind use bitrate, bit depth, sample rate.
 */

/**
 * @typedef {{ id: string, kind?: string, bitrate_kbps?: number, bit_depth?: number, sample_rate?: number }} ProfileMeta
 */

/**
 * @param {string} id
 * @returns {{ kind: string, bitrate_kbps: number, bit_depth: number, sample_rate: number } | null}
 */
function parseTagHeuristic(id) {
  if (!id || typeof id !== "string") return null;
  const parts = id.split("_");
  const kind = parts[0];
  if (kind === "opus") {
    const bitrate_kbps = Number(parts[1]) || 0;
    const sample_rate = Number(parts[2]) || 0;
    return { kind: "opus", bitrate_kbps, bit_depth: 16, sample_rate };
  }
  if (kind === "flac") {
    // flac_16_44100 | flac_24_96000
    const bit_depth = Number(parts[1]) || 0;
    const sample_rate = Number(parts[2]) || 0;
    return { kind: "flac", bitrate_kbps: 0, bit_depth, sample_rate };
  }
  return null;
}

/**
 * @param {string | ProfileMeta | null | undefined} profileOrId
 * @param {ProfileMeta[]} [catalog]
 * @returns {ProfileMeta | null}
 */
export function resolveProfileMeta(profileOrId, catalog = []) {
  if (profileOrId == null) return null;
  if (typeof profileOrId === "object") {
    const id = profileOrId.id;
    if (!id) return profileOrId;
    const fromCat = catalog.find((o) => o.id === id);
    return fromCat ? { ...fromCat, ...profileOrId } : profileOrId;
  }
  const id = String(profileOrId);
  const fromCat = catalog.find((o) => o.id === id);
  if (fromCat) return fromCat;
  const parsed = parseTagHeuristic(id);
  return parsed ? { id, ...parsed } : { id };
}

/**
 * Numeric rank: higher is better.
 * Kind base: flac 1e12, opus 1e9, unknown 0.
 * Then bit_depth * 1e6, bitrate * 1e3, sample_rate.
 *
 * @param {string | ProfileMeta | null | undefined} profileOrId
 * @param {ProfileMeta[]} [catalog]
 * @returns {number}
 */
export function rankForProfile(profileOrId, catalog = []) {
  const meta = resolveProfileMeta(profileOrId, catalog);
  if (!meta?.id && !meta?.kind) return 0;

  const kind = (meta.kind || parseTagHeuristic(meta.id)?.kind || "").toLowerCase();
  let kindBase = 0;
  if (kind === "flac") kindBase = 1e12;
  else if (kind === "opus") kindBase = 1e9;
  else kindBase = 0;

  const bitDepth = Number(meta.bit_depth) || 0;
  const bitrate = Number(meta.bitrate_kbps) || 0;
  const rate = Number(meta.sample_rate) || 0;

  return kindBase + bitDepth * 1e6 + bitrate * 1e3 + rate;
}

/**
 * @param {string | ProfileMeta | null | undefined} a
 * @param {string | ProfileMeta | null | undefined} b
 * @param {ProfileMeta[]} [catalog]
 * @returns {-1|0|1} negative if a < b, 0 equal, positive if a > b
 */
export function compareQuality(a, b, catalog = []) {
  const ra = rankForProfile(a, catalog);
  const rb = rankForProfile(b, catalog);
  if (ra < rb) return -1;
  if (ra > rb) return 1;
  return 0;
}

/**
 * True if local download quality is at least as good as the active stream profile.
 * @param {string | ProfileMeta | null | undefined} localCodec
 * @param {string | ProfileMeta | null | undefined} streamCodec
 * @param {ProfileMeta[]} [catalog]
 */
export function localAtLeastAsGood(localCodec, streamCodec, catalog = []) {
  return compareQuality(localCodec, streamCodec, catalog) >= 0;
}
