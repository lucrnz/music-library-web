# Stage 01: Artist photo eligibility

## Status
done

## Description

Add a presentational-free helper that answers: for this track, right now, may the now-playing cover flip, and if so what `size=full` artist image URL should the back face use? No Vue, no CSS, no tap handling.

## Rationale

The “do not flip without a real photo, and disable while the server is unreachable” rule is easy to get wrong in the component. A tested module lets stage 02 only wire state and chrome.

## Invariants

- Does not import `player.ts` or `radio.ts`.
- Does not call scan, regen, or preferred-image upload APIs. Read path is existing `fetchArtist` + `artistImageUrl`.
- `_unknown`, missing track, or missing artist id → not eligible, zero HTTP.
- `canReachServer()` false → not eligible, zero HTTP.
- Eligible only when the artist payload has `has_image` or `has_preferred_image`.
- Successful payloads are cached per artist id for the page lifetime. Network / abort failures are not cached as “no photo”.
- Image URL is `artistImageUrl(artist, "full", false)` so a nonzero `preferred_rev` is on the query string.

## Risks

- Caching a failed fetch as negative would permanently disable flip after a blip until remount.
- Calling `fetchArtist("_unknown")` would 404 in a loop if the sentinel is not stripped first.

## Implementation

### Files

- `frontend/src/components/player/coverFlip.ts` (create)
- `frontend/tests/player/coverFlip.test.ts` (create)

### Steps

1. Export a small API, for example:
   - `coverFlipArtistId(track: Track | null): string | null` — `primaryArtistIdOf` minus `_unknown` / empty.
   - `artistHasFlipPhoto(artist: Pick<ArtistListItem, "has_image" | "has_preferred_image">): boolean`.
   - `flipImageUrl(artist: ArtistListItem): string` — `artistImageUrl(artist, "full", false)`.
   - `resolveCoverFlip(track, deps)` → `Promise<{ ok: false } | { ok: true, artistId: string, imageUrl: string }>`.
2. `deps` inject `fetchArtist` (default: `fetchArtist` from `@/api`) and `canReachServer` (default: the connectivity export) so tests do not hit the network.
3. Module-level `Map<string, ArtistListItem>` for successful GETs only. 404 / thrown fetch: return `{ ok: false }` and do not write the map. A later call with the server reachable retries.
4. If `canReachServer()` is false, return `{ ok: false }` before touching the cache or the network (feature off while unreachable, even if a previous payload is cached).
5. If the cache already has the artist and the server is reachable, do not fetch again.
6. Export `clearCoverFlipCache()` for tests (and only tests).

### Verify

- `pnpm --dir frontend test -- frontend/tests/player/coverFlip.test.ts`
- `pnpm --dir frontend typecheck`
- Cases the spec must cover: null track; `_unknown`; unreachable (no fetch); `has_image`; preferred-only + `rev=` on URL; both flags false; thrown fetch not cached (second call with reachable server fetches again); cache hit (one fetch for two resolves); reachable → unreachable second call is `{ ok: false }` and does not fetch.

## Acceptance

- Helper matches the table in Verify with no real HTTP.
- Unreachable always denies flip and never issues `GET /api/artists/{id}`.
- Cached “has photo” does not keep flip enabled while `canReachServer()` is false.
