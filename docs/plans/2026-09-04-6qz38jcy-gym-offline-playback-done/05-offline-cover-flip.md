# Stage 05: Offline cover flip from local artist full

## Status
done

## Description

Allow the expanded now-playing cover to flip to the artist photo when a downloaded full file or VA flags exist, without `canReachServer()` or `GET /api/artists/{id}`. Remote flip stays the online path.

## Rationale

Stage 03/04 store the bytes and flags. Flip still denies when `canReachServer()` is false, which is the gym “I cannot flip” report.

## Invariants

- Mini and compact-bar covers still do not flip.
- Lyrics overlay still blocks the flip tap and does not change the face.
- No flip from thumb-only (`hasThumb && !hasFull`) except VA (packaged portrait, no file).
- Online flip for non-downloaded artists is unchanged (`fetchArtist` + `artistImageUrl(..., "full")`).
- `coverFlip.ts` still does not import `player.ts` or `radio.ts`.

## Risks

- Using a remote `imageUrl` while offline after a cached `fetchArtist` hit is the current “denies after cache hit when unreachable” behavior; local full must win before that gate so a downloaded artist is not denied.
- Object URLs from `getLocalArtistImageUrl` must not be revoked while the flip face is showing them.

## Implementation

### Files

- `frontend/src/downloads/art.ts`
- `frontend/src/downloads/catalog.ts`
- `frontend/src/components/player/coverFlip.ts`
- `frontend/src/components/player/NowPlayingView.vue`
- `frontend/tests/player/coverFlip.test.ts`
- `frontend/tests/downloads/art.test.ts`

### Steps

1. In `frontend/src/downloads/art.ts`, add `getLocalArtistFlip(artistId)` that reads the catalog artist row and `getLocalArtistImageUrl(id, "full")` and returns `{ imageUrl, hasImage, hasPreferredImage, isVa, hasFull } | null`. Re-export it from `frontend/src/downloads/catalog.ts`. `coverFlip.ts` must not import `@/downloads/db`.
2. In `frontend/src/components/player/coverFlip.ts`, extend `CoverFlipDeps` with `getLocalArtist?: typeof getLocalArtistFlip` (default `getLocalArtistFlip`). Change `resolveCoverFlip` order: resolve `artistId` as today; if local artist exists and (`isVa` or (`hasFull` and a non-null `imageUrl`)), return `{ ok: true, artistId, imageUrl }` using the local URL, or `flipImageUrl` for VA when there is no file. Do not require `canReachServer()` on that path. If no local flip, keep today’s `canReachServer()` + `fetchArtist` + `artistHasFlipPhoto` + remote `flipImageUrl`.
3. Keep the in-memory `fetchArtist` cache for the remote path only. Do not cache a deny caused by `!canReachServer()` when a later backfill could add `hasFull`.
4. `frontend/src/components/player/NowPlayingView.vue` can keep calling `resolveCoverFlip(props.track)` with defaults. Watch `connectivity.state` may stay so an online recovery still enables remote-only flip; a local-full result must already be `ok` while `state !== "online"`.
5. Update `frontend/tests/player/coverFlip.test.ts`: local `hasFull` + url with `canReachServer: () => false` is `ok` and does not `fetchArtist`; VA local flags with no url and unreachable is `ok` and `imageUrl` is the packaged `artistImageUrl`; thumb-only local + unreachable is `ok: false`; remote path tests stay green. Add a `getLocalArtistFlip` case in `frontend/tests/downloads/art.test.ts` for `hasFull` vs thumb-only.

### Verify

- `pnpm --dir frontend test -- frontend/tests/player/coverFlip.test.ts` passes.
- `rg -n "canReachServer" frontend/src/components/player/coverFlip.ts` still exists for the remote path only (after the local hit returns).
- `rg -n "player.ts|stores/player|radio.ts" frontend/src/components/player/coverFlip.ts` is empty.

## Acceptance

- Playing a downloaded track with a stored artist full, with the session `offline` or `server_down`, the expanded cover is a flip toggle and shows that local image.
- VA downloaded tracks flip to the packaged portrait while unreachable.
- An undownloaded artist while unreachable still does not flip.
