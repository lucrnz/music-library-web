# Stage 06: Browse husks

## Status
done

## Description

Delete the leftover browse/playlist symbols the nuclear review listed: dual tree `TrackRow`, dead album-download helper, loc-switch `addAll`, snake saved-playlist count, hand-built downloads list DTOs, unused connectivity `getState`.

## Rationale

These are independent leftover hosts. Doing them after player/radio/queue means `PlaylistView` only gains the saved-playlist mapper here.

## Invariants

- `LibraryView` and `LibraryTreePane` stay two SFCs. BrowseSource booleans stay.
- Online tree track rows keep today’s title mode (`label` vs downloads `title`) except where one `:show-download` binding already distinguishes them.
- Saved playlist HTTP remains `track_count`. Leaves use `trackCount`.
- `fetchSavedPlaylists` still hits `GET /api/playlists`.

## Risks

- `albumFromDl` does not include `lossyKind`. Album-grid rows must keep `kindForTracks` (spread `albumFromDl` + `lossyKind`).
- Folding `addAll(loc)` must preserve today’s folders / album / artist dispatch and the tree-root `addAllForFolder("")` path already on `onlineBrowse.addAll`.

## Implementation

### Files

- `frontend/src/components/tree/LibraryTreePane.vue`
- `frontend/src/components/library/libraryActions.ts`
- `frontend/src/components/library/sources/onlineBrowse.ts`
- `frontend/src/stores/playlist.ts`
- `frontend/src/components/playlist/PlaylistView.vue`
- `frontend/src/downloads/browse.ts`
- `frontend/src/downloads/snapshot.ts`
- `frontend/src/stores/connectivity.ts`
- `frontend/tests/library/browseSource.test.ts`
- `frontend/tests/stores/playlist.test.ts`

### Steps

1. In `frontend/src/components/tree/LibraryTreePane.vue`, collapse the two `TrackRow` branches into one with `:show-download="showTrackDownload"` and `title-mode="title"` only when download is shown (today’s downloads tree). Online tree keeps the default title mode.
2. Delete `downloadCurrentAlbum` from `frontend/src/components/library/libraryActions.ts`.
3. Fold `addAll(loc)` into `onlineBrowse.addAll` using `folderAddAll` / `albumAddAll` / `artistAddAll`. Delete the loc-switch helper if nothing else calls it. Keep `addSelected`. Update `frontend/tests/library/browseSource.test.ts` if it imports `addAll` from `libraryActions`.
4. Add `trackCount` on `SavedPlaylist` in `frontend/src/stores/playlist.ts`. Map `track_count` → `trackCount` inside `fetchSavedPlaylists`. Delete the local `SavedPlaylist` interface and `as SavedPlaylist[]` in `frontend/src/components/playlist/PlaylistView.vue`. Template uses `sp.trackCount`. Update `frontend/tests/stores/playlist.test.ts` if it covers saved lists.
5. In `frontend/src/downloads/browse.ts`, use `artistFromDl` for artist list + header artist, and `albumFromDl` (plus `lossyKind: kindForTracks(...)` on album-grid rows) for header album / album grid. Import from `frontend/src/downloads/snapshot.ts`.
6. Delete `getState` from `frontend/src/stores/connectivity.ts`.

### Verify

- `pnpm --dir frontend test -- frontend/tests/library/browseSource.test.ts frontend/tests/library/entityActions.test.ts frontend/tests/stores/playlist.test.ts frontend/tests/tree/downloadsMenuMap.test.ts`
- `pnpm --dir frontend typecheck`
- `rg -n "downloadCurrentAlbum|export function addAll\\(|getState\\(|track_count" frontend/src/components/library frontend/src/stores/playlist.ts frontend/src/stores/connectivity.ts frontend/src/components/playlist/PlaylistView.vue` is empty except HTTP mapping inside `fetchSavedPlaylists`
- `rg -n "v-if=\"node.kind === 'track'\"" frontend/src/components/tree/LibraryTreePane.vue` is one `TrackRow`

## Acceptance

- One tree `TrackRow`. No `downloadCurrentAlbum`. No `libraryActions.addAll(loc)`.
- Queue pane saved rows show `trackCount` from a mapped `SavedPlaylist`. No local snake type.
- Downloads list browse reuses `artistFromDl` / `albumFromDl`. `connectivity.getState` is gone.
