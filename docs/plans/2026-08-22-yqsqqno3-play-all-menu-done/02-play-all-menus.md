# Stage 02: Play all on every Add-all menu

## Status
done

## Description

Wire **Play all** through online and Downloads collect hosts into the three entity menu builders so every existing **Add all to playlist** surface gets the twin.

## Rationale

The primitive is unused until every host that can append can also replace-and-play. One stage keeps list, grid, tree, header, and right-click on the same `ActionItem` ids.

## Invariants

- Menu order is `add-all`, then `play-all` (`label: "Play all"`, `icon: "play"`), then today’s download / copy / photo items.
- `playAll` runs are injected the same way as `addAll`. Builders do not import playlist or player.
- Online: `playAllForAlbum` / `playAllForArtist` / `playAllForFolder` collect with the existing fetch helpers, then `playAllTracks`.
- Downloads: `playAllDownloadedAlbum` / `playAllDownloadedArtist` project the same catalog records as the add-all twins, then `playAllTracks`. No `/api` collect.
- `BrowseSource` grows `artistPlayAll`, `albumPlayAll`, and optional `folderPlayAll`. Downloads omits `folderPlayAll` (it already omits `folderAddAll`).
- Page `BrowseSource.addAll` and the **Add all** pill are unchanged.
- `buildTrackMenuItems` is unchanged.

## Risks

- `entityActionsFor` and the three builder tests hard-code item id order. Missing an update looks like a regression even if the run is wired.
- Downloads `addAll.test.ts` mocks only `addToQueue`. Play-all tests must mock `playAllTracks` (or player) so they do not boot the sink.

## Implementation

### Files

- `frontend/src/components/library/libraryActions.ts`
- `frontend/src/downloads/addAll.ts`
- `frontend/src/components/library/browseSource.ts`
- `frontend/src/components/library/sources/onlineBrowse.ts`
- `frontend/src/components/library/sources/downloadsBrowse.ts`
- `frontend/src/components/library/albumMenuItems.ts`
- `frontend/src/components/library/artistMenuItems.ts`
- `frontend/src/components/library/folderMenuItems.ts`
- `frontend/src/components/library/entityActions.ts`
- `frontend/tests/library/entityMenuItems.test.ts`
- `frontend/tests/library/artistMenuItems.test.ts`
- `frontend/tests/library/entityActions.test.ts`
- `frontend/tests/downloads/addAll.test.ts`

### Steps

1. In `frontend/src/components/library/libraryActions.ts`, add `playAllForFolder`, `playAllForArtist`, and `playAllForAlbum` that collect with the same calls as the add-all functions and `await playAllTracks(...)`.
2. In `frontend/src/downloads/addAll.ts`, add `playAllDownloadedAlbum` and `playAllDownloadedArtist` that reuse the catalog walk and call `playAllTracks` with `tracksFromCatalogRecords`. Missing id still returns without calling play.
3. In `frontend/src/components/library/browseSource.ts`, add `artistPlayAll`, `albumPlayAll`, and optional `folderPlayAll` next to the add-all methods.
4. In `frontend/src/components/library/sources/onlineBrowse.ts` and `frontend/src/components/library/sources/downloadsBrowse.ts`, implement those methods by delegating to the new helpers (Downloads: no `folderPlayAll`).
5. In `frontend/src/components/library/albumMenuItems.ts`, `artistMenuItems.ts`, and `folderMenuItems.ts`, take a `playAll` run and insert `{ id: "play-all", label: "Play all", icon: "play", run: () => playAll() }` immediately after the add-all item.
6. In `frontend/src/components/library/entityActions.ts`, pass `playAll` from `source.artistPlayAll` / `albumPlayAll` / `folderPlayAll?.`.
7. Update `frontend/tests/library/entityMenuItems.test.ts`, `artistMenuItems.test.ts`, and `entityActions.test.ts` so every expected id list includes `play-all` directly after `add-all`.
8. In `frontend/tests/downloads/addAll.test.ts`, mock `playAllTracks` and assert album/artist play-all pass the same projected ids as add-all, and a missing album id does not call it.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/library/entityMenuItems.test.ts frontend/tests/library/artistMenuItems.test.ts frontend/tests/library/entityActions.test.ts frontend/tests/downloads/addAll.test.ts frontend/tests/stores/playlist.test.ts
pnpm --dir frontend typecheck
```

In the running app, on both a narrow (mobile card) and a wide (desktop dropdown) viewport:

- Album `⋯` and desktop right-click: **Play all** under **Add all to playlist**. It replaces the current playlist and starts track 1. **Add all to playlist** still appends.
- Repeat for an artist and a folder (online). Downloads: album and artist only.
- Artist and album page-header `⋯` show the same pair.
- Play all on an empty / missing-only album leaves the current playlist and current track alone.
- With Shuffle on, Play all an album starts at track 1; Next is a shuffle pick.
- While Radio is tuned, Play all an album leaves radio and plays that album.
- Track `⋯` still has only **Add to playlist**. The page **Add all** pill still appends.

## Acceptance

- Every builder that emits `add-all` also emits `play-all` as the next item, including online and Downloads hosts and page headers.
- Play all replace-and-plays; Add all still appends; empty collect is a no-op.
- Track menus and the Add all pill are unchanged.
- Typecheck and the listed frontend tests pass.
- Browser checks above pass on mobile and desktop widths.
