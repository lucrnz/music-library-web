/**
 * Queue IDB CRUD: enqueue, cancel, clear, freeze/unpause, list.
 */

import { canReachServer, isHardOffline } from "../connectivity.js";
import { normalizeTrack } from "../models/track.js";
import { codecExt } from "./codec.js";
import {
  clearStore,
  deleteOne,
  getAll,
  getOne,
  putOne,
  withStore,
  withStores,
} from "./db.js";
import {
  audioDirParts,
  audioFileName,
  removePartial,
} from "./opfs.js";
import { emitQueueChange } from "./queueEvents.js";
import { clearLiveProgress } from "./queueProgress.js";
import { abortJob, activeIds } from "./queueRuntime.js";
import {
  QueueState,
  markCanceled,
  markPaused,
  markPending,
} from "./queueTransitions.js";
import { getTrackRecord } from "./records.js";

/**
 * @param {object} item
 * @param {boolean} userPaused
 */
function applyInitialState(item, userPaused) {
  if (userPaused || isHardOffline() || !canReachServer()) {
    markPaused(item, "initial");
  } else {
    markPending(item);
  }
}

function trackCodecKey(trackId, codec) {
  return `${trackId}|${codec}`;
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

/**
 * Remove queue row + partial files (non-active cancel / cleanup).
 * @param {object} item
 */
export async function discardRow(item) {
  await discardPartialForItem(item);
  clearLiveProgress(item.id);
  await deleteOne("queue", item.id);
  activeIds.delete(item.id);
}

export async function listQueue() {
  const items = await getAll("queue");
  return items.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
}

/**
 * @param {import("../models/track.js").Track|object} track
 * @param {string} codec
 * @param {{ userPaused: boolean }} ctx
 */
async function enqueueTrackCore(track, codec, ctx) {
  const n = normalizeTrack(track);
  if (n.isMissing) throw new Error("Track file is missing on server");

  const key = trackCodecKey(n.id, codec);
  const existing = await withStore("queue", "readonly", (s) =>
    s.index("trackCodec").get(key)
  );
  if (
    existing &&
    existing.state !== QueueState.FAILED &&
    existing.state !== QueueState.CANCELED
  ) {
    return existing;
  }
  if (
    existing &&
    (existing.state === QueueState.FAILED ||
      existing.state === QueueState.CANCELED)
  ) {
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
      albumId: n.albumId,
      artistId: n.artistId,
      albumArtistId: n.albumArtistId,
      albumArtist: n.albumArtist,
      track: n.track,
      disc: n.disc,
      duration: n.duration,
      year: n.year,
      isMissing: false,
    },
    state: QueueState.PENDING,
    error: null,
    loaded: 0,
    total: null,
    addedAt: Date.now(),
  };
  applyInitialState(item, ctx.userPaused);
  item.id = await withStore("queue", "readwrite", (s) => s.add(item));
  return item;
}

/**
 * @param {import("../models/track.js").Track|object} track
 * @param {string} codec
 * @param {boolean} userPaused
 */
export async function enqueueTrack(track, codec, userPaused) {
  const item = await enqueueTrackCore(track, codec, { userPaused });
  emitQueueChange();
  return item;
}

/**
 * @param {import("../models/track.js").Track[]|object[]} tracks
 * @param {string} codec
 * @param {boolean} userPaused
 */
export async function enqueueMany(tracks, codec, userPaused) {
  const ctx = { userPaused };
  const results = [];
  for (const t of tracks) {
    try {
      const n = normalizeTrack(t);
      if (n.isMissing) continue;
      results.push(await enqueueTrackCore(n, codec, ctx));
    } catch {
      /* skip */
    }
  }
  emitQueueChange();
  return results;
}

export async function cancelQueueItem(id) {
  const item = await getOne("queue", id);
  if (!item) return;
  if (item.state === QueueState.ACTIVE) {
    markCanceled(item);
    await putOne("queue", item);
    abortJob(id, "cancel");
  } else {
    await discardRow(item);
  }
  activeIds.delete(id);
  emitQueueChange();
}

/**
 * @param {number} id
 * @param {boolean} userPaused
 */
export async function retryQueueItem(id, userPaused) {
  const item = await getOne("queue", id);
  if (!item) return;
  applyInitialState(item, userPaused);
  await putOne("queue", item);
  emitQueueChange();
}

export async function clearFinishedQueue() {
  const items = await listQueue();
  await withStores(["queue"], "readwrite", async (stores) => {
    for (const it of items) {
      if (
        it.state === QueueState.FAILED ||
        it.state === QueueState.CANCELED
      ) {
        stores.queue.delete(it.id);
      }
    }
  });
  for (const it of items) {
    if (
      it.state === QueueState.FAILED ||
      it.state === QueueState.CANCELED
    ) {
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
 * @param {string} reasonLabel
 */
export async function freezeWork(reasonLabel) {
  const items = await listQueue();
  /** @type {number[]} */
  const abortIds = [];
  await withStores(["queue"], "readwrite", async (stores) => {
    for (const it of items) {
      if (
        it.state !== QueueState.ACTIVE &&
        it.state !== QueueState.PENDING
      ) {
        continue;
      }
      if (it.state === QueueState.ACTIVE) abortIds.push(it.id);
      markPaused(it, reasonLabel || "pause");
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
      if (it.state === QueueState.PAUSED) {
        markPending(it);
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
      i.state === QueueState.PENDING ||
      i.state === QueueState.ACTIVE ||
      i.state === QueueState.PAUSED
  );
}
