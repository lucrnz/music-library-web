/**
 * Lyrics resolve: memory → downloads IDB → network.
 *
 * Memory and IDB only keep terminal successes (ok / instrumental) so
 * pending / not_found / error revalidate on the next open after a scan.
 * Payloads are camelCase Lyrics (see models/lyrics.js).
 */

import { fetchLyrics } from "../api.js";
import { getTrackRecord } from "../downloads/catalog.js";
import {
  getLyricsRecord,
  putLyricsRecord,
} from "../downloads/lyricsStore.js";
import { emptyLyrics, fromApiLyrics } from "../models/lyrics.js";

/** @type {Map<string, import("../models/lyrics.js").Lyrics>} */
const memory = new Map();

/**
 * @param {import("../models/lyrics.js").Lyrics|null|undefined} payload
 * @returns {boolean}
 */
function isTerminalSuccess(payload) {
  if (!payload) return false;
  const status = payload.status;
  return status === "ok" || status === "instrumental";
}

/**
 * @param {string} trackId
 * @param {import("../models/lyrics.js").Lyrics} payload
 */
function remember(trackId, payload) {
  if (trackId && isTerminalSuccess(payload)) {
    memory.set(trackId, payload);
  } else if (trackId) {
    memory.delete(trackId);
  }
}

/**
 * Resolve lyrics for a track. Persists to downloads IDB when that track
 * is in the download catalog and the result is a terminal success.
 *
 * @param {string} trackId
 * @param {{ allowNetwork?: boolean }} [opts]
 * @returns {Promise<import("../models/lyrics.js").Lyrics>}
 */
export async function resolveLyrics(trackId, opts = {}) {
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
