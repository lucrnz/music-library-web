/**
 * Lyrics resolve: memory → downloads IDB → network.
 *
 * Memory and IDB only keep terminal successes (ok / instrumental) so
 * pending / not_found / error revalidate on the next open after a scan.
 * Payloads are camelCase Lyrics (see models/lyrics.js).
 */

import { fetchLyrics } from "@/api";
import { getTrackRecord } from "@/downloads/catalog";
import { getLyricsRecord, putLyricsRecord } from "@/downloads/lyricsStore";
import { emptyLyrics, fromApiLyrics, type Lyrics } from "@/models/lyrics";

const memory = new Map<string, Lyrics>();

function isTerminalSuccess(payload: Lyrics | null | undefined): boolean {
  if (!payload) return false;
  const status = payload.status;
  return status === "ok" || status === "instrumental";
}

function remember(trackId: string, payload: Lyrics): void {
  if (trackId && isTerminalSuccess(payload)) {
    memory.set(trackId, payload);
  } else if (trackId) {
    memory.delete(trackId);
  }
}

/**
 * Resolve lyrics for a track. Persists to downloads IDB when that track
 * is in the download catalog and the result is a terminal success.
 */
export async function resolveLyrics(
  trackId: string,
  opts: { allowNetwork?: boolean } = {},
): Promise<Lyrics> {
  const allowNetwork = opts.allowNetwork !== false;
  if (!trackId) {
    return emptyLyrics(null);
  }

  const mem = memory.get(trackId);
  if (mem && isTerminalSuccess(mem)) return mem;

  try {
    const idb = await getLyricsRecord(trackId);
    if (idb && idb.payload) {
      const normalized = fromApiLyrics(idb.payload);
      if (isTerminalSuccess(normalized)) {
        remember(trackId, normalized);
        return normalized;
      }
    }
  } catch {
    /* IDB optional */
  }

  if (!allowNetwork) {
    return emptyLyrics(trackId);
  }

  const payload = await fetchLyrics(trackId);
  remember(trackId, payload);

  if (isTerminalSuccess(payload)) {
    try {
      const rec = await getTrackRecord(trackId);
      if (rec) {
        await putLyricsRecord(trackId, payload);
      }
    } catch {
      /* ignore offline persist failures */
    }
  }

  return payload;
}
