/**
 * Lossy source identity for play, status, and title marks.
 */

/** Delivery / download tag for original lossy bytes. */
export const SOURCE_TAG = "source";

/** Toast / details copy for a lossy-source file. */
export const LOSSY_SOURCE_COPY =
  "Lossy source — played as stored. Not a lossless file.";

/**
 * Stream / download tag: original bytes for lossy, else the active profile.
 * @param {{ isLossy?: boolean }|null|undefined} track
 * @param {string|null|undefined} activeCodec
 */
export function deliveryCodec(track, activeCodec) {
  if (track?.isLossy) return SOURCE_TAG;
  return activeCodec || null;
}

/**
 * @param {{ isLossy?: boolean, sourceCodec?: string|null }|null|undefined} track
 * @returns {'mp3'|'aac'|'lossy'|null}
 */
export function kindForTrack(track) {
  if (!track?.isLossy) return null;
  const kind = (track.sourceCodec || "").toLowerCase();
  if (kind === "mp3" || kind === "aac") return kind;
  return "lossy";
}

/**
 * Album kind from a list of track-like records (offline catalog).
 * @param {Array<{ isLossy?: boolean, sourceCodec?: string|null }>} tracks
 * @returns {'mp3'|'aac'|'lossy'|'mixed'|null}
 */
export function kindForTracks(tracks) {
  const kinds = new Set();
  for (const t of tracks || []) {
    const k = kindForTrack(t);
    if (k) kinds.add(k);
  }
  if (kinds.size === 0) return null;
  if (kinds.size === 1) return [...kinds][0];
  return "mixed";
}

/**
 * @param {{ lossyKind?: string|null }|null|undefined} album
 * @returns {'mp3'|'aac'|'mixed'|'lossy'|null}
 */
export function kindForAlbum(album) {
  const raw = album?.lossyKind ?? null;
  if (raw === "mp3" || raw === "aac" || raw === "mixed" || raw === "lossy") {
    return raw;
  }
  return null;
}

/**
 * Source-file codec label and bitrate for status and details.
 * @param {{ sourceCodec?: string|null, bitrateKbps?: number|null }|null|undefined} track
 * @returns {{ label: string|null, bitrateKbps: number }}
 */
export function lossySourceParts(track) {
  const kind = (track?.sourceCodec || "").toLowerCase();
  let label = null;
  if (kind === "mp3") label = "MP3";
  else if (kind === "aac") label = "AAC";
  else if (kind) label = kind.toUpperCase();
  const bitrateKbps = Number(track?.bitrateKbps) || 0;
  return { label, bitrateKbps };
}

/**
 * Status-line codec text from the source file (not a stream profile).
 * @param {{ sourceCodec?: string|null, bitrateKbps?: number|null }|null|undefined} track
 * @returns {string|null}
 */
export function formatLossyCodecText(track) {
  const { label, bitrateKbps } = lossySourceParts(track);
  if (!label) return null;
  return bitrateKbps > 0 ? `${label} ${bitrateKbps}k` : label;
}

/**
 * Original-file extension and MIME for a lossy source codec.
 * @param {string|null|undefined} sourceCodec
 * @returns {{ ext: string, mediaType: string }}
 */
export function sourceFileMedia(sourceCodec) {
  const kind = (sourceCodec || "").toLowerCase();
  if (kind === "mp3") return { ext: "mp3", mediaType: "audio/mpeg" };
  if (kind === "aac") return { ext: "m4a", mediaType: "audio/mp4" };
  throw new Error("lossy sourceCodec must be mp3 or aac");
}
