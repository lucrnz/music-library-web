# Stage 02: Tidy sheet chrome

## Status
done

## Description

After the footer is gone, clean Playback details mobile sheet CSS so spacing and title chrome match the new header layout and the sheet does not feel bottom-heavy.

In `player.css` (rules under `np-playback-details-*`):

- Remove obsolete `.np-playback-details-sheet .dialog-actions` rules.
- Drop or replace `.np-playback-details-sheet .dialog-title` overrides if the title now uses `modal-title` inside `modal-head` (prefer shared `modal-head` / `modal-title` from `modal.css` unless a local tweak is needed for the centered card).
- Rebalance sheet padding (including safe-area bottom) now that there is no footer action row — keep content comfortable without a large empty band under the details list.
- Keep centered-card layout (`align-items: center`, width/max-height) as-is unless a small padding tweak is required for the new head.

## Rationale

Stage 01 changes structure; leftover dialog-title / dialog-actions CSS and footer-oriented padding would leave visual debt. Tidying is scoped polish only — not a now-playing redesign.

## Implementation

- Edit `src/musicweb/static/css/player.css` section marked “Mobile Playback details info modal”.
- Prefer reusing global `.modal-head` / `.modal-title` / `.icon-btn` metrics; only add `np-playback-details-*` overrides when the centered card needs them (e.g. head horizontal padding vs sheet body).
- Verify mobile (and optionally narrow desktop) in browser: title + X alignment, hit target, list spacing, no footer gap, no regressions on desktop status popover.
- No JS changes in this stage unless a class rename was deferred from stage 01 and must land with the CSS.
