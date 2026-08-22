# Stage 02: Pump cap and demote extras

## Status
done

## Description

Replace the hardcoded concurrent cap with `downloads.concurrency`. Raising the cap schedules the pump immediately. Lowering it aborts the extra in-flight jobs with reason `demote` so they return to `pending` with the OPFS partial and byte progress kept.

## Rationale

This is the only stage that changes what the download manager actually does. The persist module from stage 01 is unused until the pump reads it and extras have a non-discard, non-global-pause abort path.

## Invariants

- After `pump` admits a job, `activeIds.size` is never greater than `downloads.concurrency`.
- Demote never calls `cancelQueueItem`, `discardRow`, `discardPartialForItem`, or `freezeActive` / `pauseQueuedWork`.
- A `queued` outcome leaves `state === pending`, keeps `loaded` / `total` (prefer the on-disk partial size when readable), and leaves the OPFS partial in place.
- A `CANCELED` row still wins over `queued` (same remap `applyJobOutcome` already does for `paused`).
- User-pause and auto-pause still freeze every active job and still mark those rows `paused`.
- `canPump()` is unchanged: user-pause and auto-pause still block new starts.
- `queue.ts` still does not import `queueRuntime.ts`.

## Risks

- Marking extras `pending` in `applyConcurrency` before the old `runJob` finishes lets the pump restart the same id while the previous fetch is still aborting. Leave the IDB row `active` until the `queued` handler runs; only drop the id from `activeIds`.
- Reusing `resolveAbortKind` (canceled vs paused) for demote would send extras into global `paused` and they would sit until Resume all. Branch on `DEMOTE_ABORT_REASON` first.
- `runJob.finally` already deletes from `activeIds` and calls `schedulePump`. Dropping extras from `activeIds` in `applyConcurrency` is still required so a raise/lower in the same turn cannot admit above the new cap.

## Implementation

### Files

- `frontend/src/downloads/queueRuntime.ts`
- `frontend/src/downloads/worker.ts`
- `frontend/src/downloads/index.ts`

### Steps

1. In `frontend/src/downloads/worker.ts`, add `"queued"` to `JobOutcomeKind`. Add an `outcomeHandlers.queued` that, when the row exists and is not `canceled`, `markPending`s it, writes `outcome.loaded` / `outcome.total` when present, prefers `partialByteSize` when `ctx.dirParts` / `ctx.fileName` are set (same as the `paused` handler), `putOne`s the row, `flushProgressToIdb`, and `emitQueueChange`. Do not delete the row or unlink files. In `applyJobOutcome`, if the incoming kind is `queued` and `current.state === CANCELED`, remap to `canceled` (keep the existing `paused`→`canceled` remap).
2. In `frontend/src/downloads/worker.ts` `executeDownloadJob`, at each of the three `ac.signal.aborted` returns, if the row is not canceled and `ac.signal.reason === DEMOTE_ABORT_REASON` (stage 01 export), return `{ kind: "queued" }` instead of `resolveAbortKind`. Leave the non-demote abort path on `resolveAbortKind` unchanged.
3. In `frontend/src/downloads/queueRuntime.ts`, delete `MAX_CONCURRENT`. `pump` compares `activeIds.size` to `downloads.concurrency`. Export `applyConcurrency(): Promise<void>`: if `activeIds.size > downloads.concurrency`, `listQueue()`, keep only rows whose `id` is in `activeIds` and whose `state` is `active`, join `getLiveProgress(id)?.loaded ?? row.loaded`, take `selectActiveToKeep(..., downloads.concurrency)`, `flushProgressToIdb` + `abortJob(id, DEMOTE_ABORT_REASON)` + `activeIds.delete(id)` for every active id not in the keeper set. Always `schedulePump()` at the end (no-op when `!canPump()` or already at the cap).
4. In `frontend/src/downloads/index.ts`, after a successful persist in `setDownloadConcurrency`, `void applyConcurrency()`. Do not import `index.ts` from the runtime module.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/downloads/concurrency.test.ts frontend/tests/downloads/queuePolicy.test.ts
pnpm --dir frontend typecheck
```

In the browser after stage 03 (this stage has no new chrome): with downloads enabled and four queued tracks, set the cap to 4 then back to 2 and confirm two stay active (the ones with more bytes), the others return to the queued list with their progress intact and later resume. Confirm Pause all still pauses every row, and Cancel on a demoting row still removes it.

Until stage 03 ships, exercise `setDownloadConcurrency` from the devtools console if you need a runtime check.

## Acceptance

- Starting from an empty `activeIds`, the pump starts at most `downloads.concurrency` pending rows.
- `setDownloadConcurrency(6)` while two jobs run and four are pending starts more jobs up to 6 when `canPump()` is true.
- `setDownloadConcurrency(1)` while two jobs run aborts the lower-`loaded` one; that row becomes `pending` with its partial kept; the other stays `active`.
- User-pause / offline auto-pause still mark in-flight rows `paused`, not `pending`.
- `pnpm --dir frontend typecheck` passes.
