# Stage 04: Off-radio mini and desktop compact bar

## Status
done

## Description

When radio chrome is on and the tab is not Radio: mobile shows only `RadioMini` (new glyphs; cover/title go to `/radio`). Desktop shows only the compact `NowPlayingView` bar (filled seek, Tune in/out, volume; cover/title go to `/radio`). Never both.

## Rationale

Stage 03 fixed `/radio`. Off-tab, today’s `RadioMini` + `RadioNowPlaying` bar still stack on mobile and the mini has no navigation. This stage is the remaining chrome.

## Invariants

- `#player` stays hidden on `/radio` (stage 03).
- Mobile off-radio: `RadioMini` only. Desktop off-radio: compact radio bar only (`.player-mini` stays `display: none` at `min-width: 900px`).
- Cover/title navigate to `/radio`. They do not set `player.expanded`.
- Mini Tune control is icon-only (`tune-in` / `tune-out`), `aria-label` / `title` “Tune in” / “Tune out”.
- Compact bar Tune control is the same labeled button as the room.
- Compact bar does not show lyrics or `PlaybackStatusLine` (same as on-demand compact).
- After Tune out, stopped radio chrome stays until a library/queue play.

## Risks

- Mounting `NowPlayingView` in `#player` without `expanded` will pick up `desktop.css` compact grid. That is intended on desktop and must not also run on mobile (mobile must not mount this bar).
- A `router.push` from the mini must not Tune out or tear down the socket.

## Implementation

### Files

- `frontend/src/components/radio/RadioMini.vue`
- `frontend/src/components/radio/RadioNowPlaying.vue` (add compact/bar host, or a sibling `RadioCompact.vue` if the room wrapper should stay room-only)
- `frontend/src/components/player/PlayerBar.vue`
- `frontend/css/radio.css`
- `frontend/css/desktop.css` (only if the compact grid needs a radio transport exception for the single pill)

### Steps

1. `RadioMini`: replace play/pause with `Icon` `tune-out` / `tune-in`. Cover + `.mini-meta` become one control that `router.push`es the radio route. Tune button stays a separate control and does not navigate.
2. `PlayerBar` when `radioOn && !onRadio`:
   - Mobile: `RadioMini` only.
   - Desktop: compact radio `NowPlayingView` only (`showClose=false`, `showStatus=false`, `showLyricsToggle=false`, `seekInteractive=false`, same play-status/volume/tune slot as the room). Cover/meta emit → `/radio`.
   - Use `useDesktopViewport()` / `DESKTOP_MEDIA` from `layout.ts`, not a copied query string.
3. Do not render `RadioMini` and the compact radio view at the same time.
4. Delete leftover `layout="bar"` markup that duplicates title + text Tune out. If `RadioNowPlaying.vue` is room-only after this, delete unused bar CSS (`.radio-now--bar`, wrap grid in `radio.css`).
5. Compact transport: one labeled Tune button in the desktop transport column so it occupies the old five-button slot. Volume stays in extras as on-demand compact already shows.

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test`
- Manual mobile: Tune in on `/radio`, switch to Library — one mini, one title, icon-only Tune out. Tap title → `/radio` and still tuned. Tune out from the mini stays on Library; mini remains (stopped face).
- Manual desktop ≥900px: Library while tuned — compact bar (cover, title, filled seek, Tune out, volume), no mini row. Tap title → `/radio` and `#player` hides. Back to Library → compact bar returns.
- Manual: library/queue play still `exitToQueue()` and restores on-demand `#player`.

## Acceptance

- Radio tab: no `#player`. Other tabs: exactly one radio chrome (mini **or** compact bar).
- Mini never shows the strings “Tune in” / “Tune out” as button text.
- Cover/title on mini and compact bar open `/radio` without expanding a sheet and without Tuning out.
- Desktop compact seek is filled and not draggable; volume is filled and works.
- Stopped radio face remains on the off-radio chrome until a library/queue play.
