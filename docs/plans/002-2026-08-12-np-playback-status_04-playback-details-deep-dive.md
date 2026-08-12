# Stage 04: Playback details deep dive

## Status
done

## Description

Make the status line open **Playback details**: ordered delivery tech rows on mobile via a centered info modal (AppDialog *pattern*—modal lock, focus, Escape), and on desktop via one shared popover panel driven by hover, keyboard focus, and click/tap. Empty “Not playing” stays non-interactive; Unavailable is tappable and shows reason + intended profile.

## Rationale

The primary line stays subtle; power users get full delivery readout without Settings. A single content builder (stage 02 rows) feeding two chrome shells avoids mobile/desktop copy drift. AppDialog today is confirm/prompt only—reusing its *pattern* (not stuffing OK/Cancel into an info readout) keeps shell dialogs honest while matching product UX.

## Implementation

- **Content:** render `buildPlaybackDetailsRows(...)` as a simple definition list / labeled rows (Source, Codec, Bitrate or bit depth, Sample rate, Profile; unavailable variant per stage 02). Title: `Playback details`.
- **Mobile (&lt;900px):** open a centered info modal on status-line activation.
  - Prefer a small dedicated component or an extended dialog mode rather than overloading confirm/prompt semantics of `dialog.js` / `AppDialog.js`.
  - Use `acquireModalLock` / `releaseModalLock` like other modals; Escape and backdrop dismiss; focus trap or initial focus on close control.
  - Single dismiss action (Close)—no confirm/cancel pair.
- **Desktop (≥900px):** one shared popover panel (same row content + title optional).
  - Open on pointer hover, keyboard focus, and click/tap (touch laptops).
  - Click toggles for touch; hover/focus open for mouse/keyboard.
  - Close: Escape, click-outside, pointer leave (with a short grace if needed so moving into the panel does not flash-close).
  - Anchor to the status line; keep within viewport; do not use native `title` tooltips for the multi-line body.
- Breakpoint: reuse the player’s existing `900px` media query / `matchMedia` helper—same as expand behavior.
- Wire the status line control from stage 03: active + unavailable open details; `Not playing` remains static text.
- Accessible name on the control e.g. “Streaming, Opus 192k, playback details” / “Unavailable, playback details”; `aria-expanded` or equivalent when the desktop popover is open; no live region on track change.
- Out of scope (v1 grill): source-library FLAC tech APIs, mini-bar indicator, settings deep-link, Media Session metadata.
- Verify end-to-end: stream play → line + details; downloaded play → Downloaded + local profile; unavailable offline → line + reason row; hover and tap on desktop; modal on mobile; collapse expanded NP while open closes or unmounts details cleanly.
