# Stage 02: Now-playing dismiss always X

## Status
done

## Description

Expanded now-playing’s collapse/close control should always show **X**, not chevron-down on mobile.

Today:

- `PlayerBar.js` computes `closeIcon` as `close` on desktop (`min-width: 900px`) and `chevron-down` on mobile.
- `NowPlayingFull.js` defaults `closeIcon` to `chevron-down`.

Change both so the control is always `close`. Do not change collapse behavior (swipe-down sheet drag, backdrop, focus restore, etc.) — only the glyph.

Out of scope: non-dismiss chevrons (library tree expand, quality dropdown).

## Rationale

Same product rule as stage 01: X works for dismiss on mobile and desktop; V is sheet-only metaphor and inconsistent with modal dismiss after stage 01.

## Implementation

- `src/musicweb/static/js/components/player/PlayerBar.js`: stop branching on `desktopViewport` for the icon — always pass `"close"` (simplify or remove the `closeIcon` computed if it becomes a constant).
- `src/musicweb/static/js/components/player/NowPlayingFull.js`: change prop default `closeIcon` from `"chevron-down"` to `"close"`. Keep the prop if parents still pass it; otherwise a constant default is enough.
- Grep for `closeIcon` / now-playing `chevron-down` to catch stragglers.
- Manual: expand now-playing on mobile-width and desktop-width — header control is X; collapse still works via click, Escape (if wired), and existing sheet gestures.
