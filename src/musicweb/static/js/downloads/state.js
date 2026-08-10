/**
 * Single reactive surface for downloads UI.
 * Mutations live in index.js; components read this object.
 */
import { reactive } from "vue";

/** @typedef {'online'|'offline'|'server_down'} Connectivity */

export const downloads = reactive({
  enabled: false,
  ready: false,
  managerOpen: false,
  /** @type {Connectivity} */
  connectivity: "online",
  connectivityNote: "",
  /** @type {object[]} */
  queue: [],
  /** @type {Record<number, { loaded: number, total: number|null }>} */
  liveProgress: {},
  trackCount: 0,
  downloadedBytes: 0,
  storageUsage: 0,
  storageQuota: 0,
  storageSupported: false,
  nearQuota: false,
  persistent: false,
  /** trackId → ready|other|none|pending|active|failed|paused */
  statusMap: /** @type {Record<string, string>} */ ({}),
  error: "",
  userPaused: false,
  /** @type {null | 'offline' | 'server'} */
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
