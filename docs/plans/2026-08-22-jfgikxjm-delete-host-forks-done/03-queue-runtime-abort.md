# Stage 03: Queue runtime abort

## Status
done

## Description

Move in-flight abort maps into `queueRuntime.ts`. Delete the dead download symbols. `queue.ts` is IDB + events + progress.

## Rationale

The last downloads extract parked `activeIds` / `controllers` in `queue.ts`. Two abort owners (`abortAllJobs` unused, `stopAllWorkers` in the worker) is the leftover fork.

## Invariants

- Pump still caps at two concurrent jobs and still respects `canPump`.
- Cancel of an active item still aborts the controller and marks canceled; non-active cancel still discards the row + partial.
- Disable still stops workers then clears the queue. Pause still freezes via `freezeWork`.
- `player.ts` still remints once after a broken local blob (`localBroken: true`).

## Risks

- `freezeWork` / `cancelQueueItem` in `queue.ts` must call runtime `abortJob` without importing the pump in a cycle. Runtime already imports `queue.ts` CRUD — abort functions live in runtime; queue CRUD calls them.
- If a cycle appears, keep a tiny callback slot set at `initQueueRuntime` (same pattern as `setQueueMutationSideEffects`) rather than a third downloads module.

## Implementation

### Files

- `frontend/src/downloads/queue.ts`
- `frontend/src/downloads/queueRuntime.ts`
- `frontend/src/downloads/worker.ts`
- `frontend/src/downloads/index.ts`
- `frontend/src/downloads/writer.ts`
- `frontend/src/downloads/catalog.ts`
- `frontend/src/stores/player.ts`

### Steps

1. Move `activeIds`, `controllers`, `abortJob`, and `stopAllWorkers` into `frontend/src/downloads/queueRuntime.ts`. Delete `abortAllJobs`. `worker.ts` keeps `executeDownloadJob` / `applyJobOutcome` only — delete its `stopAllWorkers`.
2. Point `cancelQueueItem`, `freezeWork`, and `index.ts` `disableDownloads` at the runtime abort API. Fix the stale `queue.ts` / `index.ts` / `worker.ts` headers (no `.js` paths; `queue.ts` is not “runtime”).
3. Delete `commitTrackDownload` from `frontend/src/downloads/writer.ts` and its re-export in `frontend/src/downloads/catalog.ts`. Keep `finalizeTrackDownload`.
4. Delete `markDownloadBroken` from `frontend/src/downloads/index.ts`. In `frontend/src/stores/player.ts`, import `markTrackBroken` from `@/downloads/catalog` (or writer via the catalog barrel). Do not edit `failCurrentLoad` or the volume watch.

### Verify

- `pnpm --dir frontend test -- frontend/tests/downloads/queuePolicy.test.ts frontend/tests/downloads/resolve.test.ts frontend/tests/downloads/actionKind.test.ts`
- `pnpm --dir frontend typecheck`
- `rg -n "abortAllJobs|commitTrackDownload|markDownloadBroken|stopAllWorkers" frontend/src frontend/tests` is empty except archived `docs/plans/*-done/`
- `rg -n "activeIds|controllers" frontend/src/downloads/queue.ts` is empty
- `rg -n "queuePolicy\\.js|worker\\.js|catalog\\.js" frontend/src/downloads` is empty

## Acceptance

- `queueRuntime.ts` owns pump + abort maps + `stopAll`. `queue.ts` has no `activeIds` / `controllers`.
- `abortAllJobs`, `commitTrackDownload`, and `markDownloadBroken` are gone.
- `player.ts` fail/volume code from stage 01 is untouched except the catalog import.
