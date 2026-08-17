# Stage 01: Restore mobile pane switch

## Status
done

## Description

Make `LibraryView` a single root so `App.vue`’s `:class="{ hidden: onQueue }"` lands on `#view-library`. On a viewport below 900px, `/folders` (and the other library modes) show only the library pane; `/queue` shows only the queue. Desktop still shows both via `.view.hidden { display: flex !important }`.

## Rationale

Without this, the library pane never hides, `main` splits 50/50, and every later mobile check of the mode bar or queue header is against a crushed column. See [context/design.md](context/design.md).

## Invariants

- Both panes stay mounted. Do not `v-if` `LibraryView`, `DownloadsLibraryView`, or `PlaylistView`.
- `.hidden` must be on the element that also has `.view` (`#view-library` / `#view-playlist`). Do not put it on a wrapper that desktop CSS will not force visible.
- `ActionMenu` / `ActionCard` / `AnchoredMenu` stay the only overlay. Menu still `Teleport`s; close-on-route is unchanged.
- `App.vue` keeps the same `:class="{ hidden: … }"` bindings.

## Risks

- A leftover fragment (`ActionMenu` still a sibling of `LibraryChrome`) silently drops `class` again. Vue 3 warns in dev; treat that warning as a fail.
- Putting `ActionMenu` inside a `display: none` section does not affect an already-open `ActionCard` (it teleports to `body`). Existing `watch` on `route.fullPath` / layout must still close it when switching to `/queue`.

## Implementation

### Files

- Change: `frontend/src/components/library/LibraryChrome.vue` (named `overlay` slot at the end of `#view-library`)
- Change: `frontend/src/components/library/LibraryView.vue` (single root: `ActionMenu` moves into `#overlay`)
- Do not change: `frontend/src/components/App.vue` bindings, `frontend/css/desktop.css` `.view.hidden` rule, `PlaylistView.vue` (already single-root)

### Steps

1. In `LibraryChrome`, add `<slot name="overlay" />` as the last child of `<section id="view-library" class="view">` — after the default slot, still inside the section.
2. In `LibraryView`, delete the sibling `<ActionMenu>` and render it as `<template #overlay><ActionMenu … /></template>` on `LibraryChrome`. Props/events stay the same. The SFC template must have exactly one root.
3. Do not add `inheritAttrs: false` or a wrapper `div`. Fallthrough from `App.vue` goes onto `LibraryChrome`’s single root, which is `#view-library`.
4. `DownloadsLibraryView` is already a single `LibraryChrome` root — leave it. Confirm it does not grow a second root in this stage.

### Verify

```sh
pnpm --dir frontend typecheck
```

In a browser (or device) below 900px:

1. Open `/artists` (or `/folders`). Only the library pane is visible. Bottom tab **Library** is active. Queue header (Download / Save / “Saved playlists appear here”) is not on screen.
2. Tap **Playlist**. URL is `/queue`. Only the queue pane is visible. Library tree / mode chips are not on screen.
3. Tap **Library**. The previous library route (title, mode, scroll) is still there (`ui.lastLibrary`).
4. Resize to ≥900px: both panes visible, `#tab-bar` hidden, `/queue` still shows the last library in the left pane.
5. On `/artists` in list layout, open an artist `⋯` menu, then switch to Playlist: the action card closes (route watch). No Vue runtime warning about fallthrough `class` on a fragment.

## Acceptance

- [ ] `LibraryView.vue` template has a single root (`LibraryChrome`).
- [ ] Below 900px, `/queue` does not show `#view-library`; a library route does not show `#view-playlist`.
- [ ] At ≥900px both panes remain visible (`#view-library.hidden` is still `display: flex`).
- [ ] Artist `ActionMenu` still opens from list `⋯` and still teleports; switching tabs closes it.
- [ ] `pnpm --dir frontend typecheck` is clean.
