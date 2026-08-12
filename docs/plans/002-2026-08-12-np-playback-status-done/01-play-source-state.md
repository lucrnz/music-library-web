# Stage 01: Play-source state on the player store

## Status
done

## Description

Record what the player actually resolved for the current load: delivery source (streaming / downloaded / unavailable), profile tag when known, and block reason when playback cannot start. Replace the boolean-only signal with structured reactive state that the now-playing UI can read without re-resolving OPFS or guessing from `audio.src`.

## Rationale

Today `player.fromDownload` is set on local play and never shown; remote plays leave no stashed profile tag; failed resolves only set `playNotice`. The status line and deep dive need one owner of “what we tried / what is playing” that updates on every `playIndex` path (including local→stream fallback) and clears on stop. Without this stage, UI would reimplement resolve policy or lie about the active codec.

## Implementation

- In `src/musicweb/static/js/stores/player.js`, extend the reactive `player` object (names flexible) with something like:
  - `playSource`: `'none' | 'streaming' | 'downloaded' | 'unavailable'`
  - `playProfileId`: `string | null` — delivery profile tag actually used or intended
  - `playBlockReason`: `string | null` — machine reason (`missing` | `broken` | `no_id` | `offline_no_local` | play failure), not free-form UI copy
  - Keep `fromDownload` only if other call sites still need it; otherwise derive from `playSource === 'downloaded'` and remove/update those call sites in this stage.
- On successful `resolvePlaySource`:
  - `local` → `playSource = 'downloaded'`, `playProfileId = source.codec` (from download record), clear block reason
  - `remote` → `playSource = 'streaming'`, `playProfileId = getActiveStreamCodec()` (also attach on the `PlaySource` return if convenient so fallback path can reuse one assignment helper)
  - `unavailable` → `playSource = 'unavailable'`, set `playBlockReason` from `source.reason`, set `playProfileId` to the profile that would have been used when known (active stream tag; local codec if offline/broken had a record)
- On local play failure that falls back to remote stream: flip state to streaming + active stream profile (same as a normal remote start).
- On hard local failure offline / remote play failure: `unavailable` + reason; keep intended profile if known.
- `stopPlayback` / no current track: reset to `none` / nulls (same moment covers and index are cleared).
- Prefer a small internal helper (e.g. `setPlaySourceState(...)`) so every branch in `playIndex` does not hand-edit three fields inconsistently.
- No UI in this stage. Smoke by temporary logging or by reading `player` from the console after play local / stream / offline-missing.
