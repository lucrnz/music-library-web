/**
 * Public queue surface for app code (downloads/index.js).
 * Worker imports concrete modules (queueStore, queuePolicy, …) directly.
 *
 * Modules:
 *   queueEvents / queueRuntime / queueTransitions / queueProgress / queueStore / queuePolicy
 */

export {
  emitProgress,
  emitQueueChange,
  onProgressChange,
  onQueueChange,
} from "./queueEvents.js";

export {
  abortAllJobs,
  abortJob,
  activeIds,
  controllers,
} from "./queueRuntime.js";

export {
  QueueState,
  markActive,
  markCanceled,
  markFailed,
  markPaused,
  markPending,
  resolveAbortKind,
} from "./queueTransitions.js";

export {
  clearLiveProgress,
  flushProgressToIdb,
  getAllLiveProgress,
  getLiveProgress,
  seedLiveProgress,
  updateLiveProgress,
} from "./queueProgress.js";

export {
  cancelQueueItem,
  clearAllQueue,
  clearFinishedQueue,
  discardPartialForItem,
  discardRow,
  freezeWork,
  listQueue,
  queueHasWork,
  unpauseItemsToPending,
} from "./queueStore.js";

export {
  canPump,
  downloadAutoPauseReason,
  getPauseBanner,
  getQueueControlState,
  getUserPaused,
  initPolicy,
  loadUserPausedFlag,
  onJobNetworkFailure,
  pauseAllDownloads,
  reapplyNetworkPolicy,
  resumeAllDownloads,
  resumeQueue,
  setDownloadsEnabled,
  syncHealthFromPolicy,
} from "./queuePolicy.js";

import {
  enqueueMany as enqueueManyStore,
  enqueueTrack as enqueueTrackStore,
  retryQueueItem as retryQueueItemStore,
} from "./queueStore.js";
import { getUserPaused } from "./queuePolicy.js";

/**
 * @param {import("../models/track.js").Track|object} track
 * @param {string} codec
 */
export async function enqueueTrack(track, codec) {
  return enqueueTrackStore(track, codec, getUserPaused());
}

/**
 * @param {import("../models/track.js").Track[]|object[]} tracks
 * @param {string} codec
 */
export async function enqueueMany(tracks, codec) {
  return enqueueManyStore(tracks, codec, getUserPaused());
}

/**
 * @param {number} id
 */
export async function retryQueueItem(id) {
  return retryQueueItemStore(id, getUserPaused());
}
