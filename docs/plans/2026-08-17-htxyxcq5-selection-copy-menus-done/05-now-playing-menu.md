# Stage 05: Now-playing menu and copy lyrics

## Status
done

## Description

Add a `⋯` to the expanded now-playing sheet that copies title / artist / album, copies lyrics (plain as-is, synced flattened), and offers Go to album / Go to artist. The lyrics overlay stays without its own menu; the mini-player stays without `⋯`.

## Rationale

Now-playing is the only place that has lyrics in context and is not a queue slot. It needs the stage-02 builder (already complete: `offerCopyLyrics` + `copyLyrics`) and player chrome, not a queue menu with Remove.

## Invariants

- Mini-player has no `⋯`. Lyrics overlay has no `⋯`.
- Synced lines stay `user-select: none` and tap-to-seek. `.lyrics-plain` stays selectable via stage 01.
- Copy lyrics uses `peekLyricsMemory` (visibility) + `resolveLyrics` + `lyricsClipboardText` from stage 02. Overlay does not need to be open.
- Hide Copy lyrics only when `peekLyricsMemory(trackId)` is defined **and** `lyricsClipboardText(peek)` is `null`. No peek → show. Never call `resolveLyrics({ allowNetwork: false })` to decide visibility.
- `run()` always `resolveLyrics(id, { allowNetwork: canReachServer() })`, return if `trackId` changed, then `copyText` or `showToast("No lyrics to copy")`.
- No Remove from queue. No download item on this menu.
- `⋯` is in expanded `.sheet-grab` next to Close. Do not put it on the title line or inside a click-to-expand control.
- Same `ActionMenu` + `useRowActionMenu`. Desktop right-click on the `⋯` only — do not steal cover/meta clicks for contextmenu.
- `NowPlayingFull` closes the menu on collapse and on `trackId` change. Do not edit `PlayerBar.vue`.
- No Vue mount tests.

## Risks

- Fetch-on-click can race a track change. Ignore the result if `trackId` no longer matches.
- First open after a reload has no memory peek even if IDB has instrumental lyrics; the item shows, then `run()` resolves from IDB and toasts. That is accepted (no async peek).

## Implementation

### Files

- Change: `frontend/src/components/player/NowPlayingFull.vue` (`⋯` in `.sheet-grab`, `ActionMenu`, pass `offerCopyLyrics` / `copyLyrics`)
- Do not change: `frontend/src/components/player/PlayerBar.vue`
- Do not change: `frontend/src/components/player/nowPlayingMenuItems.ts` except if a type import is required — the builder is finished in stage 02
- Change: `frontend/css/player.css` (`⋯` in expanded `.sheet-grab`)
- Change: `frontend/tests/lyrics/cache` peek tests if not already in stage 02; extend now-playing builder tests for offer true/false only

### Steps

1. In expanded `.sheet-grab`, next to Close, render `⋯` (`more-vert`, aria-label “Now playing actions”).
2. `offerCopyLyrics`: `const peek = peekLyricsMemory(id); return !(peek && lyricsClipboardText(peek) == null)`.
3. `copyLyrics`: `resolveLyrics` → if `trackId` changed, return → `lyricsClipboardText` → `copyText` or `showToast("No lyrics to copy")`.
4. Pass those into `buildNowPlayingMenuItems`. Go-to is already in the builder.
5. Mount `ActionMenu` on the expanded sheet. Close when `player.expanded` becomes false and when `trackId` changes (watch in `NowPlayingFull`).
6. Tests already cover flatten/offer in stage 02. Here verify: item present when memory is empty; hidden when memory is instrumental; `resolveLyrics({ allowNetwork: false })` is not used for visibility.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

Manually: expand now-playing — `⋯` copies title/artist/album; with unsynced lyrics, overlay text is selectable and Copy lyrics matches it; with synced lyrics, lines are not selectable, Copy lyrics pastes timestamp-free text without `♪` or doubled consecutive lines; instrumental / no lyrics hides or toasts; Go to album/artist navigates; mini-player has no `⋯`; overlay has no extra control.

## Acceptance

- [ ] Expanded now-playing has `⋯` in `.sheet-grab` with the copy-focused item list from [design.md](context/design.md).
- [ ] Copy lyrics works for plain and synced (flattened) without opening the overlay. Present when memory has no payload; hidden when memory is instrumental; toast when resolve returns nothing copyable.
- [ ] Mini-player and lyrics overlay gain no menu chrome. `PlayerBar.vue` is unchanged. Synced tap-to-seek is unchanged.
