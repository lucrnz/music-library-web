# Stage 03: Downloads abort invert

## Status
done

## Description

Make the downloads queue graph one-way: CRUD does not import the pump, abort lives in runtime, and live progress has one store.

## Rationale

`queue.ts` ↔ `queueRuntime.ts` is a circular cut from the last extract. `downloads.liveProgress` plus `overlayQueue` is a third copy of the live `Map`. Inverting abort and deleting the extra store removes the cycle without a callback that still means “queue knows abort.”

## Invariants

- Max concurrent downloads stays 2. Pause / cancel / clear still abort in-flight work.
- Connectivity auto-pause and user pause still freeze active jobs (IDB paused + abort).
- `discardRow` deletes the IDB row and partial; it does not touch `activeIds`.
- Catalog / OPFS writers are unchanged.

## Risks

- `queueRuntime` already imports `queuePolicy`. Policy must not import runtime. Freeze has to be injected through `initPolicy` or connectivity pause will not abort.
- `refreshQueue` without a read-time join of the live `Map` can flash stale IDB `loaded` values. Join for that assignment only; do not restore `downloads.liveProgress`.

## Implementation

### Files

- frontend/src/downloads/queue.ts
- frontend/src/downloads/queueRuntime.ts
- frontend/src/downloads/queuePolicy.ts
- frontend/src/downloads/index.ts
- frontend/src/downloads/state.ts
- frontend/tests/downloads/queuePolicy.test.ts

### Steps

1. In `frontend/src/downloads/queue.ts`, remove the `queueRuntime` import. `discardRow` no longer calls `activeIds.delete`. Split today’s `freezeWork` into IDB-only pause of pending/active rows that **returns** the ids that were `ACTIVE`. Split `cancelQueueItem`: inactive path stays `discardRow`; active path becomes mark-canceled + persist (no abort). Keep the live `Map`, persist timers, `getAllLiveProgress`, and progress events.
2. In `frontend/src/downloads/queueRuntime.ts`, add `freezeActive(reason)` (IDB pause then `abortJob` for returned ids) and `cancelItem(id)` (if active: mark canceled, `abortJob`; else `discardRow`). `stopAll` remains the clear path. `initQueueRuntime` / `initPolicy` passes `freeze: freezeActive`.
3. In `frontend/src/downloads/queuePolicy.ts`, stop importing `freezeWork`. `initPolicy` stores the injected `freeze` and connectivity / `pauseAllDownloads` / `onJobNetworkFailure` / `reapplyNetworkPolicy` call that hook. Update the `freezeWork` mock in `frontend/tests/downloads/queuePolicy.test.ts` to match the new import surface (policy no longer imports `freezeWork` from queue).
4. In `frontend/src/downloads/index.ts`, `cancelQueueItem` calls `cancelItem` from runtime. Delete `overlayQueue` and every `downloads.liveProgress` read/write. `refreshQueue` assigns `listQueue()` rows with a one-shot join from `getAllLiveProgress()`. Progress listener still patches `downloads.queue[idx]` in place. `disableDownloads` does not clear a `liveProgress` field.
5. In `frontend/src/downloads/state.ts`, remove `liveProgress` from the type and the reactive object. Manager cancel stays on `index.ts` `cancelQueueItem` (no modal edit).

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test` (downloads)
- `rg "from \\\"@/downloads/queueRuntime\\\"" frontend/src/downloads/queue.ts` is empty
- `rg liveProgress frontend/src` is empty

## Acceptance

- `frontend/src/downloads/queue.ts` does not import `queueRuntime`.
- `frontend/src/downloads/queuePolicy.ts` does not import `queueRuntime`.
- Active cancel and freeze abort are implemented in `frontend/src/downloads/queueRuntime.ts`.
- `downloads.liveProgress` and `overlayQueue` do not exist.
- Typecheck and downloads tests pass.
