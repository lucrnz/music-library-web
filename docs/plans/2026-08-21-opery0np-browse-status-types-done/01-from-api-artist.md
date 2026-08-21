# Stage 01: fromApiArtist

## Status
done

## Description

Add `frontend/src/models/artist.ts` with camel `Artist` and `fromApiArtist` / `mapArtists`. Map every artist-bearing GET at the API boundary. Delete `ArtistListItem`. `ListenArtist` is `Artist` plus camel ranking fields. Leaves read `albumCount`, `preferredRev`, and friends only.

## Rationale

Artists are the remaining wire-shaped leaf. Browse, tree, artist-art, cover flip, and stats all speak snake because there is no mapper. Doing this first means stage 03 does not write `album_count` and then throw it away.

## Invariants

- Server JSON stays snake_case. The query param on `artistImageUrl` stays `rev`.
- Folder browse rows (`dirs` / `files`) stay server-shaped.
- Preferred-image overlay in `artistArt/state.ts` stays `hasPreferred` / `preferredRev` (already camel) and writes those onto the mapped `Artist` for URL busting.

## Risks

- `upload.ts` currently casts `res.json()` as `ArtistListItem`. A missed `fromApiArtist` there leaves a snake object in a camel typed slot.

## Implementation

### Files

- frontend/src/models/artist.ts
- frontend/tests/models/artist.test.ts
- frontend/src/api.ts
- frontend/src/listens/types.ts
- frontend/src/downloads/browse.ts
- frontend/src/downloads/art.ts
- frontend/src/artistArt/submit.ts
- frontend/src/artistArt/upload.ts
- frontend/src/artistArt/state.ts
- frontend/src/components/player/coverFlip.ts
- frontend/src/components/tree/LibraryTreePane.vue
- frontend/src/components/tree/sources/downloadsSource.ts
- frontend/src/components/tree/sources/artistsSource.ts
- frontend/src/components/library/artistMenuItems.ts
- frontend/src/components/library/browseSource.ts
- frontend/src/components/library/LibraryView.vue
- frontend/src/components/library/entityMenu.ts
- frontend/src/components/library/loaders.ts
- frontend/src/components/library/EntityListHost.vue
- frontend/src/components/library/sources/downloadsBrowse.ts
- frontend/src/components/library/sources/onlineBrowse.ts
- frontend/src/components/library/rows/ArtistCard.vue
- frontend/src/components/library/rows/ArtistRow.vue
- frontend/src/components/stats/StatsArtistRow.vue
- frontend/tests/player/coverFlip.test.ts
- frontend/tests/artistArt/state.test.ts
- frontend/tests/artistArt/artistImageUrl.test.ts
- frontend/tests/library/entityActions.test.ts
- frontend/tests/library/artistMenuItems.test.ts
- frontend/tests/library/useEntityMenu.test.ts
- frontend/tests/tree/downloadsMenuMap.test.ts

### Steps

1. Add `frontend/src/models/artist.ts` mirroring the album model: `Artist` (`id`, `name`, `sortName`, `albumCount`, `trackCount`, `hasImage`, `hasPreferredImage`, `preferredRev`), `fromApiArtist`, `coerceArtist`, `mapArtists`. Pick snake and camel on the way in.
2. In `frontend/src/api.ts`: delete `ArtistListItem`; `fetchArtist` returns `fromApiArtist(...)`; `fetchSearch` maps `data.artists` through `mapArtists`; add `fetchArtists` that GETs `/api/artists` and maps; `mapListenArtist` spreads `fromApiArtist(raw)` and sets `playCount` / `lastCountedAt`; `artistImageUrl` reads `preferredRev` (id-only string arg still works).
3. Point `frontend/src/components/library/loaders.ts` and `frontend/src/components/tree/sources/artistsSource.ts` at `fetchArtists` / mapped `Artist` — no raw `apiGet<ArtistListItem>`.
4. Switch every listed consumer and test fixture from `ArtistListItem` + `album_count` / `preferred_rev` / `has_image` / `has_preferred_image` / `track_count` / `sort_name` to `Artist` camel. Downloads fabrications in `frontend/src/downloads/browse.ts` and `artistFromDl` in `frontend/src/components/tree/sources/downloadsSource.ts` mint camel fields. `ListenArtist` in `frontend/src/listens/types.ts` extends `Artist` with `playCount` and `lastCountedAt`. `StatsArtistRow.vue` reads `playCount`.
5. `frontend/src/artistArt/upload.ts` success JSON goes through `fromApiArtist`. `coverSrc` / `menuHasPreferred` / `coverFlip.ts` / `submit.ts` read camel fields. `coverSrc` passes `preferredRev` into `artistImageUrl`.

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test tests/models/artist.test.ts tests/artistArt/state.test.ts tests/artistArt/artistImageUrl.test.ts tests/player/coverFlip.test.ts tests/library/artistMenuItems.test.ts tests/library/entityActions.test.ts tests/library/useEntityMenu.test.ts tests/tree/downloadsMenuMap.test.ts`

## Acceptance

- `ArtistListItem` does not exist. `rg ArtistListItem frontend/src frontend/tests` is empty.
- `fromApiArtist({ id, name, album_count, track_count, has_image, has_preferred_image, preferred_rev, sort_name })` yields camel fields; `fetchArtist` / `fetchArtists` / `fetchSearch` / `fetchListenRankings` artists are mapped.
- `artistImageUrl(artist, "thumb")` appends `&rev=` when `preferredRev !== 0`.
- `pnpm --dir frontend typecheck` exits 0. The Verify test list exits 0.
