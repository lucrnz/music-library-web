/**
 * IDB helpers for offline lyrics (store "lyrics", keyPath trackId).
 */

import { getOne, putOne, withStores } from "@/downloads/db";
import type { Lyrics } from "@/models/lyrics";

export interface LyricsRecord {
  trackId: string;
  payload: Lyrics;
  savedAt: number;
}

export async function getLyricsRecord(trackId: string): Promise<LyricsRecord | null> {
  try {
    return (await getOne<LyricsRecord>("lyrics", trackId)) ?? null;
  } catch {
    return null;
  }
}

export async function putLyricsRecord(trackId: string, payload: Lyrics) {
  if (!trackId || !payload) return;
  await putOne<LyricsRecord>("lyrics", {
    trackId,
    payload,
    savedAt: Date.now(),
  });
}

/**
 * @param {string} trackId
 */
export async function deleteLyricsRecord(trackId: string) {
  if (!trackId) return;
  await withStores(["lyrics"], "readwrite", async (stores) => {
    stores.lyrics.delete(trackId);
  });
}
