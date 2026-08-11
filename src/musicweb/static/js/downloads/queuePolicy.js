/**
 * Download queue policy: user pause, auto-pause, health, resume-on-boot.
 */

import {
  autoPauseReason,
  canReachServer,
  isHardOffline,
  onConnectivityChange,
  onConnectivityRecovered,
  requestHealthProbe,
  setHealthContext,
} from "../connectivity.js";
import { isConstrainedConnection } from "../networkConstraints.js";
import { settings } from "../stores/settings.js";
import { codecExt } from "./codec.js";
import { getOne, putOne } from "./db.js";
import {
  audioDirParts,
  audioFileName,
  partialByteSize,
} from "./opfs.js";
import {
  emitQueueChange,
  setQueueMutationSideEffects,
} from "./queueEvents.js";
import {
  flushProgressToIdb,
  seedLiveProgress,
  updateLiveProgress,
} from "./queueProgress.js";
import {
  freezeWork,
  listQueue,
  queueHasWork,
  unpauseItemsToPending,
} from "./queueStore.js";
import { QueueState, markPaused } from "./queueTransitions.js";

const META_USER_PAUSED = "userPaused";

/** @type {boolean} */
let userPaused = false;
let policyBound = false;
/** @type {null | (() => void)} */
let schedulePumpFn = null;
/** @type {boolean} */
let downloadsEnabled = false;

/**
 * Combined auto-pause: offline / server / mobile data (when only-download-on-Wi‑Fi).
 * @returns {null | 'offline' | 'server' | 'metered'}
 */
export function downloadAutoPauseReason() {
  const base = autoPauseReason();
  if (base) return base;
  if (settings.onlyDownloadOnWifi && isConstrainedConnection()) {
    return "metered";
  }
  return null;
}

export async function syncHealthFromPolicy() {
  const hasWork = await queueHasWork();
  setHealthContext({ enabled: downloadsEnabled, queueHasWork: hasWork });
  if (downloadsEnabled && hasWork && !isHardOffline() && !canReachServer()) {
    requestHealthProbe(0);
  }
}

/**
 * @param {{ schedulePump: () => void }} hooks
 */
export function initPolicy(hooks) {
  schedulePumpFn = hooks.schedulePump;
  setQueueMutationSideEffects(async () => {
    await syncHealthFromPolicy();
    if (schedulePumpFn) schedulePumpFn();
  });
  if (policyBound) return;
  policyBound = true;

  onConnectivityChange(() => {
    const reason = downloadAutoPauseReason();
    if (reason) {
      freezeWork(reason).catch(console.error);
    } else {
      emitQueueChange();
    }
  });

  onConnectivityRecovered(() => {
    reapplyNetworkPolicy().catch(console.error);
  });
}

/**
 * Re-evaluate offline / server / metered policy after constraint, setting, or recovery.
 */
export async function reapplyNetworkPolicy() {
  const reason = downloadAutoPauseReason();
  if (reason) {
    await freezeWork(reason);
  } else if (!userPaused) {
    await unpauseItemsToPending();
  } else {
    emitQueueChange();
  }
}

/**
 * @param {boolean} enabled
 */
export async function setDownloadsEnabled(enabled) {
  downloadsEnabled = !!enabled;
  await syncHealthFromPolicy();
}

export function getUserPaused() {
  return userPaused;
}

export async function loadUserPausedFlag() {
  try {
    const row = await getOne("meta", META_USER_PAUSED);
    userPaused = !!(row && row.value);
  } catch {
    userPaused = false;
  }
  return userPaused;
}

async function saveUserPausedFlag(on) {
  userPaused = !!on;
  try {
    await putOne("meta", { key: META_USER_PAUSED, value: userPaused });
  } catch {
    /* ignore */
  }
}

export function canPump() {
  return !userPaused && !downloadAutoPauseReason();
}

export function getQueueControlState() {
  const reason = downloadAutoPauseReason();
  return {
    userPaused,
    autoPausedReason: reason,
    isPaused: userPaused || !!reason,
  };
}

export function getPauseBanner() {
  if (userPaused) {
    return "Paused by you — downloads won't start until you resume.";
  }
  const reason = downloadAutoPauseReason();
  if (reason === "offline") {
    return "Paused — you're offline. Downloads will resume when you're back online.";
  }
  if (reason === "server") {
    return "Paused — waiting for the library server. Retrying automatically…";
  }
  if (reason === "metered") {
    return "Paused — waiting for Wi‑Fi. Downloads won't use mobile data.";
  }
  return "";
}

export async function pauseAllDownloads() {
  await saveUserPausedFlag(true);
  const items = await listQueue();
  for (const it of items) {
    if (it.state === QueueState.ACTIVE) {
      await flushProgressToIdb(it.id);
    }
  }
  await freezeWork("user-pause");
}

export async function resumeAllDownloads() {
  await saveUserPausedFlag(false);
  if (!isHardOffline() && !canReachServer()) {
    requestHealthProbe(0);
  }
  await reapplyNetworkPolicy();
}

export async function onJobNetworkFailure() {
  await freezeWork(downloadAutoPauseReason() || "server");
}

/**
 * Hydrate interrupted jobs on boot, then apply policy once.
 */
export async function resumeQueue() {
  await loadUserPausedFlag();
  const items = await listQueue();
  for (const it of items) {
    if (it.state === QueueState.ACTIVE) {
      markPaused(it, "interrupted");
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

  await setDownloadsEnabled(true);
  await reapplyNetworkPolicy();
}
