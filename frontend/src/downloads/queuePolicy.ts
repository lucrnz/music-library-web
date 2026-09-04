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
  setHealthWork,
} from "@/connectivity";
import { requestCompanionsBackfill } from "@/downloads/backfill";
import { onCompanionEvent } from "@/exclusive/companionClient";
import { canUseCompanionDownloads } from "@/exclusive/capability";
import { exclusiveAudio } from "@/stores/exclusiveAudio";
import { codecExt } from "@/downloads/media";
import { getOne, putOne, type MetaRecord } from "@/downloads/db";
import { audioBlobKey, stat as blobStat } from "@/downloads/companionBlob";
import {
  audioDirParts,
  audioFileName,
  partialByteSize,
} from "@/downloads/opfs";
import {
  emitQueueChange,
  flushProgressToIdb,
  listQueue,
  markPaused,
  queueHasWork,
  QueueState,
  seedLiveProgress,
  setQueueMutationSideEffects,
  unpauseItemsToPending,
  updateLiveProgress,
} from "@/downloads/queue";

const META_USER_PAUSED = "userPaused";

let userPaused = false;
let policyBound = false;
let schedulePumpFn: (() => void) | null = null;
let freezeFn: ((reason: string) => void | Promise<void>) | null = null;
let downloadsEnabled = false;

/**
 * Combined auto-pause: offline / server unreachable.
 * @returns {null | 'offline' | 'server'}
 */
export type DownloadAutoPauseReason = "offline" | "server" | "companion";

export function downloadAutoPauseReason(): DownloadAutoPauseReason | null {
  const net = autoPauseReason();
  if (net) return net;
  if (
    canUseCompanionDownloads() &&
    downloadsEnabled &&
    exclusiveAudio.connection !== "connected"
  ) {
    return "companion";
  }
  return null;
}

export async function syncHealthFromPolicy() {
  const hasWork = await queueHasWork();
  setHealthWork("downloads", !!(downloadsEnabled && hasWork));
  if (downloadsEnabled && hasWork && !isHardOffline() && !canReachServer()) {
    requestHealthProbe(0);
  }
}

/**
 * @param {{ schedulePump: () => void }} hooks
 */
export function initPolicy(hooks: {
  schedulePump: () => void;
  freeze: (reason: string) => void | Promise<void>;
}) {
  schedulePumpFn = hooks.schedulePump;
  freezeFn = hooks.freeze;
  setQueueMutationSideEffects(async () => {
    await syncHealthFromPolicy();
    if (schedulePumpFn) schedulePumpFn();
  });
  if (policyBound) return;
  policyBound = true;

  onConnectivityChange(() => {
    const reason = downloadAutoPauseReason();
    if (reason) {
      Promise.resolve(freezeFn?.(reason)).catch(console.error);
    } else {
      emitQueueChange();
    }
  });

  onConnectivityRecovered(() => {
    reapplyNetworkPolicy().catch(console.error);
    requestCompanionsBackfill();
  });

  onCompanionEvent((evt) => {
    if (
      evt.type === "hello_ok" ||
      evt.type === "disconnect" ||
      evt.type === "hello_reject"
    ) {
      reapplyNetworkPolicy().catch(console.error);
    }
  });
}

/**
 * Re-evaluate offline / server policy after connectivity change or recovery.
 */
export async function reapplyNetworkPolicy() {
  const reason = downloadAutoPauseReason();
  if (reason) {
    if (freezeFn) await freezeFn(reason);
  } else if (!userPaused) {
    await unpauseItemsToPending();
  } else {
    emitQueueChange();
  }
}

/**
 * @param {boolean} enabled
 */
export async function setDownloadsEnabled(enabled: boolean) {
  downloadsEnabled = !!enabled;
  await syncHealthFromPolicy();
}

export function getUserPaused() {
  return userPaused;
}

export async function loadUserPausedFlag() {
  try {
    const row = await getOne<MetaRecord>("meta", META_USER_PAUSED);
    userPaused = !!(row && row.value);
  } catch {
    userPaused = false;
  }
  return userPaused;
}

async function saveUserPausedFlag(on: boolean) {
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
    return "Paused by you - downloads won't start until you resume.";
  }
  const reason = downloadAutoPauseReason();
  if (reason === "offline") {
    return "Paused - you're offline. Downloads will resume when you're back online.";
  }
  if (reason === "server") {
    return "Paused - waiting for the library server. Retrying automatically…";
  }
  if (reason === "companion") {
    return "Paused - waiting for the Desktop companion. Retrying automatically…";
  }
  return "";
}

export async function pauseAllDownloads() {
  await saveUserPausedFlag(true);
  const items = await listQueue();
  for (const it of items) {
    if (it.state === QueueState.ACTIVE) {
      if (it.id != null) await flushProgressToIdb(it.id);
    }
  }
  if (freezeFn) await freezeFn("user-pause");
}

export async function resumeAllDownloads() {
  await saveUserPausedFlag(false);
  if (!isHardOffline() && !canReachServer()) {
    requestHealthProbe(0);
  }
  await reapplyNetworkPolicy();
}

export async function onJobNetworkFailure() {
  if (freezeFn) await freezeFn(downloadAutoPauseReason() || "server");
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
        const ext = codecExt(it.codec, it.snapshot?.sourceCodec);
        let size = 0;
        if (canUseCompanionDownloads()) {
          const st = await blobStat(audioBlobKey(it.trackId, it.codec, ext));
          size = st.bytes || 0;
        } else {
          const fileName = audioFileName(it.trackId, it.codec, ext);
          size = await partialByteSize(audioDirParts(), fileName);
        }
        if (size > 0 && it.id != null) {
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
    } else if ((it.loaded || it.total) && it.id != null) {
      seedLiveProgress(it.id, it.loaded || 0, it.total ?? null);
    }
  }

  await setDownloadsEnabled(true);
  await reapplyNetworkPolicy();
}
