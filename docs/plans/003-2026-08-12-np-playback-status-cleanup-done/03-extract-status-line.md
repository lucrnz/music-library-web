# Stage 03: Extract PlaybackStatusLine (single open state)

## Status
done

## Description

Move the expanded now-playing delivery status line and Playback details chrome out of `NowPlayingFull` into a dedicated component. Collapse dual `detailsModalOpen` / `detailsPopoverOpen` into one `detailsOpen` with presentation mode (mobile modal vs desktop popover). Scope document listeners to open (or expanded) only; fix modal host stacking and ARIA role.

## Rationale

`NowPlayingFull` nearly doubled absorbing a second interaction system (hover/focus/outside/Escape/modal lock). The player shell should stay transport + layout; status + details is its own control. A single open flag deletes cross-mode close branches. Scoped listeners and shell/body hosting match how other modals avoid player transform stacking.

## Implementation

- Add `components/player/PlaybackStatusLine.js` (name flexible) that owns:
  - primary face from `playbackStatus.js` + `settings.options`
  - `detailsOpen` boolean; mode = desktop popover vs mobile info modal (`matchMedia` 900px, same breakpoint as player)
  - hover / focus / click / outside / Escape behavior (coarse pointer toggles; fine pointer hover-open without click-close fight)
  - `PlaybackDetailsBody` for shared rows
- `NowPlayingFull`: when `player.expanded`, render `<PlaybackStatusLine />` above extras; remove all details state, document listeners, and modal/popover markup from the full player.
- Document listeners: attach only while details are open (or while expanded and interactive)—not for the entire lifetime of the always-mounted player shell.
- Mobile modal: Teleport to `body` (or mount at app shell) so it is not trapped under `#player.expanded` transform/z-index; keep modal lock + Escape + backdrop + Close, AppDialog *pattern* without overloading confirm/prompt.
- Desktop panel: stop using `role="tooltip"` for multi-line clickable content; use something appropriate (`dialog` or labelled region) with `aria-expanded` on the status control.
- CSS: move status/popover/details rules with the component ownership (still in `player.css` is fine if selectors stay clear).
- Smoke: expanded NP stream/download/unavailable/empty; mobile modal; desktop hover + touch toggle; collapse NP closes details; no capture listeners when collapsed and closed.
