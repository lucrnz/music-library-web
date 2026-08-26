/**
 * Download job runner: classify once, apply once.
 */

import { fetchTrack, streamUrl } from "@/api";
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
  clearLiveProgress,
  discardPartialForItem,
  emitQueueChange,
  flushProgressToIdb,
  markFailed,
  markPaused,
  markPending,
  QueueState,
  resolveAbortKind,
  updateLiveProgress,
  type QueueRecord,
} from "@/downloads/queue";
import type { Track } from "@/models/track";
import { DEMOTE_ABORT_REASON } from "@/downloads/concurrency";
import { canUseCompanionDownloads } from "@/exclusive/capability";
import {
  abortPut,
  audioBlobKey,
  putFromUrl,
  stat as blobStat,
} from "@/downloads/companionBlob";
import { canPump, onJobNetworkFailure } from "@/downloads/queuePolicy";

function errorNumericField(err: unknown, key: string): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const v = Reflect.get(err, key);
  return typeof v === "number" ? v : undefined;
}

function errorFlag(err: unknown, key: string): boolean {
  if (!err || typeof err !== "object") return false;
  return Boolean(Reflect.get(err, key));
}

export type JobOutcomeKind =
  | "done"
  | "canceled"
  | "paused"
  | "queued"
  | "failed"
  | "network"
  | "retry";

function abortOutcome(
  cur: QueueRecord | null | undefined,
  ac: AbortController,
): JobOutcome {
  if (
    cur?.state !== QueueState.CANCELED &&
    ac.signal.reason === DEMOTE_ABORT_REASON
  ) {
    return { kind: "queued" };
  }
  return { kind: resolveAbortKind(cur) };
}

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

  async queued(id, outcome, ctx, current) {
    if (current && current.state !== QueueState.CANCELED) {
      markPending(current);
      if (outcome.loaded != null) current.loaded = outcome.loaded;
      if (outcome.total !== undefined) current.total = outcome.total;
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
export async function applyJobOutcome(
  id: number,
  outcome: JobOutcome,
  ctx: JobCtx = {},
) {
  const current = await getOne<QueueRecord>("queue", id);
  let kind = outcome.kind;
  if (
    (kind === "paused" || kind === "queued") &&
    current?.state === QueueState.CANCELED
  ) {
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
async function executeCompanionJob(
  item: QueueRecord,
  ac: AbortController,
  track: Track | undefined,
  ext: string,
  fileCtx: { dirParts: string[]; fileName: string },
  id: number,
): Promise<{ outcome: JobOutcome; ctx?: JobCtx }> {
  const key = audioBlobKey(item.trackId, item.codec, ext);
  const requestId = `q-${id}-${Date.now()}`;
  let offset = 0;
  try {
    const st = await blobStat(key);
    if (st.exists) {
      return {
        outcome: { kind: "done" },
        ctx: {
          ...fileCtx,
          track,
          codec: item.codec,
          mediaType: codecMediaType(item.codec, track?.sourceCodec),
          ext,
          bytes: st.bytes,
        },
      };
    }
    offset = st.bytes || 0;
  } catch {
    offset = 0;
  }
  if (offset > 0) {
    updateLiveProgress(id, offset, item.total ?? null, { forceUi: true });
  }
  const rel = streamUrl({ id: item.trackId }, item.codec);
  if (!rel) return { outcome: { kind: "failed", error: "No stream URL" } };
  let abs = rel;
  try {
    abs = new URL(rel, location.origin).href;
  } catch {
    /* keep relative — companion cannot fetch it */
  }
  const onAbort = () => abortPut(requestId);
  ac.signal.addEventListener("abort", onAbort);
  try {
    const done = await putFromUrl({
      requestId,
      key,
      url: abs,
      offset,
      onProgress: (loaded, total) => updateLiveProgress(id, loaded, total),
    });
    const current = await getOne<QueueRecord>("queue", id);
    if (!current || current.state === QueueState.CANCELED) {
      return { outcome: { kind: "canceled" } };
    }
    return {
      outcome: { kind: "done" },
      ctx: {
        ...fileCtx,
        track,
        codec: current.codec,
        mediaType: codecMediaType(
          current.codec,
          track?.sourceCodec || current.snapshot?.sourceCodec,
        ),
        ext,
        bytes: done.bytes,
      },
    };
  } catch (err: unknown) {
    if (ac.signal.aborted) {
      const cur = await getOne<QueueRecord>("queue", id);
      return { outcome: abortOutcome(cur, ac), ctx: fileCtx };
    }
    const code = err && typeof err === "object" ? Reflect.get(err, "code") : "";
    const msg = err instanceof Error ? err.message : String(err);
    if (code === "enospc" || /no space|ENOSPC|quota/i.test(msg)) {
      return {
        outcome: { kind: "failed", error: "Storage full - free space and retry" },
      };
    }
    if (isNetworkClassError(err)) {
      reportFailure(err);
      return { outcome: { kind: "network" } };
    }
    return { outcome: { kind: "failed", error: msg } };
  } finally {
    ac.signal.removeEventListener("abort", onAbort);
  }
}

export async function executeDownloadJob(
  item: QueueRecord,
  ac: AbortController,
): Promise<{ outcome: JobOutcome; ctx?: JobCtx }> {
  const ext = codecExt(item.codec, item.snapshot?.sourceCodec);
  const fileName = audioFileName(item.trackId, item.codec, ext);
  const dirParts = audioDirParts();
  const fileCtx = { dirParts, fileName };
  const id = item.id;
  if (id == null) return { outcome: { kind: "canceled" } };

  let current = await getOne<QueueRecord>("queue", id);
  if (!current || current.state === QueueState.CANCELED) {
    return { outcome: { kind: "canceled" } };
  }
  if (current.state === QueueState.PAUSED || !canPump()) {
    return { outcome: { kind: "paused" } };
  }

  let track = current.snapshot;
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
    return { outcome: abortOutcome(cur, ac), ctx: fileCtx };
  }

  if (canUseCompanionDownloads()) {
    return executeCompanionJob(item, ac, track, ext, fileCtx, id);
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
    const url = streamUrl({ id: current.trackId }, current.codec);
    if (!url) {
      return { outcome: { kind: "failed", error: "No stream URL" } };
    }
    res = await fetch(url, { headers, signal: ac.signal });
  } catch (err: unknown) {
    if (ac.signal.aborted) {
      const cur = await getOne<QueueRecord>("queue", id);
      return { outcome: abortOutcome(cur, ac), ctx: fileCtx };
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
      return { outcome: abortOutcome(cur, ac), ctx: fileCtx };
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
            ? "Storage full - free space and retry"
            : msg,
      },
    };
  }
}
