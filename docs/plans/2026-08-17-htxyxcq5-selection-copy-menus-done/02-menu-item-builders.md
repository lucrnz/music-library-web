# Stage 02: Menu item builders and lyrics flatten

## Status
done

## Description

Add the copy-item helpers, flatten synced lyrics, export a memory peek, lift catalog add-all out of the tree pane, and update/create every entity menu builder so later stages only attach `⋯` chrome and pass injected `run`s. Queue and existing artist menus start offering copy as soon as this stage lands.

## Rationale

Item order, empty-value omission, photo gating, and lyrics flatten are the product rules. They belong in pure functions with tests, not in Vue click handlers.

## Invariants

- Builders return `ActionItem[]` from `actionItem.ts`. Copy items have **no** icon.
- Empty / whitespace values omit the copy item. Do not emit a disabled row.
- Photo items stay behind `includePhoto`. Search and downloads pass `false`.
- Mutating actions (`addAll`, optional `downloadAll`, `addToPlaylist`) are **arguments**. Builders do not import `addAllForArtist` / `addAllForAlbum` / `addAllForFolder` / `downloadAlbumById` / `queueOnly`.
- Queue still uses `slotMatches` inside `run()` for every item, including copy. Queue go-to / download / remove stay as they are (not injected).
- Now-playing builder takes `offerCopyLyrics: boolean` and `copyLyrics: () => Promise<void>`. It does not import `resolveLyrics`. No stub `run`.
- `parseLrc` stays the LRC parser. Flatten does not reimplement timestamp regexes.
- `peekLyricsMemory` is sync and reads only the in-memory map. It does not hit IDB or the network.
- No Vue mount tests.

## Risks

- Artist menu tests today assert an exact `id` list. They must be updated to include `copy-artist` or they will fail for the right reason.
- Consecutive-duplicate collapse can hide a real repeated line if the LRC file stamps the same lyric twice in a row for emphasis. That is accepted.
- `buildArtistMenuItems` is already called from `LibraryView` and `LibraryTreePane`. Those call sites must pass `addAll` / `downloadAll` in this stage or typecheck fails before stage 03.

## Implementation

### Files

- Create: `frontend/src/lyrics/plainText.ts` (`syncedLrcToPlainText`, `lyricsClipboardText`)
- Create: `frontend/tests/lyrics/plainText.test.ts`
- Change: `frontend/src/lyrics/cache.ts` (export `peekLyricsMemory`)
- Create: `frontend/src/downloads/addAll.ts` (`addAllDownloadedArtist`, `addAllDownloadedAlbum`)
- Create: `frontend/tests/downloads/addAll.test.ts` (hierarchy walk → track lists; no fetch)
- Create: `frontend/src/components/menu/copyItems.ts` (`copyAction` → `copyText`)
- Change: `frontend/src/components/library/artistMenuItems.ts` (`includePhoto`, injected `addAll` / optional `downloadAll`, Copy artist name; export `runArtistDownloadAll` as the online confirm+enqueue helper hosts pass)
- Change: `frontend/src/components/library/LibraryView.vue` and `frontend/src/components/tree/LibraryTreePane.vue` — pass `includePhoto: true` (today’s artist surfaces) plus `addAll` / `downloadAll` so typecheck passes. Do not add new `⋯` chrome here.
- Change: `frontend/tests/library/artistMenuItems.test.ts`
- Change: `frontend/src/components/playlist/queueMenuItems.ts` (copy group after go-to, before download)
- Create: `frontend/src/components/library/albumMenuItems.ts`
- Create: `frontend/src/components/library/trackMenuItems.ts`
- Create: `frontend/src/components/library/folderMenuItems.ts`
- Create: `frontend/src/components/player/nowPlayingMenuItems.ts`
- Create: `frontend/tests/library/entityMenuItems.test.ts`
- Create: `frontend/tests/playlist/queueMenuItems.test.ts`

### Steps

1. `syncedLrcToPlainText(lrc)`: `parseLrc` → skip `!text.trim()` and text `♪` → skip if text equals the last kept line → `join("\n")`.
2. `lyricsClipboardText(payload)`: return `null` for instrumental, `error`, `not_found`, `skipped`, `pending`. If `syncedLrc` flattens to a non-empty string, return that. Else return trimmed `plainText` or `null`.
3. `copyAction({ id, label, value })` returns `null` when `value` is null/undefined/whitespace; else an item whose `run` calls `copyText(trimmed)`.
4. `peekLyricsMemory(trackId)` returns the in-memory `Lyrics` or `undefined`. Do not read IDB. Do not treat a miss as `not_found`.
5. `addAllDownloadedAlbum(albumId)` is the pane’s current `dl-album` walk (`tracksFromCatalogRecords` + `addToQueue`). `addAllDownloadedArtist(artistId)` flattens every catalog album for that artist the same way. No `/api`.
6. Artist builder args: `{ artist, includePhoto, addAll, downloadAll? }`. Insert Copy artist name after download-all (or after add-all when `downloadAll` is omitted), before photo items. Export `runArtistDownloadAll(artist)` that keeps today’s confirm/outcome/`downloadTracks` so the **online** host can pass it as `downloadAll`. Downloads hosts omit `downloadAll`.
7. Queue builder: after go-to items, add copy title / artist / album. Each `run` still bails if `!slotMatches`.
8. Album builder args: `{ album, addAll, download? }` then Copy album name, Copy artist name.
9. Track / file builder args: `{ title, artist, album, addToPlaylist }` then the three copy items. Title is `track.title` or file `displayName` / `name`.
10. Folder builder args: `{ dir, addAll }` then Copy folder name, Copy full path.
11. Now-playing builder args: `{ track, offerCopyLyrics, copyLyrics }`. Copy title / artist / album; Copy lyrics iff `offerCopyLyrics`; then Go to album / Go to artist (`router.push`, same as queue). `copy-lyrics.run` is `copyLyrics`. No `lyricsOffer` union. No stub.
12. Tests: flatten fixtures; `lyricsClipboardText` hide statuses; peek miss vs instrumental; builder id-order including omitted empty copies, `includePhoto: false`, omitted `downloadAll`; catalog addAll does not call fetch.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

Manually: existing artist `⋯` and queue `⋯` show the new copy items; Copy artist name / Copy title toast “Copied”; search is unchanged until stage 03 (still no `⋯` on search rows).

## Acceptance

- [ ] Flatten, `lyricsClipboardText`, and `peekLyricsMemory` match [design.md](context/design.md). Peek does not use `resolveLyrics({ allowNetwork: false })`.
- [ ] Every builder exists, takes injected mutating `run`s, omits empty copies, and is unit-tested. No builder imports online fetch helpers.
- [ ] `addAllDownloadedArtist` / `addAllDownloadedAlbum` exist and do not hit `/api`.
- [ ] Existing artist `⋯` still works after callers pass `addAll` / `downloadAll`. Queue copy items sit between navigation and download; `slotMatches` still guards `run()`.
- [ ] Now-playing builder is complete: `offerCopyLyrics` + `copyLyrics`, no stub.
