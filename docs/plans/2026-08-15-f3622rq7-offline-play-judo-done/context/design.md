> **Archive.** Decisions in this file were current as of 2026-08-15 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Offline play judo

## Goal

Fix the plan 027 quality findings without changing offline-play behavior: publish reachability as a snapshot, walk the queue on a playlist cursor copy, and split chrome/session out of `player.js` so skip and Media Session are not stuffed into the load/transport file.

## Settled decisions

- **Behavior frozen:** 027 rules stay (named `canUseRemoteMedia`, codecs `no-store`, gray/skip only when downloads on, tap still `playIndex`, no auto-skip current, playHtml local-fail uses the helper).
- **Connectivity snapshot:** notify when `state` **or** `confirmed` changes. Vue store mirrors `state`, `confirmed`, and `canUseRemote`. `PlaylistView` reads `connectivity.canUseRemote` only — no `void` deps, no platform `canUseRemoteMedia` in the row renderer. `reportSuccess` does not fake `(online, online)`.
- **Walker:** file-local `stepNext(cursor)` / `stepPrev(cursor)` mutate a cursor record `{ tracks, index, shuffle, shuffleOrder, shufflePos, repeat }`. They are the **only** wrap/rebuild/advance implementation. `pl.nextIndex()` is `stepNext(this)`. `prevIndex(0)`-walk is `stepPrev(this)`; the `currentTime > 3` restart object stays in `prevIndex` / `playPrev`, not in `stepPrev`. `advanceToPlayable(dir, isPlayable)` clones that record (copy `shuffleOrder`), loops `step*`, commits `{ index, shufflePos, shuffleOrder }` on a playable landing or writes nothing on miss. `computeNextIndex` stays the pure peek. `isPlayable` is a callback. Do **not** reimplement next/prev rules inside `advanceToPlayable`.
- **`playPrev` restart** (`currentTime > 3`) stays in the player, before the walker.
- **player.js split:** extract reactive `player` + play-source writers to `playerState.js`; Media Session metadata + covers to `playerSession.js`; expanded/volume **storage** to `playerPrefs.js`. `playHtml` / `playExclusive` / `playIndex` stay in `player.js` (018 cycle). `player.js` re-exports **`player` only** (not a barrel of playIndex/setVolume). Internals import `playerState.js`.
- **Sink-touching volume apply** (`activeSink.setVolume`) stays in `player.js`; prefs module owns localStorage read/write only.
- **Living docs last.** This directory is not living documentation.

## Design

027 left three shapes that work and rot.

**Confirm is unpublished.** `reachabilityConfirmed` flips on an already-`online` boot GET; `setState` no-ops; Vue never sees it. The 027 patch fired connectivity listeners with `(online, online)`. Publish a snapshot: one notify function for any change to `{ state, confirmed }`. The Vue store copies `canUseRemoteMedia()` into `connectivity.canUseRemote`. Queue gray tracks that field.

**Skip impersonates the play-head.** Walking `nextIndex` by assigning `pl.index` uses a reactive current-track as a search cursor (highlight flash, restore-two-fields, duplicated prev walk). The cursor owner is `playlist.js`. One `stepNext`/`stepPrev` on a record; live `pl` and the skip clone are the same function. Player stays `playIndex` or stop.

**player.js is the junk drawer.** At 956 lines it now owns load isolation, exclusive, HTML play, skip, covers, Media Session, and prefs. Extract along existing seams that do **not** import back into the load file: state object, session metadata, persist keys. Loaders stay file-local.

## Stage map

1. **Connectivity snapshot** — Vue can trust `canUseRemote` before skip/view keep using platform calls. Independent of the walker.
2. **Playlist walker** — deletes the mutating skip. Depends on 01 only for the skip predicate (`downloads.enabled && !canUseRemoteMedia()`); view already uses the store after 01.
3. **playerState extract** — required so session/prefs modules can import state without cycling through `player.js`.
4. **playerSession + playerPrefs** — depends on 03. Shrinks `player.js` after skip is already gone.
5. **Living docs** — last.

## Out of scope

- Moving `playHtml` / `playExclusive` / `playIndex` out of `player.js`.
- Changing 027 skip/gray/tap/probe product rules.
- Stream-fail → local while confirmed, exclusive HTML fallback, auto-land Downloads, queue `/api/cover` tiles.
- Splitting `loadCodecs` catalog persist vs probe.
- A JS test runner.

## Assumptions

- Frontend verification is manual plus `rg`.
- `playlist.js` does not import `player.js` today; a walker there does not cycle.
- Shuffle wrap under `repeat=all` may rebuild `shuffleOrder`; the snapshot commit includes that order when it changed.
- `player.js` re-exporting `player` is an allowed facade this plan; new internals import `playerState.js`.
