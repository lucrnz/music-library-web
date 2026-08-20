# Stage 02: Extract NowPlayingView

## Status
done

## Description

Split the on-demand now-playing tree into a presentational `NowPlayingView` plus `NowPlayingFull` transport. Make `PlaybackStatusLine` take injected play state. On-demand expanded sheet and desktop compact bar look and behave as they do today.

## Rationale

Radio will mount the same surface. Extracting first keeps the on-demand look as the baseline so stage 03 does not fork markup again.

## Invariants

- `NowPlayingView` does not import `radio.ts` or `player.ts`.
- `NowPlayingFull` remains the on-demand wrapper: shuffle / prev / play / next / repeat, user seek, `player.lyricsOpen`, close/sheet-dismiss.
- `PlaybackStatusLine` is the only codec badge. Do not add `playSource: "radio"`.
- Class names used by `player.css` / `desktop.css` (`player-full`, `sheet-grab`, `full-cover-wrap`, `seek-row`, `player-extras`, …) stay so compact/expanded CSS keeps working.
- No happy-dom / Vue mount tests.

## Risks

- Moving markup without the same classes will break the desktop compact grid.
- `PlaybackStatusLine` today reads `player` / `pl` / exclusive internally. If the parent forgets to pass state, the badge goes blank. `NowPlayingFull` must pass today’s store snapshot.

## Implementation

### Files

- `frontend/src/components/player/NowPlayingView.vue` (create)
- `frontend/src/components/player/NowPlayingFull.vue`
- `frontend/src/components/player/PlaybackStatusLine.vue`
- `frontend/src/components/player/PlayerBar.vue` (only if expose/collapse wiring must change)
- `frontend/css/player.css` (only if a class must move with the markup; prefer no visual change)
- `frontend/tests/playback/playbackStatus.test.ts` (only if the formatter API changes — it should not)

### Steps

1. Teach `PlaybackStatusLine` required props `playState` and `exclusiveSnap` (same types it computes today). Remove its `player` / `pl` / `exclusiveStatusSnapshot()` reads. Keep modal/popover chrome inside the component.
2. Create `NowPlayingView.vue` with the current full-player body: sheet grab (close optional), cover + `LyricsOverlay`, title/artist/`LossyMark`, seek row (`setRangeFill`), status line, `player-extras` (volume, lyrics, settings), `⋯` / `ActionMenu`. Slot name `transport` between seek and status, where `transport-buttons` lives now.
3. Props (minimum): `title`, `subtitle`, `coverFull`, `track`, `trackId`, `currentTime`, `duration`, `seekValue`, `seekInteractive`, `volume`, `lyricsOpen`, `lyricsSeekable`, `showClose`, `showStatus`, `showLyricsToggle`, `npModal`, `playState`, `exclusiveSnap`. Emits: `collapse`, `cover-or-meta-open`, `seek-fraction`, `volume`, `toggle-lyrics`.
4. Keep `setRangeFill` on seek/volume, including when `seekInteractive` is false (disabled range, still painted).
5. Slim `NowPlayingFull` to bind on-demand stores into those props, put the five transport buttons in the slot, and keep `focusClose` / sheet-drag / `player.expanded` lyrics. `seekInteractive` true. `showStatus` / `showLyricsToggle` follow `player.expanded` as today (`PlaybackStatusLine` is expanded-only; desktop CSS already hides lyrics on the closed bar).
6. Do not change `PlayerBar` radio branches in this stage.

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test` — existing `playbackStatus` and entity-menu tests still pass.
- Manual on-demand (no radio): mobile mini → expand → seek fill, volume fill, codec tap (details), lyrics toggle, `⋯`, collapse. Desktop compact bar + expand. Compare to pre-change behavior.

## Acceptance

- On-demand now-playing is visually and behaviorally unchanged.
- `NowPlayingView` has no import of `radio.ts` or `player.ts`.
- `PlaybackStatusLine` renders only from props.
- Seek and volume fills still use `--range-fill` via `setRangeFill`.
