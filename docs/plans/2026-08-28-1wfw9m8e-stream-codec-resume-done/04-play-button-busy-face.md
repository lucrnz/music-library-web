# Stage 04: Play button busy face

## Status
done

## Description

While `player.loadPending` is true, the mini-bar and expanded queue Play buttons show a busy spinner, `aria-busy="true"`, and a loading label. Clicks still go to `togglePlay` so stage 02’s want-paused latch works.

## Rationale

Stage 02 stops mashed Play from restarting the encode, but the icon still looks idle. A busy face tells the user the server is building the new stream and that they do not need to tap again.

## Invariants

- Only on-demand queue chrome (`PlayerBar` mini Play, `NowPlayingFull` primary Play). Radio Tune-in / radio spinner is unchanged.
- `player.loadPending` is the only busy input (set in stage 02). Do not infer busy from `playSource === "none"`.
- Click / keyboard activation still calls `togglePlay`. Do not `disabled` the button.
- `title` and `aria-label` are `Loading stream…` while pending; they return to `Play / Pause` when not pending.
- Seek bar stays interactive; stage 01 already holds the time.

## Risks

- Reusing `.radio-spinner` couples queue chrome to radio CSS. Use a player-scoped class in `player.css`.
- A spinner that replaces the `<Icon>` must stay inside the existing `.icon-btn` hit target (same 44px-class buttons).

## Implementation

### Files

- `frontend/src/components/player/PlayerBar.vue`
- `frontend/src/components/player/NowPlayingFull.vue`
- `frontend/css/player.css`

### Steps

1. In `frontend/css/player.css`, add `.player-load-spinner` (small circle, `border` + `border-top-color: var(--accent)`, spin keyframes local to this file). Size it to sit in the Play button like `.icon` does (~22–24px mini, a little larger in `.icon-btn.primary`).
2. In `frontend/src/components/player/PlayerBar.vue`, when `player.loadPending`, render `<span class="player-load-spinner" aria-hidden="true" />` instead of the play/pause `<Icon>` on the mini Play button. Set `aria-busy="true"` and `title` / `aria-label` to `Loading stream…`. Keep `@click="togglePlay"`.
3. Repeat the same pending face on the primary Play button in `frontend/src/components/player/NowPlayingFull.vue`.

### Verify

```sh
pnpm --dir frontend typecheck
```

On a running app, desktop and a narrow (mobile) viewport: start a lossless track, change Streaming to an uncached profile. Confirm both the mini Play (collapsed) and the expanded primary Play show the spinner for the wait, stay clickable (Pause-during-wait still latches), and return to pause/play when audio is ready. Confirm radio Tune-in still uses `.radio-spinner`, not this class. Check the expanded sheet and the desktop mini bar.

## Acceptance

- Mini and expanded queue Play show the spinner iff `player.loadPending`.
- Buttons stay activatable; labels are `Loading stream…` while pending.
- Radio chrome is unchanged.
- Desktop and mobile play buttons both update.
- `pnpm --dir frontend typecheck` passes.
