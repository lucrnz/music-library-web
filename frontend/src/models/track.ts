/**
 * Canonical client Track type.
 *
 * API responses are snake_case; normalize once at the boundary with
 * fromApiTrack / mapTracks / fromCatalogRecord. Leaf code uses camelCase only.
 */

export interface Track {
  id: string;
  path: string | null;
  title: string;
  artist: string;
  album: string;
  albumId: string | null;
  artistId: string | null;
  albumArtist: string;
  albumArtistId: string | null;
  track: number | null;
  disc: number | null;
  year: number | null;
  /** seconds */
  duration: number | null;
  durationMs: number | null;
  isMissing: boolean;
  sampleRateHz: number | null;
  bitDepth: number | null;
  isLossy: boolean;
  sourceCodec: string | null;
  bitrateKbps: number | null;
  bitrateMode: string | null;
}

/**
 * IDB catalog track record (denormalized for offline). Project to Track via
 * fromCatalogRecord before UI / playlist / player / enqueue.
 */
export interface CatalogTrackRecord {
  trackId: string;
  title?: string;
  artist?: string;
  album?: string;
  albumId?: string | null;
  artistIds?: string[];
  primaryArtistId?: string;
  primaryArtistName?: string;
  trackNum?: number | null;
  disc?: number | null;
  duration?: number | null;
  year?: number | null;
  codec?: string;
  status?: string;
  ext?: string;
  mediaType?: string;
  bytes?: number;
  downloadedAt?: number;
  isLossy?: boolean;
  sourceCodec?: string | null;
  bitrateKbps?: number | null;
  sampleRateHz?: number | null;
  bitrateMode?: string | null;
  id?: string;
  artistId?: string;
  albumArtistId?: string;
  albumArtist?: string;
  track?: number | null;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

function pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (k in raw && raw[k] != null) return raw[k];
  }
  return undefined;
}

/**
 * Coerce any API / storage / partial track-like object into a Track.
 * Accepts snake_case, camelCase, and download-catalog fields.
 */
export function fromApiTrack(raw: unknown): Track {
  const rec = asRecord(raw);
  if (!rec) {
    throw new Error("Track required");
  }
  const id = pick(rec, "id", "trackId");
  if (!id) throw new Error("Track id required");

  const albumArtistId = pick(rec, "albumArtistId", "album_artist_id") ?? null;
  const artistId = pick(rec, "artistId", "artist_id") ?? null;
  const albumArtist =
    pick(rec, "albumArtist", "album_artist", "artist") ?? "";

  let duration = pick(rec, "duration") ?? null;
  let durationMs = pick(rec, "durationMs", "duration_ms") ?? null;
  if (durationMs == null && duration != null && Number.isFinite(Number(duration))) {
    durationMs = Math.round(Number(duration) * 1000);
  }
  if (duration == null && durationMs != null && Number.isFinite(Number(durationMs))) {
    duration = Number(durationMs) / 1000;
  }

  return {
    id: String(id),
    path: (pick(rec, "path", "rel_path") as string | null | undefined) ?? null,
    title: String(pick(rec, "title") ?? ""),
    artist: String(pick(rec, "artist") ?? ""),
    album: String(pick(rec, "album") ?? ""),
    albumId: (pick(rec, "albumId", "album_id") as string | null | undefined) ?? null,
    artistId: artistId != null ? String(artistId) : null,
    albumArtistId: albumArtistId != null ? String(albumArtistId) : null,
    albumArtist: String(albumArtist || ""),
    track: (pick(rec, "track", "track_no", "trackNum") as number | null | undefined) ?? null,
    disc: (pick(rec, "disc", "disc_no") as number | null | undefined) ?? null,
    year: (pick(rec, "year") as number | null | undefined) ?? null,
    duration: duration != null ? Number(duration) : null,
    durationMs: durationMs != null ? Number(durationMs) : null,
    isMissing: !!(pick(rec, "isMissing", "is_missing") ?? false),
    sampleRateHz: _nullableNumber(pick(rec, "sampleRateHz", "sample_rate_hz")),
    bitDepth: _nullableNumber(pick(rec, "bitDepth", "bit_depth")),
    isLossy: !!(pick(rec, "isLossy", "is_lossy") ?? false),
    sourceCodec: (pick(rec, "sourceCodec", "source_codec") as string | null | undefined) ?? null,
    bitrateKbps: _nullableNumber(pick(rec, "bitrateKbps", "bitrate_kbps")),
    bitrateMode: (pick(rec, "bitrateMode", "bitrate_mode") as string | null | undefined) ?? null,
  };
}

function _nullableNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Project an IDB catalog track record to the client Track type.
 * Catalog keeps trackId / trackNum / primaryArtist* for offline storage.
 */
export function fromCatalogRecord(rec: CatalogTrackRecord | Record<string, unknown>): Track {
  const r = asRecord(rec);
  if (!r) {
    throw new Error("Catalog track record required");
  }
  const artistIds = Array.isArray(r.artistIds) ? r.artistIds : [];
  return fromApiTrack({
    id: r.trackId || r.id,
    title: r.title,
    artist: r.artist,
    album: r.album,
    albumId: r.albumId ?? null,
    artistId: artistIds[0] || r.primaryArtistId || r.artistId || null,
    albumArtistId: r.primaryArtistId || r.albumArtistId || null,
    albumArtist: r.primaryArtistName || r.albumArtist || r.artist || "",
    track: r.trackNum ?? r.track ?? null,
    disc: r.disc ?? null,
    year: r.year ?? null,
    duration: r.duration ?? null,
    isMissing: false,
    isLossy: r.isLossy ?? r.is_lossy,
    sourceCodec: r.sourceCodec ?? r.source_codec ?? null,
    bitrateKbps: r.bitrateKbps ?? r.bitrate_kbps,
    sampleRateHz: r.sampleRateHz ?? r.sample_rate_hz,
    bitrateMode: r.bitrateMode ?? r.bitrate_mode,
  });
}

/**
 * Project offline catalog track records to client Tracks.
 * Skips rows that fail fromCatalogRecord; preserves input order.
 */
export function tracksFromCatalogRecords(
  records: Array<CatalogTrackRecord | Record<string, unknown>> | null | undefined,
): Track[] {
  if (!records?.length) return [];
  const out: Track[] = [];
  for (const rec of records) {
    try {
      out.push(fromCatalogRecord(rec));
    } catch {
      /* skip unmappable row */
    }
  }
  return out;
}

/**
 * True when value is already a full client Track (not a bare id ref).
 * Bare `{ id }` / collect file rows fail this and must go through meta fetch.
 */
export function isTrack(obj: unknown): obj is Track {
  if (!obj || typeof obj !== "object") return false;
  const t = obj as Record<string, unknown>;
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

/** Like fromApiTrack but returns null instead of throwing. */
export function coerceTrack(raw: unknown): Track | null {
  try {
    return fromApiTrack(raw);
  } catch {
    return null;
  }
}

export function mapTracks(list: unknown): Track[] {
  if (!Array.isArray(list)) return [];
  const out: Track[] = [];
  for (const item of list) {
    const t = coerceTrack(item);
    if (t) out.push(t);
  }
  return out;
}

/** Alias used by downloads enqueue/commit — same as fromApiTrack. */
export function normalizeTrack(track: unknown): Track {
  return fromApiTrack(track);
}

/** Artist ids to pin art for (album artist + track artist, unique). */
export function artistIdsOf(n: Track): string[] {
  const ids: string[] = [];
  if (n.albumArtistId) ids.push(n.albumArtistId);
  if (n.artistId && n.artistId !== n.albumArtistId) ids.push(n.artistId);
  return ids;
}

export function primaryArtistIdOf(n: Track): string {
  return n.albumArtistId || n.artistId || "_unknown";
}

export function primaryArtistNameOf(n: Track): string {
  return n.albumArtist || n.artist || "Unknown artist";
}
