/**
 * IDB helpers for offline lyrics (store "lyrics", keyPath trackId).
 */

import { getOne, putOne, withStores } from "./db.js";

/**
 * @param {string} trackId
 * @returns {Promise<{ trackId: string, payload: object, savedAt: number }|null>}
 */
export async function getLyricsRecord(trackId) {
  try {
    return await getOne("lyrics", trackId);
  } catch {
    return null;
  }
}

/**
 * @param {string} trackId
 * @param {object} payload
 */
export async function putLyricsRecord(trackId, payload) {
  if (!trackId || !payload) return;
  await putOne("lyrics", {
    trackId,
    payload,
    savedAt: Date.now(),
  });
}

/**
 * @param {string} trackId
 */
export async function deleteLyricsRecord(trackId) {
  if (!trackId) return;
  await withStores(["lyrics"], "readwrite", async (stores) => {
    stores.lyrics.delete(trackId);
  });
}
