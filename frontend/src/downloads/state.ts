/**
 * Single reactive surface for downloads UI.
 * Mutations live in index.js; components read this object.
 */
import type { QueueRecord } from "@/downloads/queue";
import { reactive } from "vue";

export type AutoPausedReason = "offline" | "server";

export interface LiveProgress {
  loaded: number;
  total: number | null;
}

export interface DownloadsState {
  enabled: boolean;
  ready: boolean;
  managerOpen: boolean;
  queue: QueueRecord[];
  liveProgress: Record<number, LiveProgress>;
  trackCount: number;
  downloadedBytes: number;
  storageUsage: number;
  storageQuota: number;
  storageSupported: boolean;
  nearQuota: boolean;
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
  queue: [],
  liveProgress: {},
  trackCount: 0,
  downloadedBytes: 0,
  storageUsage: 0,
  storageQuota: 0,
  storageSupported: false,
  nearQuota: false,
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
