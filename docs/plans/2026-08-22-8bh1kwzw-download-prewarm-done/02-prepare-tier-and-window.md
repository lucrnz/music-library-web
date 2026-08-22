# Stage 02: Prepare tier and window helper

## Status
done

## Description

Teach `requestPrepare` to send `tier: "download"` without touching play `preparedKeys`. Add a pure downloads helper that picks the first 8 pending / user-paused lossless encodeable queue rows and groups them by row codec. Do not POST from the download manager yet.

## Rationale

Stage 03 needs a stable POST shape and a testable window. Putting both here keeps the later lifecycle wire-up thin and stays inside the node-test surface (`docs/development/testing.md` forbids OPFS / download-worker tests).

## Invariants

- Play `requestPrepare` / `prepareTracks` behavior is unchanged when `tier` is omitted (`preparedKeys`, `urgent`, `replace`).
- `tier: "download"` is included in the JSON body. That call does **not** read or write `preparedKeys`.
- Window size is exactly 8 (`DOWNLOAD_PREWARM_WINDOW`).
- Window source rows are `pending` or `paused`, in `addedAt` ascending (then `id`). Not `active`, `failed`, or `canceled`.
- A row is encodeable only when it has a `trackId`, is not lossy, and its stored `codec` is not `source`.
- Output is grouped by `codec`, groups ordered by first appearance in the window, ids inside a group in window order.
- `queue.ts` does not import this module.

## Risks

- Reusing `preparedKeys` for download POSTs would skip a later play prepare of the same id|codec after a cache wipe, and would block window retries if the server returned `skipped`.
- Counting `active` rows toward 8 would shrink the real lookahead (those jobs already hit `/api/stream`).

## Implementation

### Files

- `frontend/src/playback/prepare.ts`
- `frontend/src/downloads/prewarm.ts`
- `frontend/tests/playback/prepare.test.ts`
- `frontend/tests/downloads/prewarm.test.ts`

### Steps

1. In `frontend/src/playback/prepare.ts`, extend `requestPrepare`’s options with optional `tier?: "download"`. When `tier === "download"`, skip the `preparedKeys` filter/add, still no-op on empty ids, and POST `{ ids, codec, replace, urgent, tier: "download" }`. Omitted `tier` keeps today’s body (no `tier` key, or only play fields) and today’s `preparedKeys` behavior. Do not change `prepareTracks`.
2. Create `frontend/src/downloads/prewarm.ts` with no Vue, IDB, or runtime imports. Export `DOWNLOAD_PREWARM_WINDOW = 8` and `selectDownloadPrewarmWindow(rows)` where each row is `{ id?: number; trackId: string; codec: string; state: string; addedAt: number; snapshot?: { isLossy?: boolean } }`. Return `Array<{ codec: string; ids: string[] }>`. Sort, filter, slice to 8, then group.
3. In `frontend/tests/playback/prepare.test.ts`, add a case that `requestPrepare(["a"], "opus_192_48000", { tier: "download" })` POSTs `tier: "download"` and does not add `a|opus_192_48000` to `preparedKeys`. Keep an existing play-path assertion that still uses `preparedKeys`.
4. Add `frontend/tests/downloads/prewarm.test.ts` (node vitest). Cover: first 8 of 12 pending lossless; `active` / `failed` / `canceled` skipped; `paused` included; lossy and `codec: "source"` skipped; two codecs become two groups in first-seen order; `addedAt` tie broken by `id`.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/playback/prepare.test.ts frontend/tests/downloads/prewarm.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- Play prepare tests still pass; `preparedKeys` is unchanged for omitted `tier`.
- A download-tier `requestPrepare` sends `tier: "download"` and leaves `preparedKeys` untouched.
- `selectDownloadPrewarmWindow` returns at most 8 ids, pending+paused only, grouped by codec.
- Nothing in `frontend/src/downloads/index.ts` or `queueRuntime.ts` calls prepare yet.
