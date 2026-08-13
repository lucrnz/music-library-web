# Stage 03: Now-playing status line exclusive face

## Status
done

## Description

When exclusive is **enabled**, the now-playing status control always shows the exclusive primary face (link/exclusive icon + stage 01 plain-language state). Browser Streaming / Downloaded / Not playing face only when exclusive is **off**.

## Rationale

Users glance at the player chrome, not Settings. False “Streaming” while exclusive is on, or “Armed” while hub is empty, trains the wrong mental model. One exclusive primary face matches “enable → glance → play.”

## Implementation

### Priority rule (locked)

- While **`isExclusiveEnabled()`** (capable + enabled): primary face is **always** the exclusive face from `statusFace.js`, regardless of `playSource` (`none`, streaming, unavailable, etc.).
- Codec / Streaming / download labels stay out of the primary face; details hold them (stage 04).
- While exclusive **off**: keep current Streaming / Downloaded / Unavailable / Not playing behavior.

### Wiring

- Add exclusive/link glyph to the existing Icon sprite system (`Icon.js` / sprites — same convention as `source-stream`).
- Extend `formatPrimaryStatus` / `formatStatusAriaLabel` (or compose in `PlaybackStatusLine`) so exclusive-enabled path calls `formatExclusiveFace` with a small exclusive snapshot.
- Wire `PlaybackStatusLine` to exclusive store without bloating the component — snapshot or pure formatters only.
- Icon = exclusive/link icon for exclusive face kinds.
- Interactive details control still opens (same single control; no dual chip row on desktop/mobile).
- Aria labels match exclusive face **text**.

### Delete / replace

- Primary face showing **Streaming · codec** (or Downloaded) while exclusive is enabled.
- Any second exclusive status switch inside `PlaybackStatusLine` that duplicates `statusFace.js` copy.
- “Armed” wording on the player chrome.

### Out of scope

- Playback details row set (stage 04).
- Settings panel status (stage 05).
