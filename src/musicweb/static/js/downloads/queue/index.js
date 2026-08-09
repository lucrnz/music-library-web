/**
 * Public download queue API.
 */

import {
  audioDirParts,
  audioFileName,
  codecExt,
} from "../catalog.js";
import {
  canReachServer,
  isHardOffline,
  requestHealthProbe,
} from "../connectivity.js";
import { putOne } from "../db.js";
import { partialByteSize } from "../opfs.js";
import { emitQueueChange, onProgressChange, onQueueChange } from "./events.js";
import {
  cancelQueueItem as cancelItem,
  clearAllQueue as clearAllItems,
  clearFinishedQueue as clearFinished,
  enqueueMany as enqueueManyItems,
  enqueueTrack as enqueueTrackItem,
  listQueue,
  queueHasWork,
  retryQueueItem as retryItem,
} from "./items.js";
import {
  getPauseBanner,
  getQueueControlState,
  getUserPaused,
  initPolicy,
  loadUserPausedFlag,
  pauseAllDownloads,
  resumeAllDownloads,
  setDownloadsEnabled,
  syncHealthFromPolicy,
} from "./policy.js";
import { getAllLiveProgress, seedLiveProgress, updateLiveProgress } from "./progress.js";
import { schedulePump, stopAllWorkers } from "./worker.js";

initPolicy({ schedulePump });

/**
 * @param {object} track
 * @param {string} codec
 */
export async function enqueueTrack(track, codec) {
  const item = await enqueueTrackItem(track, codec, {
    userPaused: getUserPaused(),
  });
  await syncHealthFromPolicy();
  schedulePump();
  return item;
}

/**
 * @param {object[]} tracks
 * @param {string} codec
 */
export async function enqueueMany(tracks, codec) {
  const results = await enqueueManyItems(tracks, codec, {
    userPaused: getUserPaused(),
  });
  await syncHealthFromPolicy();
  schedulePump();
  return results;
}

export async function cancelQueueItem(id) {
  await cancelItem(id);
  await syncHealthFromPolicy();
  schedulePump();
}

export async function retryQueueItem(id) {
  await retryItem(id, { userPaused: getUserPaused() });
  await syncHealthFromPolicy();
  schedulePump();
}

export async function clearFinishedQueue() {
  await clearFinished();
  await syncHealthFromPolicy();
}

export async function clearAllQueue() {
  await clearAllItems(() => stopAllWorkers());
  await syncHealthFromPolicy();
}

export async function resumeQueue() {
  await loadUserPausedFlag();
  const items = await listQueue();
  for (const it of items) {
    if (it.state === "active") {
      it.state = "paused";
      try {
        const ext = codecExt(it.codec);
        const fileName = audioFileName(it.trackId, it.codec, ext);
        const size = await partialByteSize(audioDirParts(), fileName);
        if (size > 0) {
          it.loaded = size;
          updateLiveProgress(it.id, size, it.total ?? null, {
            forceUi: true,
            persistNow: true,
          });
        }
      } catch {
        /* ignore */
      }
      await putOne("queue", it);
    } else if (it.loaded || it.total) {
      seedLiveProgress(it.id, it.loaded || 0, it.total ?? null);
    }
  }
  emitQueueChange();

  await setDownloadsEnabled(true);
  await syncHealthFromPolicy();

  if (isHardOffline()) {
    emitQueueChange();
    return;
  }

  if (getUserPaused()) {
    emitQueueChange();
    return;
  }

  const hasWork = await queueHasWork();
  if (hasWork && !canReachServer()) {
    requestHealthProbe(0);
    return;
  }
  if (hasWork) {
    // Prefer pump when online; dirty recovery already rewrote active→paused
    const { unpauseItemsToPending } = await import("./items.js");
    await unpauseItemsToPending();
    schedulePump();
  }
}

export {
  listQueue,
  onQueueChange,
  onProgressChange,
  getAllLiveProgress,
  pauseAllDownloads,
  resumeAllDownloads,
  getQueueControlState,
  getPauseBanner,
  setDownloadsEnabled,
  syncHealthFromPolicy,
  schedulePump,
};
