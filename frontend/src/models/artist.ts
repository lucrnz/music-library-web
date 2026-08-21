/**
 * Canonical client Artist type.
 *
 * API responses are snake_case; normalize once at the boundary with
 * fromApiArtist / mapArtists. Leaf code uses camelCase only.
 */

export interface Artist {
  id: string;
  name: string;
  sortName: string | null;
  albumCount: number;
  trackCount: number;
  hasImage: boolean;
  hasPreferredImage: boolean;
  preferredRev: number;
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

function asCount(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function fromApiArtist(raw: unknown): Artist {
  const rec = asRecord(raw);
  if (!rec) {
    throw new Error("Artist required");
  }
  const id = pick(rec, "id");
  if (!id) throw new Error("Artist id required");
  const sortName = pick(rec, "sortName", "sort_name");
  return {
    id: String(id),
    name: String(pick(rec, "name") ?? ""),
    sortName: sortName != null ? String(sortName) : null,
    albumCount: asCount(pick(rec, "albumCount", "album_count") ?? 0),
    trackCount: asCount(pick(rec, "trackCount", "track_count") ?? 0),
    hasImage: !!(pick(rec, "hasImage", "has_image") ?? false),
    hasPreferredImage: !!(
      pick(rec, "hasPreferredImage", "has_preferred_image") ?? false
    ),
    preferredRev: asCount(pick(rec, "preferredRev", "preferred_rev") ?? 0),
  };
}

export function coerceArtist(raw: unknown): Artist | null {
  try {
    return fromApiArtist(raw);
  } catch {
    return null;
  }
}

export function mapArtists(list: unknown): Artist[] {
  if (!Array.isArray(list)) return [];
  const out: Artist[] = [];
  for (const item of list) {
    const a = coerceArtist(item);
    if (a) out.push(a);
  }
  return out;
}
