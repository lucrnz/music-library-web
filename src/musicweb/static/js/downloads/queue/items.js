/**
 * Queue IDB CRUD.
 */

import {
  audioDirParts,
  audioFileName,
  codecExt,
  getTrackRecord,
  normalizeTrack,
} from "../catalog.js";
import {
  clearStore,
  deleteOne,
  getAll,
  getOne,
  putOne,
  withStore,
  withStores,
} from "../db.js";
import { removePartial } from "../opfs.js";
import {
  autoPauseReason,
  canReachServer,
  isHardOffline,
} from "../connectivity.js";
import { emitQueueChange } from "./events.js";
import { clearLiveProgress } from "./progress.js";
import { abortJob, activeIds } from "./runtime.js";

function trackCodecKey(trackId, codec) {
  return `${trackId}|${codec}`;
}

function initialState(userPaused) {
  if (userPaused || isHardOffline() || !canReachServer()) return "paused";
  return "pending";
}

/**
 * @param {object} item
 */
export async function discardPartialForItem(item) {
  try {
    const ext = codecExt(item.codec);
    const fileName = audioFileName(item.trackId, item.codec, ext);
    await removePartial(audioDirParts(), fileName);
  } catch {
    /* ignore */
  }
}

export async function listQueue() {
  const items = await getAll("queue");
  return items.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
}

/**
 * @param {object} track
 * @param {string} codec
 * @param {{ userPaused: boolean }} ctx
 */
export async function enqueueTrack(track, codec, ctx) {
  const n = normalizeTrack(track);
  if (n.isMissing) throw new Error("Track file is missing on server");

  const key = trackCodecKey(n.id, codec);
  const existing = await withStore("queue", "readonly", (s) =>
    s.index("trackCodec").get(key)
  );
  if (existing && existing.state !== "failed" && existing.state !== "canceled") {
    return existing;
  }
  if (existing && (existing.state === "failed" || existing.state === "canceled")) {
    await deleteOne("queue", existing.id);
    clearLiveProgress(existing.id);
  }

  const rec = await getTrackRecord(n.id);
  if (rec && rec.codec === codec && rec.status === "ready") {
    return { id: null, skipped: true, trackId: n.id, codec };
  }

  const item = {
    trackCodec: key,
    trackId: n.id,
    codec,
    snapshot: {
      id: n.id,
      title: n.title,
      artist: n.artist,
      album: n.album,
      album_id: n.albumId,
      artist_id: n.artistId,
      album_artist_id: n.albumArtistId,
      album_artist: n.albumArtist,
      track: n.track,
      disc: n.disc,
      duration: n.duration,
      year: n.year,
    },
    state: initialState(ctx.userPaused),
    error: null,
    loaded: 0,
    total: null,
    addedAt: Date.now(),
  };
  item.id = await withStore("queue", "readwrite", (s) => s.add(item));
  emitQueueChange();
  return item;
}

/**
 * @param {object[]} tracks
 * @param {string} codec
 * @param {{ userPaused: boolean }} ctx
 */
export async function enqueueMany(tracks, codec, ctx) {
  const results = [];
  for (const t of tracks) {
    try {
      const n = normalizeTrack(t);
      if (n.isMissing) continue;
      results.push(await enqueueTrack(n, codec, ctx));
    } catch {
      /* skip */
    }
  }
  return results;
}

export async function cancelQueueItem(id) {
  const item = await getOne("queue", id);
  if (!item) return;
  if (item.state === "active") {
    item.state = "canceled";
    await putOne("queue", item);
    abortJob(id, "cancel");
  } else {
    await discardPartialForItem(item);
    clearLiveProgress(id);
    await deleteOne("queue", id);
  }
  activeIds.delete(id);
  emitQueueChange();
}

/**
 * @param {number} id
 * @param {{ userPaused: boolean }} ctx
 */
export async function retryQueueItem(id, ctx) {
  const item = await getOne("queue", id);
  if (!item) return;
  item.state = initialState(ctx.userPaused);
  item.error = null;
  await putOne("queue", item);
  emitQueueChange();
}

export async function clearFinishedQueue() {
  const items = await listQueue();
  await withStores(["queue"], "readwrite", async (stores) => {
    for (const it of items) {
      if (it.state === "failed" || it.state === "canceled") {
        stores.queue.delete(it.id);
      }
    }
  });
  for (const it of items) {
    if (it.state === "failed" || it.state === "canceled") {
      await discardPartialForItem(it);
      clearLiveProgress(it.id);
    }
  }
  emitQueueChange();
}

/**
 * @param {() => void} stopWorkers
 */
export async function clearAllQueue(stopWorkers) {
  stopWorkers();
  const items = await listQueue();
  for (const it of items) {
    await discardPartialForItem(it);
    clearLiveProgress(it.id);
  }
  await clearStore("queue");
  emitQueueChange();
}

/**
 * Batch set active+pending → paused; abort actives.
 * @param {string} reasonLabel
 */
export async function freezeWork(reasonLabel) {
  const items = await listQueue();
  /** @type {number[]} */
  const abortIds = [];
  await withStores(["queue"], "readwrite", async (stores) => {
    for (const it of items) {
      if (it.state !== "active" && it.state !== "pending") continue;
      if (it.state === "active") abortIds.push(it.id);
      it.state = "paused";
      stores.queue.put(it);
    }
  });
  for (const id of abortIds) {
    abortJob(id, reasonLabel || "pause");
    activeIds.delete(id);
  }
  emitQueueChange();
}

export async function unpauseItemsToPending() {
  const items = await listQueue();
  await withStores(["queue"], "readwrite", async (stores) => {
    for (const it of items) {
      if (it.state === "paused") {
        it.state = "pending";
        it.error = null;
        stores.queue.put(it);
      }
    }
  });
  emitQueueChange();
}

export async function queueHasWork() {
  const items = await listQueue();
  return items.some(
    (i) =>
      i.state === "pending" || i.state === "active" || i.state === "paused"
  );
}

