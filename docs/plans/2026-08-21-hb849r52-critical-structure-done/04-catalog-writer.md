# Stage 04: Atomic catalog writer

## Status
done

## Description

Serialize catalog commit/delete with a module-level async mutex. Compute `firstPin` inside the IDB transaction. Finalize a successful job as one txn that upserts the track, bumps refs, and deletes the queue row. Fetch art after that txn. Delete IDB (and projection) first, then unlink OPFS. Never leave a queue row `ACTIVE` when finalize throws.

## Rationale

Two concurrent workers can both read `firstPin` and both write `refCount = 1`. `done` is commit-then-delete-queue; a thrown commit leaves `ACTIVE` and the pump only picks `PENDING`. That is the only correctness P0 in this plan.

## Invariants

- `MAX_CONCURRENT` stays 2. The mutex, not a concurrency drop, is the fix.
- Projection (`syncCatalogProjection`) still updates after a successful commit or delete.
- Enable/disable, wipe, and orphan-mark paths stay. Wipe still does not persist the enable flag off from a failed boot.
- Art bytes stay in OPFS. Do not write binaries to IDB.
- `catalog.ts` stays one file. Do not split projection/art/records.

## Risks

- Moving art *after* the txn means a brand-new album row can exist briefly with `hasThumb/hasFull` false until the fetch completes. Play/browse must already tolerate missing local art (they fall back to placeholder / remote).
- If art-after-txn updates `hasThumb` without the mutex, two jobs can race that flag. Hold the same mutex for the art flag update, or fold the flag write into a short second locked txn.
- `applyJobOutcome` today is not wrapped. A throw in `done` skips `failed`/`retry`. The catch must mark the job failed (or retryable) and must not leave `state === "active"`.

## Implementation

### Files

- `frontend/src/downloads/catalog.ts`
- `frontend/src/downloads/worker.ts`
- `frontend/tests/downloads/catalogWriter.test.ts` (new)

### Steps

1. Add a module-level async mutex in `catalog.ts` (a one-permit chain: `let tail = Promise.resolve(); function withCatalogLock(fn) { ... }`). `commitTrackDownload` and `deleteTrackDownload` run their body inside it.
2. Stop reading `existing` for `firstPin` before the txn. Inside the `tracks`/`albums`/`artists` (and, for finalize, `queue`) transaction, `get` the track row and set `firstPin` from that read. Increment album/artist `refCount` only on that `firstPin`.
3. Add `finalizeTrackDownload(track, codec, audioMeta, queueId)` (name as you like) that, under the lock: runs one `withStores(["tracks","albums","artists","queue"], "readwrite", ...)` to upsert the catalog row, bump refs, and `queue.delete(queueId)`. Then fetch/ensure art and patch `hasThumb`/`hasFull` under the same lock. `worker.done` calls this instead of `commitTrackDownload` + `deleteOne("queue")`.
4. `deleteTrackDownload`: under the lock, delete the track row, decrement refs, drop projection, *then* `deleteBinary` / lyrics unlink. If unlink throws, the catalog row is already gone (play will miss local and can mark broken on the next attempt). Do not unlink first.
5. `applyJobOutcome`: wrap the handler in try/catch. On throw, persist `failed` (or the existing retry classification) and clear `activeIds` as today. Never return leaving the row `ACTIVE`.
6. Extract the pin/refCount decision as a pure helper (input: existing track row or null, album record, artist records → next refCounts). Test it in `catalogWriter.test.ts`. Test that a mocked `finalize` throw is caught by `applyJobOutcome` and does not write `ACTIVE`.

### Verify

- `pnpm --dir frontend test`
- `pnpm --dir frontend typecheck`

## Acceptance

- Two overlapping commits of new tracks on the same album cannot both treat `firstPin` as true (lock + in-txn read).
- A successful download ends with a catalog `ready` row and no queue row, in one IDB transaction.
- If finalize throws, the queue row is not left `ACTIVE`.
- Delete removes IDB/projection before OPFS bytes.
- `catalog.ts` is still a single module. Queue/worker still import `media.ts` for filenames (stage 02).
