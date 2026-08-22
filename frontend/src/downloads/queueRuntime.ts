/**
 * Download pump + in-flight abort. queue.ts is IDB CRUD.
 */
import { deleteOne, putOne } from "@/downloads/db";
import {
  canPump,
  initPolicy,
} from "@/downloads/queuePolicy";
import {
  emitQueueChange,
  listQueue,
  markActive,
  QueueState,
  type QueueRecord,
} from "@/downloads/queue";
import { applyJobOutcome, executeDownloadJob } from "@/downloads/worker";

const MAX_CONCURRENT = 2;

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

let pumpScheduled = false;

export function schedulePump() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  queueMicrotask(() => {
    pumpScheduled = false;
    pump().catch(console.error);
  });
}

async function pump() {
  if (!canPump()) return;
  while (activeIds.size < MAX_CONCURRENT && canPump()) {
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
  initPolicy({ schedulePump });
}
