/**
 * Download pump + in-flight abort. queue.ts is IDB CRUD.
 */
import {
  DEMOTE_ABORT_REASON,
  selectActiveToKeep,
  type ActiveJobRank,
} from "@/downloads/concurrency";
import { putOne } from "@/downloads/db";
import {
  canPump,
  initPolicy,
} from "@/downloads/queuePolicy";
import {
  cancelQueueItem,
  emitQueueChange,
  flushProgressToIdb,
  getLiveProgress,
  listQueue,
  markActive,
  pauseQueuedWork,
  QueueState,
  type QueueRecord,
} from "@/downloads/queue";
import { downloads } from "@/downloads/state";
import { applyJobOutcome, executeDownloadJob } from "@/downloads/worker";

export const activeIds = new Set<number>();

export const controllers = new Map<number, AbortController>();

export function abortJob(id: number, reason = "pause") {
  const c = controllers.get(id);
  if (c) {
    try {
      c.abort(reason);
    } catch {
      /* ignore */
    }
  }
}

export function stopAll() {
  for (const id of [...controllers.keys()]) {
    abortJob(id, "clear");
  }
  controllers.clear();
  activeIds.clear();
}

export async function freezeActive(reason = "pause") {
  const ids = await pauseQueuedWork(reason);
  for (const id of ids) {
    abortJob(id, reason);
    activeIds.delete(id);
  }
}

export async function cancelItem(id: number) {
  const kind = await cancelQueueItem(id);
  if (kind === "active") {
    abortJob(id, "cancel");
    activeIds.delete(id);
  }
}

let pumpScheduled = false;

export function schedulePump() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  queueMicrotask(() => {
    pumpScheduled = false;
    pump().catch(console.error);
  });
}

export async function applyConcurrency(): Promise<void> {
  if (!runtimeReady) return;
  const cap = downloads.concurrency;
  if (activeIds.size > cap) {
    const items = await listQueue();
    const actives: ActiveJobRank[] = [];
    for (const row of items) {
      if (
        row.id == null ||
        !activeIds.has(row.id) ||
        row.state !== QueueState.ACTIVE
      ) {
        continue;
      }
      const live = getLiveProgress(row.id);
      actives.push({
        id: row.id,
        loaded: live?.loaded ?? row.loaded ?? 0,
        addedAt: row.addedAt || 0,
      });
    }
    const keep = new Set(selectActiveToKeep(actives, cap));
    for (const { id } of actives) {
      if (keep.has(id)) continue;
      await flushProgressToIdb(id);
      abortJob(id, DEMOTE_ABORT_REASON);
      activeIds.delete(id);
    }
  }
  schedulePump();
}

async function pump() {
  if (!canPump()) return;
  while (activeIds.size < downloads.concurrency && canPump()) {
    const items = await listQueue();
    const next = items.find((i) => i.state === QueueState.PENDING && i.id != null);
    if (!next || next.id == null) break;
    const nextId = next.id;
    activeIds.add(nextId);
    markActive(next);
    await putOne("queue", next);
    emitQueueChange();
    runJob(next).finally(() => {
      activeIds.delete(nextId);
      controllers.delete(nextId);
      schedulePump();
    });
  }
}

async function runJob(item: QueueRecord): Promise<void> {
  const id = item.id;
  if (id == null) return;
  const ac = new AbortController();
  controllers.set(id, ac);
  try {
    const result = await executeDownloadJob(item, ac);
    await applyJobOutcome(id, result.outcome, result.ctx);
  } finally {
    controllers.delete(id);
  }
}

let runtimeReady = false;

export function initQueueRuntime() {
  if (runtimeReady) return;
  runtimeReady = true;
  initPolicy({ schedulePump, freeze: freezeActive });
}
