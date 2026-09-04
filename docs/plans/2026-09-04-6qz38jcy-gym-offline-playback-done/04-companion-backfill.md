# Stage 04: Backfill existing downloads

## Status
done

## Description

Walk the existing catalog when the server is reachable and fill missing album art, artist full photos / flags, and lyrics. Also fill on play of a downloaded track. The walker is silent (not a download-manager job) and yields while the user queue has work.

## Rationale

Gym library rows were committed before stage 03. Without a backfill they still have no flip file and no lyrics until the user deletes and re-downloads.

## Invariants

- Do not enqueue companion work on `queue.ts` / the manager UI.
- Do not run the walker when `!canReachServer()` or `isHardOffline()`.
- At most one companion fetch in flight in the walker. If `queueHasWork()` is true, wait and retry later (do not steal the audio pump).
- `not_found` lyrics are revalidated when online (stage 03 rule); `ok` / `instrumental` are not refetched.
- Writer/catalog lock still owns IDB mutations; the walker calls stage 03 ensure helpers.

## Risks

- A large catalog + naive tight loop hammers `/api/artists` and `/api/tracks/.../lyrics` on LAN. Yield between rows (rAF or a short `setTimeout`).
- Running from `initDownloads` before codecs/`reportSuccess` can no-op; subscribe to connectivity recovery so it starts after 01’s confirm.

## Implementation

### Files

- `frontend/src/downloads/backfill.ts`
- `frontend/src/downloads/index.ts`
- `frontend/src/downloads/queuePolicy.ts`
- `frontend/src/stores/player.ts`
- `frontend/tests/downloads/`
- `frontend/tests/downloads/backfill.test.ts`

### Steps

1. Add `frontend/src/downloads/backfill.ts` with `requestCompanionsBackfill()` (idempotent schedule) and `backfillTrack(trackId)` (one catalog row: `ensureAlbumArtFiles` if the album is missing thumb/full, `ensureArtistPhoto` for each pinned artist missing flags or missing `hasFull` when flags say there is a photo, `cacheLyricsForDownload` when there is no lyrics row or the row is `not_found`). Skip when `!canReachServer()`.
2. Implement the quiet walk: list track records, one row at a time, `await backfillTrack`, then yield. If `queueHasWork()`, stop and `requestCompanionsBackfill` again after a delay (reuse connectivity recovery rather than a new global timer if possible). Do not call `setHealthWork` for this walker.
3. From `frontend/src/downloads/index.ts` after a successful `initDownloads` / enable path, call `requestCompanionsBackfill()`.
4. From `frontend/src/downloads/queuePolicy.ts`, on `onConnectivityRecovered` (or the existing recovered listener next to resume), call `requestCompanionsBackfill()`.
5. From `frontend/src/stores/player.ts` `playIndex`, after the current track id is known, if downloads are enabled and `catalogIndex` / `getTrackRecord` says the row exists, `void backfillTrack(track.id)` (do not block `loadResolved`).
6. Add `frontend/tests/downloads/backfill.test.ts`: walker no-ops when `canReachServer()` is false; `backfillTrack` calls ensure/cache helpers for a row missing art/lyrics; `requestCompanionsBackfill` does not start a second walk while one is in flight; when `queueHasWork()` is true the walk stops without calling ensure.

### Verify

- `pnpm --dir frontend test -- frontend/tests/downloads/backfill.test.ts frontend/tests/downloads/queuePolicy.test.ts` passes.
- `rg -n "enqueueTrack|enqueueMany" frontend/src/downloads/backfill.ts` is empty.
- `rg -n "requestCompanionsBackfill|backfillTrack" frontend/src/downloads/index.ts frontend/src/downloads/queuePolicy.ts frontend/src/stores/player.ts` hits each hook.

## Acceptance

- An older ready catalog row with no lyrics and no artist `full`, once the session is `online`, gains those companions without appearing in the download manager.
- Playing that row while online also triggers a single-track fill.
- User audio downloads still take the pump; the walker waits.
