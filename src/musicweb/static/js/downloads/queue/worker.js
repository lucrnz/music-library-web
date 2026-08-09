/**
 * Download pump + job runner with typed outcomes.
 */

import { apiGet } from "../../api.js";
import {
  audioDirParts,
  audioFileName,
  codecExt,
  codecMediaType,
  commitTrackDownload,
} from "../catalog.js";
import {
  classifyError,
  isItemFailHttpStatus,
  isNetworkClassError,
  reportFailure,
} from "../connectivity.js";
import { deleteOne, getOne, putOne } from "../db.js";
import {
  DownloadWriteAbortError,
  deleteBinary,
  partialByteSize,
  removePartial,
  writeResponseToFile,
} from "../opfs.js";
import { emitQueueChange } from "./events.js";
import { discardPartialForItem, listQueue } from "./items.js";
import { canPump, onJobNetworkFailure, syncHealthFromPolicy } from "./policy.js";
import {
  clearLiveProgress,
  flushProgressToIdb,
  updateLiveProgress,
} from "./progress.js";
import { activeIds, controllers } from "./runtime.js";

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

async function pump() {
  if (!canPump()) return;
  while (activeIds.size < MAX_CONCURRENT && canPump()) {
    const items = await listQueue();
    const next = items.find((i) => i.state === "pending");
    if (!next) break;
    activeIds.add(next.id);
    next.state = "active";
    next.error = null;
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
 */

/**
 * @param {number} id
 * @param {JobOutcome} outcome
 * @param {{ dirParts: string[], fileName: string, track?: object, codec?: string, mediaType?: string, ext?: string, bytes?: number }} [ctx]
 */
async function applyJobOutcome(id, outcome, ctx = {}) {
  const current = await getOne("queue", id);

  if (outcome.kind === "done") {
    if (current?.state === "canceled") {
      if (ctx.dirParts && ctx.fileName) {
        await deleteBinary(ctx.dirParts, ctx.fileName);
      }
      await deleteOne("queue", id);
      clearLiveProgress(id);
      emitQueueChange();
      await syncHealthFromPolicy();
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
    clearLiveProgress(id);
    emitQueueChange();
    await syncHealthFromPolicy();
    return;
  }

  if (outcome.kind === "canceled" || current?.state === "canceled") {
    if (current) await discardPartialForItem(current);
    if (ctx.dirParts && ctx.fileName) {
      try {
        await deleteBinary(ctx.dirParts, ctx.fileName);
      } catch {
        /* ignore */
      }
    }
    if (current) await deleteOne("queue", id);
    clearLiveProgress(id);
    emitQueueChange();
    await syncHealthFromPolicy();
    return;
  }

  if (outcome.kind === "retry") {
    if (current) {
      current.state = "pending";
      current.loaded = 0;
      current.total = null;
      await putOne("queue", current);
    }
    clearLiveProgress(id);
    emitQueueChange();
    return;
  }

  if (outcome.kind === "failed") {
    if (current && current.state !== "paused") {
      current.state = "failed";
      current.error = outcome.error || "Download failed";
      await putOne("queue", current);
    }
    await flushProgressToIdb(id);
    emitQueueChange();
    return;
  }

  if (outcome.kind === "network") {
    if (current && current.state !== "canceled") {
      current.state = "paused";
      if (outcome.loaded != null) current.loaded = outcome.loaded;
      if (outcome.total !== undefined) current.total = outcome.total;
      await putOne("queue", current);
    }
    await flushProgressToIdb(id);
    await onJobNetworkFailure();
    emitQueueChange();
    return;
  }

  // paused
  if (current) {
    if (current.state === "active" || current.state === "pending") {
      current.state = "paused";
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
  await syncHealthFromPolicy();
}

/**
 * @param {object} item
 */
async function runJob(item) {
  const ac = new AbortController();
  controllers.set(item.id, ac);
  const ext = codecExt(item.codec);
  const fileName = audioFileName(item.trackId, item.codec, ext);
  const dirParts = audioDirParts();
  const fileCtx = { dirParts, fileName };

  try {
    let current = await getOne("queue", item.id);
    if (!current || current.state === "canceled") {
      await applyJobOutcome(item.id, { kind: "canceled" }, fileCtx);
      return;
    }
    if (current.state === "paused" || !canPump()) {
      await applyJobOutcome(item.id, { kind: "paused" }, fileCtx);
      return;
    }

    let track = current.snapshot;
    try {
      const fresh = await apiGet(
        `/api/tracks/${encodeURIComponent(current.trackId)}`
      );
      if (fresh?.id) track = { ...track, ...fresh };
    } catch (err) {
      if (isNetworkClassError(err)) {
        reportFailure(err);
        await applyJobOutcome(item.id, { kind: "network" }, fileCtx);
        return;
      }
    }

    if (ac.signal.aborted) {
      await applyJobOutcome(
        item.id,
        { kind: current.state === "canceled" ? "canceled" : "paused" },
        fileCtx
      );
      return;
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
        await applyJobOutcome(
          item.id,
          { kind: cur?.state === "canceled" ? "canceled" : "paused" },
          fileCtx
        );
        return;
      }
      if (isNetworkClassError(err)) {
        reportFailure(err);
        await applyJobOutcome(item.id, { kind: "network" }, fileCtx);
        return;
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
        await applyJobOutcome(
          item.id,
          { kind: "failed", error: `Stream failed: HTTP ${res.status}` },
          fileCtx
        );
        return;
      }
      if (isNetworkClassError(null, res.status)) {
        reportFailure(null, res.status);
        await applyJobOutcome(item.id, { kind: "network" }, fileCtx);
        return;
      }
      await applyJobOutcome(
        item.id,
        { kind: "failed", error: `Stream failed: HTTP ${res.status}` },
        fileCtx
      );
      return;
    }

    const mediaType =
      res.headers.get("Content-Type") || codecMediaType(current.codec);

    const written = await writeResponseToFile(dirParts, fileName, res, {
      startOffset: offset > 0 && res.status === 206 ? offset : 0,
      signal: ac.signal,
      keepPartialOnAbort: true,
      onProgress: (loaded, total) => {
        updateLiveProgress(item.id, loaded, total);
      },
    });

    current = await getOne("queue", item.id);
    if (!current || current.state === "canceled") {
      await applyJobOutcome(item.id, { kind: "canceled" }, fileCtx);
      return;
    }

    await applyJobOutcome(
      item.id,
      { kind: "done" },
      {
        ...fileCtx,
        track,
        codec: current.codec,
        mediaType,
        ext,
        bytes: written.bytes,
      }
    );
  } catch (err) {
    if (err instanceof DownloadWriteAbortError || ac.signal.aborted) {
      const cur = await getOne("queue", item.id);
      await applyJobOutcome(
        item.id,
        { kind: cur?.state === "canceled" ? "canceled" : "paused" },
        fileCtx
      );
      return;
    }

    console.error("Download job failed", err);
    const httpStatus = /** @type {any} */ (err)?.httpStatus;
    const name = /** @type {Error} */ (err)?.name || "";
    const msg = /** @type {Error} */ (err)?.message || String(err);

    if (name === "RangeNotSatisfiableError" || /Range not satisfiable/i.test(msg)) {
      await removePartial(dirParts, fileName);
      await applyJobOutcome(item.id, { kind: "retry" }, fileCtx);
      return;
    }

    const cls = classifyError(err, httpStatus);
    if (cls === "offline" || cls === "server_down" || /** @type {any} */ (err)?.keepPartial) {
      reportFailure(err, httpStatus);
      await applyJobOutcome(item.id, { kind: "network" }, fileCtx);
      return;
    }

    await applyJobOutcome(
      item.id,
      {
        kind: "failed",
        error:
          name === "QuotaExceededError" || /quota/i.test(msg)
            ? "Storage full — free space and retry"
            : msg,
      },
      fileCtx
    );
  } finally {
    controllers.delete(item.id);
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
