/**
 * User pause + canPump + freeze/unfreeze driven by connectivity.
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
import { getOne, putOne } from "../db.js";
import { emitQueueChange } from "./events.js";
import {
  freezeWork,
  listQueue,
  queueHasWork,
  unpauseItemsToPending,
} from "./items.js";
import { flushProgressToIdb } from "./progress.js";
import { abortAllJobs } from "./runtime.js";

const META_USER_PAUSED = "userPaused";

/** @type {boolean} */
let userPaused = false;
let policyBound = false;
/** @type {null | (() => void)} */
let schedulePumpFn = null;
/** @type {boolean} */
let downloadsEnabled = false;

/**
 * @param {{ schedulePump: () => void }} hooks
 */
export function initPolicy(hooks) {
  schedulePumpFn = hooks.schedulePump;
  if (policyBound) return;
  policyBound = true;

  onConnectivityChange(() => {
    const reason = autoPauseReason();
    if (reason) {
      freezeWork(reason).catch(console.error);
    }
    syncHealthFromPolicy().catch(console.error);
    emitQueueChange();
  });

  onConnectivityRecovered(() => {
    onNetworkRecovered().catch(console.error);
  });
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
  return !userPaused && canReachServer() && !isHardOffline();
}

export function getQueueControlState() {
  const reason = autoPauseReason();
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
  const reason = autoPauseReason();
  if (reason === "offline") {
    return "Paused — you're offline. Downloads will resume when you're back online.";
  }
  if (reason === "server") {
    return "Paused — waiting for the library server. Retrying automatically…";
  }
  return "";
}

export async function syncHealthFromPolicy() {
  const hasWork = await queueHasWork();
  setHealthContext({ enabled: downloadsEnabled, queueHasWork: hasWork });
  if (downloadsEnabled && hasWork && !isHardOffline() && !canReachServer()) {
    requestHealthProbe(0);
  }
}

export async function pauseAllDownloads() {
  await saveUserPausedFlag(true);
  const items = await listQueue();
  for (const it of items) {
    if (it.state === "active") {
      await flushProgressToIdb(it.id);
    }
  }
  await freezeWork("user-pause");
  await syncHealthFromPolicy();
  emitQueueChange();
}

export async function resumeAllDownloads() {
  await saveUserPausedFlag(false);
  if (isHardOffline()) {
    emitQueueChange();
    await syncHealthFromPolicy();
    return;
  }
  if (!canReachServer()) {
    requestHealthProbe(0);
    emitQueueChange();
    await syncHealthFromPolicy();
    return;
  }
  await unpauseItemsToPending();
  if (schedulePumpFn) schedulePumpFn();
  await syncHealthFromPolicy();
  emitQueueChange();
}

/**
 * Connectivity recovered to online — unpause network-paused work unless userPaused.
 */
export async function onNetworkRecovered() {
  if (userPaused || isHardOffline() || !canReachServer()) {
    await syncHealthFromPolicy();
    return;
  }
  await unpauseItemsToPending();
  if (schedulePumpFn) schedulePumpFn();
  await syncHealthFromPolicy();
  emitQueueChange();
}

/**
 * Report network failure from a job: freeze queue + connectivity already updated.
 */
export async function onJobNetworkFailure() {
  await freezeWork(autoPauseReason() || "server");
  await syncHealthFromPolicy();
}

export async function clearUserPausedOnWipe() {
  await saveUserPausedFlag(false);
  abortAllJobs("clear");
}

export { userPaused };
