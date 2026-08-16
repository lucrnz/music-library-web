/**
 * Canonical client Lyrics type.
 *
 * API responses are snake_case; normalize once at the boundary with
 * fromApiLyrics. Leaf code (overlay, cache) uses camelCase only.
 */

export type LyricsStatus =
  | "ok"
  | "not_found"
  | "error"
  | "instrumental"
  | "pending"
  | "skipped";

export interface Lyrics {
  trackId: string | null;
  status: LyricsStatus;
  source: string | null;
  isSynced: boolean;
  plainText: string | null;
  syncedLrc: string | null;
  instrumental: boolean;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

/**
 * Coerce API / IDB / partial lyrics-like object into Lyrics.
 * Accepts snake_case (server) and camelCase (already normalized / new IDB).
 */
export function fromApiLyrics(raw: unknown): Lyrics {
  const rec = asRecord(raw);
  if (!rec) {
    return emptyLyrics(null);
  }
  const status = (typeof rec.status === "string" ? rec.status : "not_found") as LyricsStatus;
  const instrumental = !!rec.instrumental || status === "instrumental";
  return {
    trackId: (rec.trackId ?? rec.track_id ?? null) as string | null,
    status,
    source: (rec.source ?? null) as string | null,
    isSynced: !!(rec.isSynced ?? rec.is_synced),
    plainText: (rec.plainText ?? rec.plain_text ?? null) as string | null,
    syncedLrc: (rec.syncedLrc ?? rec.synced_lrc ?? null) as string | null,
    instrumental,
  };
}

export function emptyLyrics(trackId: string | null): Lyrics {
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
