/**
 * Canonical client Album type.
 *
 * API responses are snake_case; normalize once at the boundary with
 * fromApiAlbum / mapAlbums. Leaf code uses camelCase only.
 */

export interface Album {
  id: string;
  title: string;
  artist: string;
  artistId: string | null;
  year: number | null;
  trackCount: number | null;
  /** seconds */
  duration: number | null;
  durationMs: number | null;
  hasCover: boolean;
  lossyKind: string | null;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

export function fromApiAlbum(raw: unknown): Album {
  const rec = asRecord(raw);
  if (!rec) {
    throw new Error("Album required");
  }
  const id = rec.id;
  if (!id) throw new Error("Album id required");
  const artistId = rec.artistId ?? rec.artist_id ?? null;
  const trackCount = rec.trackCount ?? rec.track_count ?? null;
  const lossyKind = rec.lossyKind ?? rec.lossy_kind ?? null;
  let duration = rec.duration ?? null;
  let durationMs = rec.durationMs ?? rec.duration_ms ?? null;
  if (durationMs == null && duration != null && Number.isFinite(Number(duration))) {
    durationMs = Math.round(Number(duration) * 1000);
  }
  if (duration == null && durationMs != null && Number.isFinite(Number(durationMs))) {
    duration = Number(durationMs) / 1000;
  }
  return {
    id: String(id),
    title: typeof rec.title === "string" ? rec.title : "",
    artist: typeof rec.artist === "string" ? rec.artist : "",
    artistId: artistId != null ? String(artistId) : null,
    year: rec.year == null ? null : Number(rec.year),
    trackCount: trackCount != null ? Number(trackCount) : null,
    duration: duration != null ? Number(duration) : null,
    durationMs: durationMs != null ? Number(durationMs) : null,
    hasCover: !!(rec.hasCover ?? rec.has_cover),
    lossyKind:
      lossyKind === "mp3" ||
      lossyKind === "aac" ||
      lossyKind === "mixed" ||
      lossyKind === "lossy"
        ? lossyKind
        : null,
  };
}

export function coerceAlbum(raw: unknown): Album | null {
  try {
    return fromApiAlbum(raw);
  } catch {
    return null;
  }
}

export function mapAlbums(list: unknown): Album[] {
  if (!Array.isArray(list)) return [];
  const out: Album[] = [];
  for (const item of list) {
    const a = coerceAlbum(item);
    if (a) out.push(a);
  }
  return out;
}
