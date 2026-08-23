**Archive.** Decisions in this file were current as of 2026-08-22 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Desktop radio in the now-playing rail

## Goal

On desktop, household radio uses the existing now-playing right rail instead of replacing the library, and the mobile-style Library | Playlist | Radio tab bar goes away. One `RadioNowPlaying` tree; no second radio room.

## Settled decisions

- Desktop only (`min-width: 900px`). Mobile keeps the tab bar, mini-player / sheet, and full-pane `/radio`.
- One right rail, swapped contents: radio room and queue now-playing are mutually exclusive occupants of the existing expanded `#player` panel. Library and playlist stay mounted.
- Compact bottom bar stays as today (queue compact `NowPlayingView` vs radio compact `RadioNowPlaying`). Playback session does not change the rail occupant. Radio toggle vs now-playing expand/cover chooses the occupant.
- Hide the entire `#tab-bar` at the desktop breakpoint. Do not add a ModeBar Radio chip or a new desktop nav.
- Desktop Radio control is an icon on the Queue view-bar. It toggles the radio rail. Compact radio cover/title also opens the radio rail.
- Desktop `/radio` is chrome, not a pane: open the radio rail and `replace` to `ui.lastLibrary` so refresh/share still shows the dual pane. Mobile `/radio` stays a full page.
- Toggle + persist: click Radio to open, click again to collapse. X/Esc also collapse. Remember rail occupant and open/closed across reload.
- Crossing 900px keeps the radio surface: mobile `/radio` → desktop opens the rail and restores the last library URL; desktop radio rail → mobile goes to `/radio`.
- Reuse `RadioNowPlaying` (`layout="room"` in the rail, `layout="bar"` on the compact desktop bar). Do not duplicate the room. `RadioView` stays the mobile `/radio` wrapper.

## Design

Today `/radio` is a third pane. `App.vue` unmounts library and playlist; `#player` is hidden; `RadioView` is the only now-playing surface. Desktop still shows the tab bar even though both library and playlist are already visible.

Desktop radio becomes the same chrome as expanded now-playing:

```text
desktop ≥900px
  main: LibraryView + PlaylistView (always)
  #player compact: queue bar | radio bar (if chrome active)
  #player.expanded right rail: NowPlayingFull | RadioNowPlaying room
  #tab-bar: hidden

mobile
  unchanged (tabs + /radio pane + RadioMini)
```

**Occupant.** `player.expanded` still means the rail/sheet is open. A new `player.railFace` (`"queue"` | `"radio"`) chooses contents. `playerPrefs` persists both (`musicweb.nowPlayingExpanded.v1` plus a rail-face key). Hydrate restores a radio rail even when the queue is empty; queue face still requires `pl.length > 0`.

**Open / close.** `openRadioRail` / `toggleRadioRail` / `openQueueRail` live next to `setExpanded` in `playerPrefs`. Queue expand (cover, mini, compact meta) calls `openQueueRail`. The Queue Radio icon calls `toggleRadioRail`. Compact radio cover on desktop calls `openRadioRail` (not `router.push({ name: "radio" })`). Collapse is `setExpanded(false)` and keeps the last face for persist.

**`/radio` and `tabOpen`.** On desktop, never mount `RadioView` and never unmount library for `pane === "radio"`. A desktop visit to `/radio` opens the radio rail and replaces the history entry with `ui.lastLibrary` (already ignores non-library panes). `setTabOpen` is the desktop-rail or mobile-`/radio` equivalent of “radio surface showing”; one owner in `App.vue` so `RadioView` is not a second socket latch. Socket rules stay: connect on surface enter; stay up while `tabOpen` or chrome `stopped` | `tuning` | `tuned`.

**Breakpoint.** `PlayerBar` must not blindly `setExpanded(false)` on every viewport change — that write would wipe persist and fight “keep the radio surface.” `App.vue` owns the radio crossings. Mobile `RadioView` unmount (left `/radio` while still mobile) may clear expanded persist so a later grow from Library does not reopen the rail.

**No second tree.** Desktop rail mounts the existing `RadioNowPlaying` room inside `#player.expanded` so `#player.expanded .player-full` already is the rail. Idle/waiting `.radio-now--room` (no official track yet) must fill that same rail. `show-close` is on for the desktop room. Opening Radio still does not auto Tune in.

## Stage map

1. **Rail occupant state** — persist and writers first so shell and the Queue icon have one API. No Vue chrome.
2. **Desktop radio rail** — URL, unmount rules, `PlayerBar` host, breakpoint, `tabOpen`. After this, `/radio` and the still-visible Radio tab already open the rail; library stays. Depends on the occupant API.
3. **Queue opener + hide tabs** — move the Radio control to the Queue header and hide `#tab-bar` on desktop. Depends on the rail actually existing.
4. **Living docs** — rewrite conventions, radio client, and product-shape sentences against what 01–03 shipped. `design.md` is not living documentation.

## Out of scope

- Mobile tab bar, mobile `/radio` pane, or `RadioMini` redesign
- An always-on third column or stacked radio + queue now-playing
- A ModeBar Radio chip or a new desktop left-nav
- Exclusive-mode radio
- A second radio room component or a parallel now-playing tree
- Changing Tune-in, socket, or station-clock behavior beyond what `tabOpen` already means

## Assumptions

- Frontend tests do not cover Vue chrome (`docs/development/testing.md`). Occupant persist is proven in `playerPrefs` tests; rail/URL/breakpoint are verified on a running app.
- `rememberLibraryRoute` already skips `pane !== "library"`, so `/radio` does not clobber `ui.lastLibrary`.
- Desktop breakpoint stays `DESKTOP_MEDIA` / `min-width: 900px`.
- No ADR. Living docs: `docs/frontend/conventions.md`, `docs/systems/radio.md`, `docs/product/core-guidelines.md`, `docs/systems/playback.md`.
