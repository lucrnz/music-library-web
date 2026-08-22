**Archive.** Decisions in this file were current as of 2026-08-22 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Play all (replace playlist)

## Goal

Let a listener hop album to album (or artist/folder) in one tap: a **Play all** item next to every **Add all to playlist** menu action replaces the session playlist with that entity’s playable tracks and starts the first one.

## Settled decisions

- Label is **Play all**. Icon is the existing `play` sprite (`#i-play`).
- It sits immediately under **Add all to playlist** in `buildAlbumMenuItems`, `buildArtistMenuItems`, and `buildFolderMenuItems`. Those builders already feed list, grid, tree, desktop right-click, and artist/album page headers (online and Downloads).
- Semantics: collect the same playable set as Add all, **replace** the session playlist, **start the first track**. No confirm.
- Shuffle, if already on, stays on. Playback starts at index 0 (album/folder order). Shuffle only decides what comes after.
- Play all always starts that first track at 0. Clear the resume slot before `playIndex(0)` so a cold player does not seek into a leftover position for the same id.
- Empty or all-unplayable collect is a no-op: do not clear the current playlist, do not stop playback, do not toast.
- Page-level **Add all** pill stays append-only. Track / file **Add to playlist** does not get a replace twin.
- `playIndex` already calls `become("queue")`, so Play all leaves Radio the same way a library track tap does.
- Forget only ids that actually leave the queue (`idsLeavingQueue`). Overlapping ids keep their prepare keys. Prepare the new set with `replace: true`.

## Design

Add all already has one collect-then-`addToQueue` path per host (online `libraryActions.ts`, Downloads `downloads/addAll.ts`) injected through `BrowseSource` into the three menu builders. Play all is the same collect with a different sink.

```text
⋯ / right-click
  build*MenuItems  playAll run
        │
        ▼
entityActionsFor → BrowseSource.artistPlayAll / albumPlayAll / folderPlayAll?
        │
        ├─ onlineBrowse  → playAllForAlbum|Artist|Folder
        └─ downloadsBrowse → playAllDownloadedAlbum|Artist
                │
                ▼
        player.playAllTracks(entries)
                │
                ├─ clearPlaybackPosition()
                └─ playlist.replaceQueue(entries)
                        │  no playable → false, no mutation
                        │  else swap tracks, forget leavers,
                        │  prepare(replace: true), commit
                └─ playIndex(0)
```

`replaceQueue` lives in `playlist.ts` next to `addToQueue` and shares its entry resolution (full `Track`, bare id, `{ id }`). It must not import `player.ts`. `playAllTracks` lives in `player.ts` next to `playIndex` so session handoff and resume stay in one module.

`pl.add` already rebuilds shuffle after the swap. `playIndex(0)` then sets `shufflePos` to whatever slot holds index 0.

## Stage map

1. **Replace-and-play primitive** — collect hosts and menus cannot ship until queue swap, forget, prepare, and “start at 0” exist and are tested without UI.
2. **Menus and hosts** — depends on that primitive. One stage wires every current Add-all surface so mobile `⋯` and desktop right-click cannot drift.
3. **Living docs** — written last against the menu ids, forget rule, and start-at-0 behavior stages 01–02 actually ship.

## Out of scope

- A page-level Play all pill
- A replace twin on single-track or folder-file menus
- Confirm dialogs
- Changing **Add all to playlist** copy or order
- Renaming playlist vs queue in the rest of the UI
- Saved-playlist load behavior (still does not forget; still does not auto-play)

## Assumptions

- Folder Play all exists only where `folderAddAll` already exists (online folders). Downloads has no folder collect.
- Artist and folder Play all may enqueue a large set; that cost already exists for Add all.
- Missing tracks (`isMissing`) stay filtered out, same as `addToQueue`.
- No new sprite or action-menu chrome is required.
