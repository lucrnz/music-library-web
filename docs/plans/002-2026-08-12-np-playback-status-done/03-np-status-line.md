# Stage 03: Expanded now-playing status line

## Status
done

## Description

Show the subtle delivery status line on expanded now playing (mobile sheet and desktop rail): icon + source word + codec face text, centered above the extras strip. Wire it to stage-01 state and stage-02 formatters. Deep dive interaction is stubbed or deferred to stage 04—this stage is face + layout only (optional no-op click is fine if it keeps the control structure ready).

## Rationale

This is the user-visible payoff: offline vs streaming awareness and delivery codec at a glance. Placing it only when expanded keeps the mini bar and desktop compact strip clean (grill decision). Landing the line before the details panel lets layout, dim styling, and icon sizing be verified independently of modal/popover behavior.

## Implementation

- **Icons:** add two SVG symbols to `src/musicweb/templates/index.html` (sprite `#i-*` pattern used by `Icon.js`):
  - Downloaded: user-provided device-with-check glyph (paths as supplied in the grill; strip decorative zero-size filler if it breaks `currentColor` fills)
  - Streaming: user-provided cloud glyph
  - Names e.g. `play-source-local` / `play-source-stream` (or shorter `source-downloaded` / `source-stream`)—document chosen names in the component
- **UI:** in `NowPlayingFull.js`, insert a full-width centered row **above** `.player-extras` (volume + lyrics + settings).
  - Visible only when `player.expanded` is true (hide on desktop compact bar).
  - Face:
    - Active: `<Icon>` + `Streaming`/`Downloaded` + middle dot + primary codec text
    - Unavailable: text only `Unavailable` (no icon)
    - Empty: `Not playing` (static; not a button)
  - Styling in `player.css` (and desktop tweaks only if needed): dim monochrome (`var(--text-dim)`), size near `.time` / `.np-artist` (~12px), centered, no pill/chip, no warning color even on Unavailable.
- Bind to `player.playSource` / `playProfileId` / formatters; pass `settings.options` into helpers.
- Accessibility: when interactive (active or unavailable), expose a single control with an accessible name that summarizes source + codec (or Unavailable); no polite live region on track change.
- Do **not** show on mini player. Do **not** open details yet unless stage 04 is done in the same PR—prefer a non-opening control or `aria-haspopup` wired later to avoid half-broken UX.
- Verify: expand NP with stream, with local download, with empty queue, and a blocked offline track; confirm desktop non-expanded bar has no line.
