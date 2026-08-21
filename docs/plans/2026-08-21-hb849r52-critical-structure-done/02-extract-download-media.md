# Stage 02: Extract download media helpers

## Status
done

## Description

Move `codecExt` and `codecMediaType` to `frontend/src/downloads/media.ts`. Queue, worker, and queue-policy import that module. Catalog stops being the filename façade.

## Rationale

Stage 04 turns `catalog.ts` into the write-mutex owner. Queue/worker today import catalog only to compute extensions. That inversion has to go before the writer work, or the mutex file stays a codec barrel.

## Invariants

- Lossy downloads still use `SOURCE_TAG` and `sourceFileMedia` (mp3/aac only; other source codecs still throw).
- Unknown non-source tags still default to opus (same heuristic as today). Do not “fix” that in this stage.
- `catalog.ts` may import `media.ts`. `media.ts` must not import `catalog.ts`.
- Do not re-export `audioDirParts` / `audioFileName` / `normalizeTrack` from catalog.

## Risks

- Callers outside the package that imported `codecExt` from catalog will break. Today those callers are `queue.ts`, `worker.ts`, and `queuePolicy.ts` only — move those three and grep.

## Implementation

### Files

- `frontend/src/downloads/media.ts` (new)
- `frontend/src/downloads/catalog.ts`
- `frontend/src/downloads/queue.ts`
- `frontend/src/downloads/worker.ts`
- `frontend/src/downloads/queuePolicy.ts`
- `frontend/tests/downloads/media.test.ts` (new, optional if existing tests already cover the heuristic via catalog)

### Steps

1. Create `media.ts` with `codecExt` and `codecMediaType` moved verbatim from `catalog.ts` (same `SOURCE_TAG` / `sourceFileMedia` / `flac*` / opus default).
2. Point `queue.ts`, `worker.ts`, and `queuePolicy.ts` at `@/downloads/media`. Leave their `getTrackRecord` / `commitTrackDownload` catalog imports as they are.
3. `catalog.ts` imports `codecExt` / `codecMediaType` from `./media` for commit/delete filename use. Remove the functions and the OPFS path re-exports (`audioDirParts`, `audioFileName`) and any leftover `normalizeTrack` re-export.
4. Grep `codecExt` / `codecMediaType` — no remaining catalog imports of those names.

### Verify

- `rg -n "codecExt|codecMediaType" frontend/src` shows definitions only in `media.ts` and uses elsewhere.
- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test`

## Acceptance

- `queue.ts`, `worker.ts`, and `queuePolicy.ts` do not import `@/downloads/catalog` for codec or filename helpers.
- `catalog.ts` does not re-export OPFS path helpers or `normalizeTrack`.
- Filename/MIME behavior for `source`, `flac*`, and other tags is unchanged.
