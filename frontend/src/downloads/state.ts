/**
 * Single reactive surface for downloads UI.
 * Mutations live in index.js; components read this object.
 */
import { DEFAULT_DOWNLOAD_CONCURRENCY } from "@/downloads/concurrency";
import { QueueState, type QueueRecord } from "@/downloads/queue";
import { reactive } from "vue";

export type AutoPausedReason = "offline" | "server" | "companion";

export interface DownloadsState {
  enabled: boolean;
  ready: boolean;
  managerOpen: boolean;
  concurrency: number;
  queue: QueueRecord[];
  trackCount: number;
  downloadedBytes: number;
  storageUsage: number;
  storageQuota: number;
  storageFree: number;
  storageSupported: boolean;
  nearQuota: boolean;
  hasOpfsLeftovers: boolean;
  migrate: {
    active: boolean;
    done: number;
    total: number;
    error: string;
  };
  persistent: boolean;
  error: string;
  userPaused: boolean;
  autoPausedReason: AutoPausedReason | null;
  pauseBanner: string;
  queueSummary: {
    active: number;
    pending: number;
    paused: number;
    failed: number;
    total: number;
    loadedBytes: number;
    totalBytes: number;
    knownTotal: boolean;
  };
}

export const downloads = reactive<DownloadsState>({
  enabled: false,
  ready: false,
  managerOpen: false,
  concurrency: DEFAULT_DOWNLOAD_CONCURRENCY,
  queue: [],
  trackCount: 0,
  downloadedBytes: 0,
  storageUsage: 0,
  storageQuota: 0,
  storageFree: 0,
  storageSupported: false,
  nearQuota: false,
  hasOpfsLeftovers: false,
  migrate: { active: false, done: 0, total: 0, error: "" },
  persistent: false,
  error: "",
  userPaused: false,
  autoPausedReason: null,
  pauseBanner: "",
  queueSummary: {
    active: 0,
    pending: 0,
    paused: 0,
    failed: 0,
    total: 0,
    loadedBytes: 0,
    totalBytes: 0,
    knownTotal: false,
  },
});

export function syncQueueSummary(items: QueueRecord[] = downloads.queue) {
  let active = 0;
  let pending = 0;
  let paused = 0;
  let failed = 0;
  let loadedBytes = 0;
  let totalBytes = 0;
  let knownTotal = true;
  let progressItems = 0;

  for (const q of items) {
    if (q.state === QueueState.ACTIVE) active++;
    else if (q.state === QueueState.PENDING) pending++;
    else if (q.state === QueueState.PAUSED) paused++;
    else if (q.state === QueueState.FAILED) failed++;

    if (
      q.state === QueueState.ACTIVE ||
      q.state === QueueState.PENDING ||
      q.state === QueueState.PAUSED
    ) {
      progressItems++;
      loadedBytes += q.loaded || 0;
      if (q.total && q.total > 0) totalBytes += q.total;
      else knownTotal = false;
    }
  }

  downloads.queueSummary = {
    active,
    pending,
    paused,
    failed,
    total: items.length,
    loadedBytes,
    totalBytes,
    knownTotal: knownTotal && progressItems > 0 && totalBytes > 0,
  };
}
