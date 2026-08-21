# Stage 03: Frontend forget on clear and last-row remove

## Status
done

## Description

Delete `clearCache`. Clear-queue and row-remove send last-occurrence ids to `POST /api/transcode/forget`. Drop matching `preparedKeys`. Do not forget when loading a saved playlist.

## Rationale

The only production caller of wipe-all is `clearPlaylist`. Row remove was decided in grilling and needs the same last-occurrence rule. This stage is the user-visible behavior change.

## Invariants

- No remaining import or mock of `clearCache`.
- `loadSavedPlaylist` still `pl.clear()` + `addToQueue` and does **not** forget.
- An id is sent only when it is absent from the queue after the mutation.
- Fire-and-forget: do not block UI on the POST; swallow network errors (same as today’s `clearCache`).
- Client does not send a codec and does not receive or display skipped ids.
- If unique ids exceed 1000, chunk to the prepare cap.

## Risks

- Computing “removed row ids” without checking the remaining queue forgets a duplicate that is still queued.
- Snapshotting ids after `pl.clear()` sends `[]`. Snapshot before the mutation.

## Implementation

### Files

- `frontend/src/api.ts`
- `frontend/src/stores/playlist.ts`
- `frontend/tests/stores/playlist.test.ts`
- `frontend/tests/stores/playerPrefs.test.ts`

### Steps

1. Replace `clearCache` with `requestForget(ids: string[]): void`. Unique, drop empties, `void apiPost("/api/transcode/forget", { ids }).catch(() => {})`. Delete every `id|` prefix from `preparedKeys` for ids actually sent. Chunk at 1000 if needed.
2. Export a pure `idsLeavingQueue(removedIds: Iterable<string>, remaining: Array<{ id?: string }>): string[]` (or equivalent) so the last-occurrence rule is unit-tested without Vue.
3. `clearPlaylist`: snapshot unique track ids, then `pl.clear()`, `stopPlayback()`, `preparedKeys.clear()`, `requestForget(ids)`, `commit()`.
4. `removeIndices`: snapshot removed ids from those indices, then existing `pl.removeIndices` + play/stop, then `requestForget(idsLeavingQueue(removed, pl.tracks))`.
5. Update vitest api mocks: `requestForget` instead of `clearCache`. Add tests: clear-all sends unique ids; remove one of two copies of A sends nothing; remove the last A sends `[A]`; `loadSavedPlaylist` is not required to assert forget if it never imported it — do not add a call.

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test`
- Grep `frontend/` for `clearCache` and `/api/cache/clear` — none
- Browser (dev server + built API):
  - Play a lossless queue, Clear queue: playback stops, queue empty, network shows `POST /api/transcode/forget` with those ids and **no** `/api/cache/clear`.
  - Queue `[A, B, A]`, remove one A: no forget for A (or a forget body that omits A). Remove the last A: forget includes A.
  - Load a saved playlist: no forget POST.
  - Desktop and a narrow mobile width: clear and row-remove still work; player/queue state matches today aside from the request.

## Acceptance

- Wipe-all HTTP is gone from the SPA.
- Clear queue and last-row remove forget; duplicate remaining rows do not.
- Saved-playlist load does not forget.
- `preparedKeys` no longer claims a forgotten id is prepared.
