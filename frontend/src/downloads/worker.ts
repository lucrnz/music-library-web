/**
 * Download pump + job runner: classify once, apply once.
 */

import { fetchTrack } from "@/api";
import {
  classifyError,
  isItemFailHttpStatus,
  isNetworkClassError,
  reportFailure,
} from "@/connectivity";
import { codecExt, codecMediaType } from "@/downloads/media";
import { deleteOne, getOne, putOne } from "@/downloads/db";
import {
  DownloadWriteAbortError,
  audioDirParts,
  audioFileName,
  deleteBinary,
  partialByteSize,
  removePartial,
  writeResponseToFile,
} from "@/downloads/opfs";
import { finalizeTrackDownload } from "@/downloads/catalog";
import {
  activeIds,
  clearLiveProgress,
  controllers,
  discardPartialForItem,
  emitQueueChange,
  flushProgressToIdb,
  listQueue,
  markActive,
  markFailed,
  markPaused,
  markPending,
  QueueState,
  resolveAbortKind,
  updateLiveProgress,
  type QueueRecord,
} from "@/downloads/queue";
import { fromApiTrack, type Track } from "@/models/track";
import {
  canPump,
  initPolicy,
  onJobNetworkFailure,
} from "@/downloads/queuePolicy";

const MAX_CONCURRENT = 2;

function errorNumericField(err: unknown, key: string): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const v = Reflect.get(err, key);
  return typeof v === "number" ? v : undefined;
}

function errorFlag(err: unknown, key: string): boolean {
  if (!err || typeof err !== "object") return false;
  return Boolean(Reflect.get(err, key));
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

// Wire policy → pump (avoids queue importing worker at top level).
initPolicy({ schedulePump });

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

export type JobOutcomeKind =
  | "done"
  | "canceled"
  | "paused"
  | "failed"
  | "network"
  | "retry";

export interface JobOutcome {
  kind: JobOutcomeKind;
  error?: string;
  loaded?: number;
  total?: number | null;
}

export interface JobCtx {
  dirParts?: string[];
  fileName?: string;
  track?: Track;
  codec?: string;
  mediaType?: string;
  ext?: string;
  bytes?: number;
}

async function finishQueueRow(id: number) {
  clearLiveProgress(id);
  emitQueueChange();
}

/**
 * @param {number} id
 * @param {object|null|undefined} current
 * @param {JobCtx} ctx
 */
async function removeQueueAndFiles(
  id: number,
  current: QueueRecord | null | undefined,
  ctx: JobCtx,
) {
  if (current) await discardPartialForItem(current);
  if (ctx.dirParts && ctx.fileName) {
    try {
      await deleteBinary(ctx.dirParts, ctx.fileName);
    } catch {
      /* ignore */
    }
  }
  if (current) await deleteOne("queue", id);
  await finishQueueRow(id);
}

type OutcomeHandler = (
  id: number,
  outcome: JobOutcome,
  ctx: JobCtx,
  current: QueueRecord | null | undefined,
) => Promise<void>;

const outcomeHandlers: Record<JobOutcomeKind, OutcomeHandler> = {
  async done(id, _outcome, ctx, current) {
    if (current?.state === QueueState.CANCELED) {
      if (ctx.dirParts && ctx.fileName) {
        await deleteBinary(ctx.dirParts, ctx.fileName);
      }
      await deleteOne("queue", id);
      await finishQueueRow(id);
      return;
    }
    if (ctx.track && ctx.codec != null) {
      await finalizeTrackDownload(
        ctx.track,
        ctx.codec,
        {
          bytes: ctx.bytes || 0,
          mediaType: ctx.mediaType,
          ext: ctx.ext,
        },
        id,
      );
    } else if (current) {
      await deleteOne("queue", id);
    }
    await finishQueueRow(id);
  },

  async canceled(id, _outcome, ctx, current) {
    await removeQueueAndFiles(id, current, ctx);
  },

  async retry(id, _outcome, _ctx, current) {
    if (current) {
      markPending(current);
      current.loaded = 0;
      current.total = null;
      await putOne("queue", current);
    }
    clearLiveProgress(id);
    emitQueueChange();
  },

  async failed(id, outcome, _ctx, current) {
    if (current && current.state !== QueueState.PAUSED) {
      markFailed(current, outcome.error);
      await putOne("queue", current);
    }
    await flushProgressToIdb(id);
    emitQueueChange();
  },

  async network(id, outcome, _ctx, current) {
    if (current && current.state !== QueueState.CANCELED) {
      markPaused(current, "network");
      if (outcome.loaded != null) current.loaded = outcome.loaded;
      if (outcome.total !== undefined) current.total = outcome.total;
      await putOne("queue", current);
    }
    await flushProgressToIdb(id);
    // freezeWork emits once (bus → health + pump).
    await onJobNetworkFailure();
  },

  async paused(id, outcome, ctx, current) {
    if (current) {
      if (
        current.state === QueueState.ACTIVE ||
        current.state === QueueState.PENDING
      ) {
        markPaused(current, "abort");
      }
      if (outcome.loaded != null) current.loaded = outcome.loaded;
      if (ctx.dirParts && ctx.fileName) {
        try {
          const size = await partialByteSize(ctx.dirParts, ctx.fileName);
          if (size > 0) current.loaded = size;
        } catch {
          /* ignore */
        }
      }
      await putOne("queue", current);
    }
    await flushProgressToIdb(id);
    emitQueueChange();
  },
};

/**
 * Resolve cancel race once, then apply a single outcome.
 * @param {number} id
 * @param {JobOutcome} outcome
 * @param {JobCtx} [ctx]
 */
async function applyJobOutcome(
  id: number,
  outcome: JobOutcome,
  ctx: JobCtx = {},
) {
  const current = await getOne<QueueRecord>("queue", id);
  let kind = outcome.kind;
  if (kind === "paused" && current?.state === QueueState.CANCELED) {
    kind = "canceled";
  } else if (
    kind !== "canceled" &&
    current?.state === QueueState.CANCELED &&
    kind !== "done"
  ) {
    kind = "canceled";
  }
  const handler = outcomeHandlers[kind] || outcomeHandlers.paused;
  try {
    await handler(id, outcome, ctx, current);
  } catch (err: unknown) {
    const row = await getOne<QueueRecord>("queue", id).catch(() => undefined);
    if (row && row.state === QueueState.ACTIVE) {
      const message = err instanceof Error ? err.message : String(err ?? "");
      markFailed(row, message || "Download failed");
      await putOne("queue", row);
    }
    await finishQueueRow(id);
  }
}

/**
 * Execute one download job → single JobOutcome, then apply.
 * @param {object} item
 * @returns {Promise<void>}
 */
async function runJob(item: QueueRecord): Promise<void> {
  const id = item.id;
  if (id == null) return;
  const ac = new AbortController();
  controllers.set(id, ac);
  const ext = codecExt(item.codec, item.snapshot?.sourceCodec);
  const fileName = audioFileName(item.trackId, item.codec, ext);
  const dirParts = audioDirParts();
  const fileCtx = { dirParts, fileName };

  try {
    const result = await executeDownloadJob(item, ac, fileCtx);
    await applyJobOutcome(id, result.outcome, result.ctx || fileCtx);
  } finally {
    controllers.delete(id);
  }
}

/**
 * Pure-ish job body: returns one classified outcome (no IDB side effects
 * except progress writes during stream).
 * @param {object} item
 * @param {AbortController} ac
 * @param {JobCtx} fileCtx
 * @returns {Promise<{ outcome: JobOutcome, ctx?: JobCtx }>}
 */
async function executeDownloadJob(
  item: QueueRecord,
  ac: AbortController,
  fileCtx: { dirParts: string[]; fileName: string },
): Promise<{ outcome: JobOutcome; ctx?: JobCtx }> {
  const { dirParts, fileName } = fileCtx;
  const id = item.id;
  if (id == null) return { outcome: { kind: "canceled" } };
  const ext = codecExt(item.codec, item.snapshot?.sourceCodec);

  let current = await getOne<QueueRecord>("queue", id);
  if (!current || current.state === QueueState.CANCELED) {
    return { outcome: { kind: "canceled" } };
  }
  if (current.state === QueueState.PAUSED || !canPump()) {
    return { outcome: { kind: "paused" } };
  }

  let track = fromApiTrack(current.snapshot);
  try {
    track = await fetchTrack(current.trackId);
  } catch (err: unknown) {
    if (isNetworkClassError(err)) {
      reportFailure(err);
      return { outcome: { kind: "network" } };
    }
    // Keep queue snapshot if refresh fails for non-network reasons.
  }

  if (ac.signal.aborted) {
    const cur = await getOne<QueueRecord>("queue", id);
    return { outcome: { kind: resolveAbortKind(cur) } };
  }

  let offset = await partialByteSize(dirParts, fileName);
  if (offset > 0) {
    updateLiveProgress(id, offset, current.total ?? null, {
      forceUi: true,
    });
  }

  let res: Response;
  try {
    const headers: Record<string, string> = {};
    if (offset > 0) headers.Range = `bytes=${offset}-`;
    res = await fetch(
      `/api/stream?id=${encodeURIComponent(current.trackId)}&codec=${encodeURIComponent(current.codec)}`,
      { headers, signal: ac.signal }
    );
  } catch (err: unknown) {
    if (ac.signal.aborted) {
      const cur = await getOne<QueueRecord>("queue", id);
      return { outcome: { kind: resolveAbortKind(cur) } };
    }
    if (isNetworkClassError(err)) {
      reportFailure(err);
      return { outcome: { kind: "network" } };
    }
    throw err;
  }

  if (res.status === 416) {
    await removePartial(dirParts, fileName);
    offset = 0;
    res = await fetch(
      `/api/stream?id=${encodeURIComponent(current.trackId)}&codec=${encodeURIComponent(current.codec)}`,
      { signal: ac.signal }
    );
  }

  if (!res.ok && res.status !== 206) {
    if (isItemFailHttpStatus(res.status)) {
      return {
        outcome: {
          kind: "failed",
          error: `Stream failed: HTTP ${res.status}`,
        },
      };
    }
    if (isNetworkClassError(null, res.status)) {
      reportFailure(null, res.status);
      return { outcome: { kind: "network" } };
    }
    return {
      outcome: {
        kind: "failed",
        error: `Stream failed: HTTP ${res.status}`,
      },
    };
  }

  const mediaType =
    res.headers.get("Content-Type") ||
    codecMediaType(
      current.codec,
      track.sourceCodec || current.snapshot?.sourceCodec
    );

  try {
    const written = await writeResponseToFile(dirParts, fileName, res, {
      startOffset: offset > 0 && res.status === 206 ? offset : 0,
      signal: ac.signal,
      keepPartialOnAbort: true,
      onProgress: (loaded, total) => {
        updateLiveProgress(id, loaded, total);
      },
    });

    current = await getOne<QueueRecord>("queue", id);
    if (!current || current.state === QueueState.CANCELED) {
      return { outcome: { kind: "canceled" } };
    }

    return {
      outcome: { kind: "done" },
      ctx: {
        ...fileCtx,
        track,
        codec: current.codec,
        mediaType,
        ext,
        bytes: written.bytes,
      },
    };
  } catch (err: unknown) {
    if (err instanceof DownloadWriteAbortError || ac.signal.aborted) {
      const cur = await getOne<QueueRecord>("queue", id);
      return { outcome: { kind: resolveAbortKind(cur) } };
    }

    console.error("Download job failed", err);
    const httpStatus = errorNumericField(err, "httpStatus");
    const name = err instanceof Error ? err.name : "";
    const msg = err instanceof Error ? err.message : String(err);

    if (
      name === "RangeNotSatisfiableError" ||
      /Range not satisfiable/i.test(msg)
    ) {
      await removePartial(dirParts, fileName);
      return { outcome: { kind: "retry" } };
    }

    const cls = classifyError(err, httpStatus);
    if (
      cls === "offline" ||
      cls === "server_down" ||
      errorFlag(err, "keepPartial")
    ) {
      reportFailure(err, httpStatus);
      return { outcome: { kind: "network" } };
    }

    return {
      outcome: {
        kind: "failed",
        error:
          name === "QuotaExceededError" || /quota/i.test(msg)
            ? "Storage full — free space and retry"
            : msg,
      },
    };
  }
}

export function stopAllWorkers() {
  for (const id of [...controllers.keys()]) {
    const c = controllers.get(id);
    if (c) {
      try {
        c.abort("clear");
      } catch {
        /* ignore */
      }
    }
  }
  controllers.clear();
  activeIds.clear();
}
