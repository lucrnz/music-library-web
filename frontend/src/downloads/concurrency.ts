/**
 * Client-only download concurrency: allowed values, persist, rank-to-keep.
 */

export const DOWNLOAD_CONCURRENCY_KEY = "musicweb.downloadConcurrency";

export const DOWNLOAD_CONCURRENCY_VALUES = [1, 2, 4, 6, 8, 10, 12] as const;

export type DownloadConcurrency = (typeof DOWNLOAD_CONCURRENCY_VALUES)[number];

export const DEFAULT_DOWNLOAD_CONCURRENCY: DownloadConcurrency = 2;

export const DEMOTE_ABORT_REASON = "demote";

const ALLOWED = new Set<number>(DOWNLOAD_CONCURRENCY_VALUES);

export function isDownloadConcurrency(v: unknown): v is DownloadConcurrency {
  return typeof v === "number" && ALLOWED.has(v);
}

export function parseDownloadConcurrency(raw: unknown): DownloadConcurrency {
  if (isDownloadConcurrency(raw)) return raw;
  if (typeof raw === "string" && raw !== "") {
    const n = Number(raw);
    if (isDownloadConcurrency(n)) return n;
  }
  return DEFAULT_DOWNLOAD_CONCURRENCY;
}

export function loadDownloadConcurrency(): DownloadConcurrency {
  try {
    return parseDownloadConcurrency(localStorage.getItem(DOWNLOAD_CONCURRENCY_KEY));
  } catch {
    return DEFAULT_DOWNLOAD_CONCURRENCY;
  }
}

export function saveDownloadConcurrency(n: DownloadConcurrency): void {
  try {
    localStorage.setItem(DOWNLOAD_CONCURRENCY_KEY, String(n));
  } catch {
    /* ignore */
  }
}

export function concurrencyLabel(n: DownloadConcurrency): string {
  return n === 1 ? "Sequential (1)" : String(n);
}

export interface ActiveJobRank {
  id: number;
  loaded: number;
  addedAt: number;
}

/** Keep up to `limit` in-flight ids: most bytes, then earlier addedAt, then lower id. */
export function selectActiveToKeep(
  items: ActiveJobRank[],
  limit: number,
): number[] {
  if (limit <= 0 || items.length === 0) return [];
  const ranked = items.slice().sort((a, b) => {
    if (b.loaded !== a.loaded) return b.loaded - a.loaded;
    if (a.addedAt !== b.addedAt) return a.addedAt - b.addedAt;
    return a.id - b.id;
  });
  return ranked.slice(0, Math.min(limit, ranked.length)).map((item) => item.id);
}
