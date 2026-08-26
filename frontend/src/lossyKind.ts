/**
 * Lossy source identity for play, status, and title marks.
 */

/** Delivery / download tag for original lossy bytes. */
export const SOURCE_TAG = "source";

/** Toast / details copy for a lossy-source file. */
export const LOSSY_SOURCE_COPY =
  "Lossy source - played as stored. Not a lossless file.";

export type LossyKind = "mp3" | "aac" | "lossy";
export type AlbumLossyKind = LossyKind | "mixed";

export interface LossyTrackLike {
  isLossy?: boolean;
  sourceCodec?: string | null;
  bitrateKbps?: number | null;
}

export interface LossySourceParts {
  label: string | null;
  bitrateKbps: number;
}

export interface SourceFileMedia {
  ext: string;
  mediaType: string;
}

/**
 * Stream / download tag: original bytes for lossy, else the active profile.
 */
export function deliveryCodec(
  track: { isLossy?: boolean } | null | undefined,
  activeCodec: string | null | undefined,
): string | null {
  if (track?.isLossy) return SOURCE_TAG;
  return activeCodec || null;
}

export function kindForTrack(
  track: { isLossy?: boolean; sourceCodec?: string | null } | null | undefined,
): LossyKind | null {
  if (!track?.isLossy) return null;
  const kind = (track.sourceCodec || "").toLowerCase();
  if (kind === "mp3" || kind === "aac") return kind;
  return "lossy";
}

/** Album kind from a list of track-like records (offline catalog). */
export function kindForTracks(
  tracks:
    | Array<{ isLossy?: boolean; sourceCodec?: string | null }>
    | null
    | undefined,
): AlbumLossyKind | null {
  const kinds = new Set<LossyKind>();
  for (const t of tracks || []) {
    const k = kindForTrack(t);
    if (k) kinds.add(k);
  }
  if (kinds.size === 0) return null;
  if (kinds.size === 1) return [...kinds][0];
  return "mixed";
}

export function kindForAlbum(
  album: { lossyKind?: string | null } | null | undefined,
): AlbumLossyKind | null {
  const raw = album?.lossyKind ?? null;
  if (raw === "mp3" || raw === "aac" || raw === "mixed" || raw === "lossy") {
    return raw;
  }
  return null;
}

/** Source-file codec label and bitrate for status and details. */
export function lossySourceParts(
  track:
    | { sourceCodec?: string | null; bitrateKbps?: number | null }
    | null
    | undefined,
): LossySourceParts {
  const kind = (track?.sourceCodec || "").toLowerCase();
  let label: string | null = null;
  if (kind === "mp3") label = "MP3";
  else if (kind === "aac") label = "AAC";
  else if (kind) label = kind.toUpperCase();
  const bitrateKbps = Number(track?.bitrateKbps) || 0;
  return { label, bitrateKbps };
}

/** Status-line codec text from the source file (not a stream profile). */
export function formatLossyCodecText(
  track:
    | { sourceCodec?: string | null; bitrateKbps?: number | null }
    | null
    | undefined,
): string | null {
  const { label, bitrateKbps } = lossySourceParts(track);
  if (!label) return null;
  return bitrateKbps > 0 ? `${label} ${bitrateKbps}k` : label;
}

/** Original-file extension and MIME for a lossy source codec. */
export function sourceFileMedia(
  sourceCodec: string | null | undefined,
): SourceFileMedia {
  const kind = (sourceCodec || "").toLowerCase();
  if (kind === "mp3") return { ext: "mp3", mediaType: "audio/mpeg" };
  if (kind === "aac") return { ext: "m4a", mediaType: "audio/mp4" };
  throw new Error("lossy sourceCodec must be mp3 or aac");
}
