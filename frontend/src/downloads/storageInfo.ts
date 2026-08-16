/**
 * Browser storage estimate + near-quota warning.
 */

/** Fraction of quota at which we warn (0–1). */
export const QUOTA_WARN_RATIO = 0.85;

export interface StorageEstimateInfo {
  usage: number;
  quota: number;
  usageDetails?: Record<string, number>;
  supported: boolean;
}

function readUsageDetails(est: object): Record<string, number> | undefined {
  if (!("usageDetails" in est)) return undefined;
  const value = Reflect.get(est, "usageDetails");
  if (!value || typeof value !== "object") return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "number") out[k] = v;
  }
  return out;
}

export async function getStorageEstimate(): Promise<StorageEstimateInfo> {
  if (
    typeof navigator === "undefined" ||
    !navigator.storage ||
    typeof navigator.storage.estimate !== "function"
  ) {
    return { usage: 0, quota: 0, supported: false };
  }
  try {
    const est = await navigator.storage.estimate();
    return {
      usage: est.usage || 0,
      quota: est.quota || 0,
      usageDetails: readUsageDetails(est),
      supported: true,
    };
  } catch {
    return { usage: 0, quota: 0, supported: false };
  }
}

export function isNearQuota(est: StorageEstimateInfo) {
  if (!est.supported || !est.quota) return false;
  return est.usage / est.quota >= QUOTA_WARN_RATIO;
}

/**
 * Best-effort request that storage not be cleared under pressure.
 * @returns {Promise<boolean>}
 */
export async function requestPersistentStorage() {
  if (
    typeof navigator === "undefined" ||
    !navigator.storage ||
    typeof navigator.storage.persist !== "function"
  ) {
    return false;
  }
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** @param {number} bytes */
export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/**
 * Catalog-only line for leftover downloads when the feature is off.
 * Empty string when there is nothing to clear (caller hides the block).
 * @param {{ trackCount?: number, downloadedBytes?: number }} d
 */
export function formatIdleDownloadsSummary(d: {
  trackCount?: number;
  downloadedBytes?: number;
}) {
  const n = d.trackCount || 0;
  if (!n) return "";
  const label = n === 1 ? "1 track" : `${n} tracks`;
  return `${label} · ${formatBytes(d.downloadedBytes || 0)}`;
}

/**
 * Shared storage line for Settings + Downloads manager.
 * @param {{
 *   storageSupported?: boolean,
 *   storageUsage?: number,
 *   storageQuota?: number,
 *   trackCount?: number,
 *   downloadedBytes?: number,
 * }} d
 * @param {'short'|'long'} [style]
 */
export function formatDownloadsStorageLine(
  d: {
    storageSupported?: boolean;
    storageUsage?: number;
    storageQuota?: number;
    trackCount?: number;
    downloadedBytes?: number;
  },
  style: "short" | "long" = "long",
) {
  if (!d.storageSupported) {
    if (!d.trackCount) {
      return style === "short" ? "Ready — no downloads yet" : "No downloads yet";
    }
    return `${d.trackCount} tracks · ~${formatBytes(d.downloadedBytes || 0)}${
      style === "long" ? " audio" : ""
    }`;
  }
  const free = Math.max(0, (d.storageQuota || 0) - (d.storageUsage || 0));
  if (style === "short") {
    return (
      `${formatBytes(d.storageUsage || 0)} used` +
      (d.storageQuota ? ` / ${formatBytes(d.storageQuota)}` : "") +
      (d.trackCount ? ` · ${d.trackCount} tracks` : "")
    );
  }
  return (
    `${formatBytes(d.storageUsage || 0)} used` +
    (d.storageQuota
      ? ` · ${formatBytes(free)} free of ${formatBytes(d.storageQuota)}`
      : "") +
    (d.trackCount
      ? ` · ${d.trackCount} tracks (~${formatBytes(d.downloadedBytes || 0)} audio)`
      : "")
  );
}
