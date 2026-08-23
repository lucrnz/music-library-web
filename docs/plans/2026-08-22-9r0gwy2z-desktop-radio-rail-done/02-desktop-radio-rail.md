# Stage 02: Desktop radio rail

## Status
done

## Description

On desktop, `/radio` is chrome: keep library and playlist mounted, open the radio rail, and replace the URL with `ui.lastLibrary`. `PlayerBar` hosts `RadioNowPlaying` `layout="room"` in the existing expanded rail. Crossing 900px keeps the radio surface. The tab bar still opens radio via `/radio` until stage 03.

## Rationale

The occupant API is useless until the rail actually shows `RadioNowPlaying` and `/radio` stops unmounting the library. This is the no-duplication host: one room component, two wrappers (`RadioView` mobile, `#player.expanded` desktop).

## Invariants

- Desktop never mounts `RadioView` and never `v-if`s away `LibraryView` / `PlaylistView` for `pane === "radio"`.
- Mobile `/radio` still unmounts library and playlist (`v-if`, not CSS hide) and hides `#player`.
- Opening Radio does not Tune in. Compact bar and mini still never both mount.
- `setTabOpen(true)` while the radio surface is showing: desktop `expanded && railFace === "radio"`, or mobile `/radio`. One owner in `App.vue`.
- Playback `become("queue")` / `become("radio")` does not change `railFace`.
- `PlayerBar` does not call `setExpanded(false)` on a radio-preserving breakpoint crossing.
- `player.ts` is not imported from `radio.ts`, `RadioNowPlaying.vue`, or `RadioView.vue`.

## Risks

- `PlayerBar`’s existing `watch(desktopViewport, collapse)` writes `expanded` false and would wipe persist / fight the crossing rule.
- Idle radio (no official track) renders `.radio-now--room`, not `.player-full`. Without rail CSS it will not look like the now-playing panel.
- A brief `/radio` paint before `replace` could mount `RadioView` if the desktop check is wrong on first tick.

## Implementation

### Files

- `frontend/src/components/App.vue`
- `frontend/src/components/player/PlayerBar.vue`
- `frontend/src/components/radio/RadioView.vue`
- `frontend/src/components/radio/RadioNowPlaying.vue`
- `frontend/css/desktop.css`
- `frontend/css/radio.css`

### Steps

1. In `frontend/src/components/App.vue`, `useDesktopViewport()`. Mount `RadioView` only when `pane === "radio"` **and not** desktop. Always mount `LibraryView` + `PlaylistView` on desktop (including during a `/radio` URL). Watch: if desktop and `pane === "radio"`, `openRadioRail()` then `router.replace` to `ui.lastLibrary` (same shape `TabBar` already uses). If the viewport becomes desktop while on `/radio`, same rewrite. If the viewport becomes mobile while `expanded && railFace === "radio"`, `router.push({ name: "radio" })` and do not `setExpanded(false)`. Drive `setTabOpen` from one watch: `true` when (desktop && expanded && railFace is radio) or (mobile && pane is radio). Remove `setTabOpen` from `RadioView`.
2. In `frontend/src/components/radio/RadioView.vue`, delete the `setTabOpen` mount/unmount pair. Keep the header + `RadioNowPlaying` room. On unmount, if `!isDesktopViewport()`, `setExpanded(false)` so leaving mobile `/radio` for Library does not leave a persisted radio rail that would reopen on the next grow.
3. In `frontend/src/components/player/PlayerBar.vue`, stop hiding `#player` on desktop just because `pane === "radio"`. `#player` is visible when the radio rail is open (`expanded && railFace === "radio"`) even if the queue is empty and radio chrome is inactive. Queue expand calls `openQueueRail` (not bare `setExpanded(true)`). When desktop && expanded && `railFace === "radio"`, mount `RadioNowPlaying` `layout="room"` (chrome need not be active). Compact `RadioNowPlaying` `layout="bar"` only when desktop && radio chrome && **not** that rail. `NowPlayingFull` only when `railFace !== "radio"` (or radio chrome is off) as today. Change the breakpoint `watch` so a radio-preserving crossing does not `collapse()`. Escape / close still `setExpanded(false)`.
4. In `frontend/src/components/radio/RadioNowPlaying.vue`, on `cover-or-meta-open` / `openRadio`: if desktop, `openRadioRail()`; else `router.push({ name: "radio" })`. For `layout="room"` on desktop, pass `show-close` and emit `collapse` → `setExpanded(false)`. Mobile room stays non-closable.
5. In `frontend/css/desktop.css` and `frontend/css/radio.css`, make `#player.expanded` `.radio-now--room` (idle/waiting) occupy the same right rail as `#player.expanded .player-full`. Do not invent a second panel width; use `--np-panel-w`. Room `NowPlayingView` inside `#player.expanded` should inherit the existing rail rules.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test -- frontend/tests/stores/playerPrefs.test.ts frontend/tests/stores/radio.test.ts
```

On a running app, desktop (≥900px): visit `/radio` — library and playlist stay, URL becomes the last library route, radio room is the right rail, Tune in still required. Compact radio cover opens that rail. Expand a queue track — rail swaps to queue now-playing; radio compact bar stays if still tuned. Play a library track while the radio rail is open — rail stays radio. Shrink below 900px with the radio rail open — land on `/radio`. Grow that page — rail + library return. Mobile `/radio` still replaces both panes. Radio tab still works (pushes `/radio`, which this stage turns into the rail).

## Acceptance

- Desktop `/radio` does not unmount `LibraryView`. Mobile `/radio` still does.
- Desktop radio room is `RadioNowPlaying` inside `#player.expanded`, not a second component tree.
- `#player` is visible for an empty-queue radio rail.
- `RadioView.vue` no longer calls `setTabOpen`.
- Breakpoint crossings in Verify keep the radio surface.
- `pnpm --dir frontend typecheck` passes.
