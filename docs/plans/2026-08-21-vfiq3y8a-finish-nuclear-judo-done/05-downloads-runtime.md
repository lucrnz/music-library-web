# Stage 05: Downloads runtime

## Status
done

## Description

Collapse the queue/policy/worker triangle into `queueRuntime.ts`. Worker is I/O via `streamUrl`. `CatalogTrackRecord` is storage-only. Queue snapshot is a `Track`. Delete `TreeNode.downloadMeta`. `index.ts` stops recomputing `queueSummary`.

## Rationale

Finish-a-download and show-the-offline-tree currently touch five to eight files. Stage 03 already shares the snapshot; this stage deletes the second orchestration and the extra track shapes.

## Invariants

- Finalize is still one IDB transaction (catalog + refcounts + queue delete) with art after. `withCatalogLock` stays in `writer.ts`.
- Public catalog import stays `@/downloads/catalog`.
- `ui.ts` still owns confirms; `index.ts` still owns enable/disable/enqueue actions (thin wrappers are fine).
- OPFS / IDB primitives stay in `opfs.ts` / `db.ts`.
- Browse snapshot from stage 03 still feeds list/tree/manager.

## Risks

- Worker tests mock `fetch('/api/stream?…')` and queue-policy side effects.
- Manager UI reads `downloadMeta` and `dataField` fallbacks.
- Narrowing `CatalogTrackRecord` can break `fromCatalogRecord` if a leftover alias path remains.

## Implementation

### Files

- `frontend/src/downloads/queueRuntime.ts`
- `frontend/src/downloads/queue.ts`
- `frontend/src/downloads/queuePolicy.ts`
- `frontend/src/downloads/worker.ts`
- `frontend/src/downloads/index.ts`
- `frontend/src/downloads/writer.ts`
- `frontend/src/downloads/state.ts`
- `frontend/src/models/track.ts`
- `frontend/src/components/tree/sources/artistsSource.ts`
- `frontend/src/components/tree/sources/downloadsSource.ts`
- `frontend/src/components/downloads/DownloadsModal.vue`
- `frontend/tests/downloads/queuePolicy.test.ts`
- `frontend/tests/downloads/actionKind.test.ts`
- `frontend/tests/downloads/resolve.test.ts`
- `frontend/tests/models/track.test.ts`
- `frontend/tests/tree/downloadsMenuMap.test.ts`

### Steps

1. Add `frontend/src/downloads/queueRuntime.ts`: `activeIds`, abort controllers, `pump`, and the policy hooks currently split across `queue.ts` mutation bus, `queuePolicy.setQueueMutationSideEffects`, and `worker.pump`. `queue.ts` keeps state names, IDB CRUD, and live progress records only.
2. `worker.ts` exports `executeDownloadJob` (range fetch, OPFS write, outcome). Build the GET with existing `streamUrl` (Range header stays on the fetch). Runtime imports `executeDownloadJob` and `applyJobOutcome`.
3. `queuePolicy.ts` keeps pause/network/health decisions and calls runtime to schedule a pump. Delete the bidirectional side-effect hook if runtime owns the call.
4. `index.ts` stops `computeQueueSummary`. Derive summary from `downloads.queue` in `state.ts` (or a function the modal already can call). Keep enable/disable/enqueue/orphan as the public action list.
5. Narrow `CatalogTrackRecord` in `frontend/src/models/track.ts`: storage fields only (`trackId`, `trackNum`, `primaryArtist*`, codec/status/bytes/…). Delete `id?`, `track?`, `artistId?`, `albumArtist?`, and snake aliases. `fromCatalogRecord` maps storage → `fromApiTrack` with camel keys only (no `is_lossy` / `source_codec` on the catalog path).
6. Queue snapshot type is `Track` (or `Pick<Track, …>` matching today’s snapshot fields). Enqueue writes a `Track`. Worker commit uses that `Track`, not `fromApiTrack(snapshot)` over a third shape.
7. Delete `DownloadMeta` and `downloadMeta` from `artistsSource.ts`. Snapshot/tree pack puts `{ codec, bytes, status }` on track `data` next to the `Track` fields the manager needs — or a typed `data: Track & { codec?: string; bytes?: number; status?: string }`. `DownloadsModal.vue` reads `Track` + those fields. Delete `dataField` / `dataNum` fallbacks that exist because `data` is `unknown`.

### Verify

- `pnpm --dir frontend test -- frontend/tests/downloads/queuePolicy.test.ts frontend/tests/downloads/actionKind.test.ts frontend/tests/downloads/resolve.test.ts frontend/tests/downloads/addAll.test.ts frontend/tests/models/track.test.ts frontend/tests/tree/downloadsMenuMap.test.ts frontend/tests/api/forget.test.ts`
- `pnpm --dir frontend typecheck`
- `rg -n "downloadMeta|DownloadMeta" frontend/src` is empty
- `rg -n "fetch\\(\\s*\`/api/stream" frontend/src/downloads` is empty
- `rg -n "is_lossy|source_codec|album_id" frontend/src/models/track.ts` remains only inside `fromApiTrack`’s HTTP picker, not on `CatalogTrackRecord`

## Acceptance

- One runtime owns pump / in-flight / abort. Worker does not schedule itself.
- Stream URL policy is `streamUrl`.
- `CatalogTrackRecord` has no snake aliases and no `id`/`track` twins.
- Queue snapshot is a `Track`. `downloadMeta` is gone.
- `index.ts` does not recompute queue summary.
- Commit/delete txn + art-after behavior is unchanged. Enable/disable/orphan still work.
