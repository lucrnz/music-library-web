# Stage 02: Project downloads to client types

## Status
done

## Description

Downloads list and tree emit `artist` / `album` / `track` with `ArtistListItem` / `LibraryAlbum` / `Track` on `data`. Delete `dl-*` kinds, `asTrack`, and `downloadsMenuMap` projectors. Manager-modal extras live on optional `downloadMeta`.

## Rationale

Stage 01 stopped the host fork; the tree still has a second type world that every new action must map. Projecting at the source makes downloads another loader, not a parallel model.

## Invariants

- IDB catalog records stay camelCase write shape (`trackId`, `trackNum`, …). Do not add `fromApiArtist`. Artists stay snake_case on `ArtistListItem`.
- Cover contract unchanged. No `/api/cover` invention for downloads.
- No downloads snapshot cache in this stage.

## Risks

- `DownloadsModal.vue` and `treeNavigation.ts` key on `dl-artist:` / `artistId`. Changing kinds without updating those two will break manager delete and tree focus.
- `Track` has no `codec` / `bytes`. The modal must read `downloadMeta`, not `data.codec`.

## Implementation

### Files

- `frontend/src/components/tree/sources/artistsSource.ts`
- `frontend/src/components/tree/sources/downloadsSource.ts`
- `frontend/src/components/tree/sources/downloadsMenuMap.ts`
- `frontend/src/components/tree/LibraryTreePane.vue`
- `frontend/src/components/tree/treeNavigation.ts`
- `frontend/src/downloads/browse.ts`
- `frontend/src/components/downloads/DownloadsModal.vue`
- `frontend/tests/tree/downloadsMenuMap.test.ts`
- `frontend/tests/library/entityActions.test.ts`
- `frontend/css/modal.css`

### Steps

1. Extend `TreeNode` in `artistsSource.ts` with optional `downloadMeta?: { codec?: string; bytes?: number | null; status?: string; trackNum?: number | null }`.
2. `loadDownloadsTree` / children: `kind` is `artist` | `album` | `track`; keys are `artist:{id}` / `album:{id}` / `track:{id}`; `data` is `artistFromDl` / `albumFromDl` / `fromCatalogRecord` projected **once** here. Copy codec/bytes/status/trackNum onto `downloadMeta` for leaves.
3. Delete `downloadsMenuMap.ts` after inlining its three functions into `downloadsSource.ts` (or `downloads/browse.ts` if the list header also needs them). Rewrite `downloadsMenuMap.test.ts` against the remaining projector or delete the file if the functions are covered at the tree-source boundary.
4. `LibraryTreePane.vue`: `targetFromNode` uses `artist` / `album` / `track` only. Delete `asTrack`, `dl-*` cases, and `fromCatalogRecord` casts. Play/queue uses `node.data` as `Track`.
5. `treeNavigation.ts`: downloads focus paths use `artist:` / `album:` keys. Delete `dl-artist:` / `dl-album:` prefixes.
6. `downloads/browse.ts` already maps tracks via `fromCatalogRecord` for list pages; keep that. Header artist/album stay `ArtistListItem` / `LibraryAlbum` (already minted). Do not mint a second shape.
7. `DownloadsModal.vue`: delete/group actions key on `node.kind === "artist" | "album" | "track"` and `data.id`. Codec/bytes/status/trackNum come from `downloadMeta`.
8. `entityActions.test.ts` (and any tree fixture) that still names `dl-*` kinds: update to client kinds.

### Verify

- `rg -n "dl-artist|dl-album|dl-track|asTrack|downloadsMenuMap" frontend/src frontend/tests` is empty.
- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test`

## Acceptance

- Downloads tree/list nodes are the same kinds as online (`artist` / `album` / `track`) with client types on `data`.
- `asTrack` and `downloadsMenuMap.ts` are gone.
- Manager modal still deletes artist/album/track and still shows codec/bytes/status.
- Tree focus on a downloads album still expands the parent artist.
- Photo menu still absent on downloads.
