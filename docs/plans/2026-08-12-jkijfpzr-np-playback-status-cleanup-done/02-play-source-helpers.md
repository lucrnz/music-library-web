# Stage 02: Atomic play-source helpers in the player store

## Status
done

## Description

Replace partial `setPlaySourceState({ … })` option bags and the copy-pasted success/fail updates in `playIndex` with small full-triple helpers: apply a resolved `PlaySource`, and mark playback failure. Every transition writes `playSource`, `playProfileId`, and `playBlockReason` together.

## Rationale

`playIndex` grew nested try/catch branches that each hand-edit notice + three reactive fields. That is the review’s spaghetti growth. One apply path and one fail path make the catch block read as policy (local fallback vs fail), not state plumbing, and prevent stale `playBlockReason` when a field is omitted.

## Implementation

- In `stores/player.js`, replace optional partial updates with helpers such as:
  - `clearPlaySourceState()` → `none` / null / null
  - `applyResolvedSource(source, activeCodec)` → maps `local` → downloaded, `remote` → streaming, `unavailable` → unavailable + reason + intended profile
  - `failPlayback({ profileId, reason, notice })` → unavailable triple + `setPlayNotice`
- `playIndex`: after `resolvePlaySource`, call `applyResolvedSource`; on play errors, call `failPlayback` (and keep existing local→stream fallback behavior, but only one state write per outcome).
- Prefer full arguments over partial option objects so callers cannot leave one field stale.
- Keep public reactive fields on `player` unchanged for the UI.
- Smoke: stream play, local play, offline missing, local fail→stream, stream fail — face state and notices match pre-refactor.
