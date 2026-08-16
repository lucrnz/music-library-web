/**
 * Download pump + job runner: classify once, apply once.
 */

import { fetchTrack } from "../api.js";
import {
  classifyError,
  isItemFailHttpStatus,
  isNetworkClassError,
  reportFailure,
} from "../connectivity.js";
import { codecExt, codecMediaType } from "./catalog.js";
import { deleteOne, getOne, putOne } from "./db.js";
import {
  DownloadWriteAbortError,
  audioDirParts,
  audioFileName,
  deleteBinary,
  partialByteSize,
  removePartial,
  writeResponseToFile,
} from "./opfs.js";
import { commitTrackDownload } from "./catalog.js";
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
} from "./queue.js";
import {
  canPump,
  initPolicy,
  onJobNetworkFailure,
} from "./queuePolicy.js";

const MAX_CONCURRENT = 2;

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
    const next = items.find((i) => i.state === QueueState.PENDING);
    if (!next) break;
    activeIds.add(next.id);
    markActive(next);
    await putOne("queue", next);
    emitQueueChange();
    runJob(next).finally(() => {
      activeIds.delete(next.id);
      controllers.delete(next.id);
      schedulePump();
    });
  }
}

/**
 * @typedef {'done'|'canceled'|'paused'|'failed'|'network'|'retry'} JobOutcomeKind
 * @typedef {{ kind: JobOutcomeKind, error?: string, loaded?: number, total?: number|null }} JobOutcome
 * @typedef {{ dirParts?: string[], fileName?: string, track?: object, codec?: string, mediaType?: string, ext?: string, bytes?: number }} JobCtx
 */

async function finishQueueRow(id) {
  clearLiveProgress(id);
  emitQueueChange();
}

/**
 * @param {number} id
 * @param {object|null|undefined} current
 * @param {JobCtx} ctx
 */
async function removeQueueAndFiles(id, current, ctx) {
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

/** @type {Record<JobOutcomeKind, (id: number, outcome: JobOutcome, ctx: JobCtx, current: object|null|undefined) => Promise<void>>} */
const outcomeHandlers = {
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
      await commitTrackDownload(ctx.track, ctx.codec, {
        bytes: ctx.bytes || 0,
        mediaType: ctx.mediaType,
        ext: ctx.ext,
      });
    }
    if (current) await deleteOne("queue", id);
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
async function applyJobOutcome(id, outcome, ctx = {}) {
  const current = await getOne("queue", id);
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
  await handler(id, outcome, ctx, current);
}

/**
 * Execute one download job → single JobOutcome, then apply.
 * @param {object} item
 * @returns {Promise<void>}
 */
async function runJob(item) {
  const ac = new AbortController();
  controllers.set(item.id, ac);
  const ext = codecExt(item.codec, item.snapshot?.sourceCodec);
  const fileName = audioFileName(item.trackId, item.codec, ext);
  const dirParts = audioDirParts();
  const fileCtx = { dirParts, fileName };

  try {
    const result = await executeDownloadJob(item, ac, fileCtx);
    await applyJobOutcome(item.id, result.outcome, result.ctx || fileCtx);
  } finally {
    controllers.delete(item.id);
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
async function executeDownloadJob(item, ac, fileCtx) {
  const { dirParts, fileName } = fileCtx;
  const ext = codecExt(item.codec, item.snapshot?.sourceCodec);

  let current = await getOne("queue", item.id);
  if (!current || current.state === QueueState.CANCELED) {
    return { outcome: { kind: "canceled" } };
  }
  if (current.state === QueueState.PAUSED || !canPump()) {
    return { outcome: { kind: "paused" } };
  }

  let track = current.snapshot;
  try {
    track = await fetchTrack(current.trackId);
  } catch (err) {
    if (isNetworkClassError(err)) {
      reportFailure(err);
      return { outcome: { kind: "network" } };
    }
    // Keep queue snapshot if refresh fails for non-network reasons.
  }

  if (ac.signal.aborted) {
    const cur = await getOne("queue", item.id);
    return { outcome: { kind: resolveAbortKind(cur) } };
  }

  let offset = await partialByteSize(dirParts, fileName);
  if (offset > 0) {
    updateLiveProgress(item.id, offset, current.total ?? null, {
      forceUi: true,
    });
  }

  /** @type {Response} */
  let res;
  try {
    const headers = {};
    if (offset > 0) headers.Range = `bytes=${offset}-`;
    res = await fetch(
      `/api/stream?id=${encodeURIComponent(current.trackId)}&codec=${encodeURIComponent(current.codec)}`,
      { headers, signal: ac.signal }
    );
  } catch (err) {
    if (ac.signal.aborted) {
      const cur = await getOne("queue", item.id);
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
        updateLiveProgress(item.id, loaded, total);
      },
    });

    current = await getOne("queue", item.id);
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
  } catch (err) {
    if (err instanceof DownloadWriteAbortError || ac.signal.aborted) {
      const cur = await getOne("queue", item.id);
      return { outcome: { kind: resolveAbortKind(cur) } };
    }

    console.error("Download job failed", err);
    const httpStatus = /** @type {any} */ (err)?.httpStatus;
    const name = /** @type {Error} */ (err)?.name || "";
    const msg = /** @type {Error} */ (err)?.message || String(err);

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
      /** @type {any} */ (err)?.keepPartial
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
