/**
 * Lyrics resolve: memory → downloads IDB → network.
 *
 * Memory and IDB keep ok / instrumental / not_found. pending / error are
 * not written. Online resolve revalidates not_found.
 * Payloads are camelCase Lyrics (see models/lyrics.js).
 */

import { fetchLyrics } from "@/api";
import { getOne } from "@/downloads/db";
import { getLyricsRecord, putLyricsRecord } from "@/downloads/lyricsStore";
import { emptyLyrics, fromApiLyrics, type Lyrics } from "@/models/lyrics";
import type { CatalogTrackRecord } from "@/models/track";

const memory = new Map<string, Lyrics>();

/** Sync read of the in-memory map only. Miss is undefined, not not_found. */
export function peekLyricsMemory(trackId: string): Lyrics | undefined {
  if (!trackId) return undefined;
  return memory.get(trackId);
}

/** Drop keys that start with ``prefix`` (Yellow Book uses ``cdrom:``). */
export function dropLyricsMemory(prefix: string): void {
  if (!prefix) return;
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
}

export function rememberLyricsMemory(trackId: string, payload: Lyrics): void {
  remember(trackId, payload);
}

function isTerminalSuccess(payload: Lyrics | null | undefined): boolean {
  if (!payload) return false;
  const status = payload.status;
  return status === "ok" || status === "instrumental";
}

function isPersistableLyrics(payload: Lyrics | null | undefined): boolean {
  if (!payload) return false;
  const status = payload.status;
  return status === "ok" || status === "instrumental" || status === "not_found";
}

function remember(trackId: string, payload: Lyrics): void {
  if (trackId && isPersistableLyrics(payload)) {
    memory.set(trackId, payload);
  } else if (trackId) {
    memory.delete(trackId);
  }
}

async function persistIfCatalogued(trackId: string, payload: Lyrics) {
  if (!isPersistableLyrics(payload)) return;
  try {
    const rec = await getOne<CatalogTrackRecord>("tracks", trackId);
    if (rec) await putLyricsRecord(trackId, payload);
  } catch {
    /* ignore offline persist failures */
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
  if (mem && mem.status === "not_found" && !allowNetwork) return mem;

  try {
    const idb = await getLyricsRecord(trackId);
    if (idb && idb.payload) {
      const normalized = fromApiLyrics(idb.payload);
      if (isTerminalSuccess(normalized)) {
        remember(trackId, normalized);
        return normalized;
      }
      if (normalized.status === "not_found" && !allowNetwork) {
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
  await persistIfCatalogued(trackId, payload);
  return payload;
}

/** Best-effort lyrics GET for a just-finalized / backfilled catalog row. */
export async function cacheLyricsForDownload(trackId: string): Promise<void> {
  if (!trackId) return;
  try {
    const payload = await fetchLyrics(trackId);
    remember(trackId, payload);
    if (isPersistableLyrics(payload)) {
      await putLyricsRecord(trackId, payload);
    }
  } catch {
    /* companion miss must not fail the audio job */
  }
}
