# Stage 03: Queue opener and hide desktop tabs

## Status
done

## Description

Add a desktop-only Radio icon on the Queue view-bar that calls `toggleRadioRail`, and hide `#tab-bar` at `min-width: 900px`.

## Rationale

Stage 02 still leans on the mobile tab bar as the desktop Radio control. Hiding the tabs without this icon would leave radio reachable only by `/radio` or a compact-bar cover (and the cover is absent when chrome is inactive).

## Invariants

- The Queue Radio control is not shown below 900px. Mobile still uses the tab bar.
- The icon is pressed/`aria-pressed` only when the desktop radio rail is open (`expanded && railFace === "radio"`).
- Clicking it does not navigate to `/radio` on desktop.
- Do not add Radio to `ModeBar`.

## Risks

- Queue view-actions are already crowded (Download / Save / Edit). An extra labeled pill would wrap; an `icon-btn` matches Settings in the library header.
- Hiding `#tab-bar` only in CSS leaves `TabBar.vue` mounted (it still records `lastLibrary`). That is intended.

## Implementation

### Files

- `frontend/src/components/playlist/PlaylistView.vue`
- `frontend/css/desktop.css`

### Steps

1. In `frontend/src/components/playlist/PlaylistView.vue`, add a desktop-only (`useDesktopViewport()`, already imported) `icon-btn` at the **start** of `.view-actions` (before Download/Save/Edit). Glyph `#i-radio` via `Icon name="radio"`. `title` / `aria-label` `"Radio"`. `aria-pressed` when `player.expanded && player.railFace === "radio"`. Click calls `toggleRadioRail` from `playerPrefs`. Do not `router.push({ name: "radio" })`.
2. In `frontend/css/desktop.css`, change the `min-width: 900px` `#tab-bar` rule from `display: flex` to `display: none`. Do not hide it in `app.css` (mobile must keep the bar).

### Verify

```sh
pnpm --dir frontend typecheck
```

On a running app, desktop: no Library | Playlist | Radio strip. Queue header Radio icon opens the rail, click again collapses, X/Esc still collapses, reload restores the open radio rail. Empty queue still reaches radio from that icon. Mobile (<900px): tab bar unchanged, no Radio icon on the Queue header. Library / Playlist / `/radio` still switch panes.

## Acceptance

- Desktop has no visible `#tab-bar`.
- Desktop Queue header Radio icon toggles the radio rail and does not change the route to `/radio`.
- Mobile tab bar and mobile Queue header are unchanged.
- `pnpm --dir frontend typecheck` passes.
