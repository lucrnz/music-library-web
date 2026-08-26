# Stage 03: Wire album surfaces

## Status
done

## Description

Render the shared album meta line on both trees, grid cards, list/search rows, and a new muted album-page subtitle.

## Rationale

Stage 01–02 only produce a number and a string. This stage is what the user sees on album entities.

## Invariants

- Artists-tree album rows: `formatAlbumMeta` without artist (`Year · N tracks · m:ss`).
- Albums-tree, `AlbumCard`, `AlbumListRow`: `formatAlbumMeta` with artist.
- Album chrome subtitle: `formatAlbumMeta` without artist. No subtitle node when the string is empty.
- Downloads hosts keep using the same card/row/chrome components; missing year/duration just omit those segments.
- Do not change downloads tree `snapshot.ts` subtitles.

## Risks

- `.view-bar` is a fixed `56px`. A second line will clip unless the bar uses `min-height` and the title block stacks.
- Long card subtitles (`Artist · 1996 · 11 tracks · 48:32`) will ellipsis on narrow cards; that is accepted.
- Downloads album pages may show `N tracks` alone in chrome. Accepted side effect; do not special-case.

## Implementation

### Files

- `frontend/src/components/library/rows/AlbumCard.vue`
- `frontend/src/components/library/rows/AlbumListRow.vue`
- `frontend/src/components/tree/sources/albumsSource.ts`
- `frontend/src/components/tree/sources/artistsSource.ts`
- `frontend/src/components/library/LibraryChrome.vue`
- `frontend/src/components/library/LibraryView.vue`
- `frontend/css/app.css`

### Steps

1. In `frontend/src/components/library/rows/AlbumCard.vue` and `AlbumListRow.vue`, replace the local `sub` join with `formatAlbumMeta({ artist, year, trackCount, durationSec: album.duration })`.
2. In `frontend/src/components/tree/sources/artistsSource.ts`, set album `subtitle` to `formatAlbumMeta({ year: al.year, trackCount: al.trackCount, durationSec: al.duration })`.
3. In `frontend/src/components/tree/sources/albumsSource.ts`, set album `subtitle` to `formatAlbumMeta({ artist: al.artist, year: al.year, trackCount: al.trackCount, durationSec: al.duration })`.
4. In `frontend/src/components/library/LibraryChrome.vue`, add an optional `subtitle` prop. Under `.view-title`, render `.view-sub` when it is non-empty. Wrap both in `.view-title-block` so the actions stay on the right.
5. In `frontend/css/app.css`, change `.view-bar` from `height: var(--viewbar-h)` to `min-height: var(--viewbar-h)`. Style `.view-title-block` as the flexing column (`min-width: 0`) and `.view-sub` like `.row-sub` (13px, `var(--text-dim)`, one-line ellipsis).
6. In `frontend/src/components/library/LibraryView.vue`, pass `subtitle` into `LibraryChrome` from `headerAlbum` via `formatAlbumMeta` without artist. Only album detail sets `headerAlbum`; list titles stay subtitle-less.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test -- frontend/tests/util.test.ts frontend/tests/models/album.test.ts
```

At implementation time, open an album from Artists (tree and list/grid), from Albums tree, and from Search. Confirm the strings in [design.md](context/design.md). Check the album page subtitle at desktop (`min-width: 900px`) and a mobile width. Confirm a downloads album page still loads.

## Acceptance

- Artists-tree album row under The Velvet Underground shows `1996 · N tracks · m:ss` (year and count from that album; length omitted if `duration` is null).
- Albums-tree row for the same album shows `The Velvet Underground · 1996 · N tracks · m:ss`.
- Albums grid card and list/search row use the Albums-tree recipe.
- Album page (non-tree) shows title plus muted `1996 · N tracks · m:ss` that does not clip the view-bar actions.
- `pnpm --dir frontend typecheck` passes.
