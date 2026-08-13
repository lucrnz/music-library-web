# Stage 07: Playback sink abstraction and exclusive hard-fail

## Status
pending

## Description

Introduce **output sinks** (`htmlAudio` vs `companion`) and drive the player state machine only through the active sink. **Stop exporting** `HTMLAudioElement` `audio` from `player.js`. When exclusive is armed, play absolute stream URLs with per-track tags; hard-fail when enabled but not armed or companion dies. Wire sink **`ended` once** into the existing next-track path (no second advance owner).

## Rationale

Direct `audio.*` and a public `audio` export (e.g. `rows.js` using `audio.paused`) will break under exclusive. One sink interface and store flags keep transport coherent.

## Implementation

- Sink modules (e.g. under `static/js/exclusive/sinks/` or `static/js/playback/`):
  - `load(url)`, pause/resume, seek, setVolume, stop
  - callbacks/events: time, **ended**, error, pause state
  - `htmlAudioSink` owns the element **internally** (not exported)
  - `companionSink` uses companionClient
- Refactor `player.js` so playIndex / togglePlay / seek / volume / position / Media Session use **active sink** only.
- **Remove `export const audio`.** Fix consumers (at least `components/library/rows.js`) to use `player.paused` or a small store helper—not the element.
- Active sink: companion when **armed** (`enabled` ∧ device ∧ connected ∧ controller); else html. Mode switch: stop previous sink before next play.
- Exclusive **enabled** but not armed → play hard-fails (`playBlock` reason); no HTML fallback, no OPFS play.
- Armed → `getExclusiveProfileTag(track)` + `streamUrl` + `new URL(..., location.origin).href` → companion load. Honest play-source label.
- Missing tech: device-max via formatPolicy; **toast once per track id per session**.
- Mid-play companion error/disconnect → immediate hard stop + toast; no HTML fallback.
- **Advance:** sink `ended` → same player path as today’s HTML `ended` (repeat-one / playNext). Do not advance from companionClient or stage 08.
- Manual: exclusive play, no browser audio; rows/play-queue heuristics still correct without `audio` export; eof advances once; disconnect hard-stops; unarmed enable hard-fails play.
