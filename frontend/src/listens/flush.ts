/**
 * Persist-then-POST listen flush. Owns retry; the POST is the probe.
 */
import { postListen } from "@/api";
import {
  onConnectivityRecovered,
  reportFailure,
  reportSuccess,
} from "@/connectivity";
import type { ListenEvent } from "@/listens/accumulator";
import {
  enqueuePending,
  readPendingListens,
  removePending,
} from "@/listens/outbox";

export const BACKOFF_START_MS = 1000;
export const BACKOFF_CAP_MS = 60000;

let flushing = false;
let backoffMs = BACKOFF_START_MS;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let inited = false;

function scheduleBackoff() {
  if (retryTimer != null) return;
  const delay = backoffMs;
  backoffMs = Math.min(BACKOFF_CAP_MS, Math.max(BACKOFF_START_MS, backoffMs * 2));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushListens();
  }, delay);
}

function clearBackoff() {
  backoffMs = BACKOFF_START_MS;
  if (retryTimer != null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

export async function flushListens(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    while (true) {
      const pending = readPendingListens();
      if (!pending.length) return;
      const item = pending[0];
      const result = await postListen(item);
      if ("ok" in result) {
        removePending(item.id);
        clearBackoff();
        reportSuccess();
        continue;
      }
      if (result.status === 422) {
        removePending(item.id);
        continue;
      }
      reportFailure(
        result.status === 0 ? new TypeError("failed to fetch") : undefined,
        result.status === 0 ? undefined : result.status,
      );
      scheduleBackoff();
      return;
    }
  } finally {
    flushing = false;
  }
}

export function enqueueListen(event: ListenEvent): boolean {
  const wrote = enqueuePending({
    id: event.id,
    track_id: event.trackId,
    profile: event.profile,
    play_source: event.playSource,
    counted_at: event.countedAt,
  });
  if (!wrote) return false;
  void flushListens();
  return true;
}

export function initListens(): void {
  if (!inited) {
    inited = true;
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void flushListens();
      });
    }
    onConnectivityRecovered(() => {
      void flushListens();
    });
  }
  void flushListens();
}
