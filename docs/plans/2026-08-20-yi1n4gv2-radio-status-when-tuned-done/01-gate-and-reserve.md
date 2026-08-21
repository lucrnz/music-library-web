# Stage 01: Gate the room badge and reserve its slot

## Status
done

## Description

On the Radio room surface, mount `PlaybackStatusLine` only while chrome is `tuned`. When it is hidden, keep an empty `.np-status-wrap` of the same height so the extras row does not move.

## Rationale

This is the product change. The room is the only surface that shows the codec line today; compact already hides it. Gate and reserve have to land together or Tune in / Tune out will jump volume, lyrics, and settings.

## Invariants

- `NowPlayingView` does not import `radio.ts` or `player.ts`.
- `radio.ts` does not import `player.ts`.
- Do not add `playSource: "radio"`. Radio still injects `radioPlayState()` and `RADIO_EXCLUSIVE_SNAP`.
- Desktop compact radio (`layout="bar"`) keeps `showStatus` false and does not reserve a slot.
- On-demand `NowPlayingFull` still uses `:show-status="player.expanded"` and does not reserve when collapsed.
- Mobile `RadioMini` is untouched.

## Risks

- If `.np-status-wrap` `min-height` stays `20px`, the empty hole is shorter than the badge and extras still jump ~4px. The wrap height must match the button (padding `4px 8px` + `12px` at `line-height: 1.3` → `24px`).
- A `visibility: hidden` badge left in the tree would stay focusable. Reserve with an empty wrap, not a hidden button.

## Implementation

### Files

- `frontend/src/components/player/NowPlayingView.vue`
- `frontend/src/components/radio/RadioNowPlaying.vue`
- `frontend/css/player.css`

### Steps

1. Add optional `reserveStatus` (default `false`) to `NowPlayingView`.
2. Template: if `showStatus`, mount `PlaybackStatusLine` as today. Else if `reserveStatus`, mount an empty `<div class="np-status-wrap" aria-hidden="true" />`. Else mount nothing.
3. In `player.css`, set `.np-status-wrap` `min-height` to `24px` so the empty wrap matches the badge button.
4. In `RadioNowPlaying`, for the room `NowPlayingView`: `:show-status="radio.chrome === 'tuned'"` and `:reserve-status="true"`. Compact stays `:show-status="false"` with no reserve.

### Verify

- `pnpm --dir frontend typecheck`
- In the browser on `/radio` with a `current` face:
  - Preview (tab open, never tuned): no badge; extras sit as they will when tuned.
  - Tune in (`tuning`): still no badge; extras do not move.
  - `tuned`: badge appears (`Streaming · …` or the lossy source line); extras do not move.
  - Tune out (`stopped`): badge gone; extras do not move.
  - Open Playback details while tuned, then Tune out: details unmount with the line.
- Desktop, not on `/radio`, radio chrome on: compact bar has no badge and no extra hole.
- On-demand expanded still shows the badge; collapsed still does not.

## Acceptance

- Radio room badge exists only while `chrome === "tuned"`.
- Radio room extras (volume, lyrics, settings) do not shift when chrome moves between preview / tuning / tuned / stopped.
- Compact radio, `RadioMini`, and on-demand now-playing look and behave as they do before this stage.
