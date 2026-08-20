# Stage 05: Living docs

## Status
done

## Description

Update household-radio, frontend, and playback docs so they describe the shared now-playing surface, `/radio` hiding `#player`, off-radio mini/compact chrome, dedicated tune glyphs, and stay-tuned advances.

## Rationale

`context/design.md` is not living documentation. The current pages still specify `RadioNowPlaying` room/bar plus `RadioMini` on `#player`, and “ended is never Tune-out” is already in `radio.md` but the client violated it — the docs must match the shipped latch and chrome.

## Invariants

- Docs stay at intent, ownership, and guardrails. Request shapes, sprite paths, and encoder argv stay in source.
- Do not add an ADR. `docs/systems/radio.md` is the durable radio page.
- Exclusive-mode radio remains a TODO. Do not document a live pipe or a radio lossy re-encode.

## Risks

- Leaving “`NowPlayingFull` stays on-demand” / “mini is a third template on `#player`” sentences will send the next change back to the old three-surface stack.

## Implementation

### Files

- `docs/systems/radio.md`
- `docs/frontend/conventions.md`
- `docs/systems/playback.md`
- `docs/architecture/index.md` (only if it names `RadioNowPlaying` layouts)
- `docs/development/project-structure.md` (only if it lists radio SFCs)

### Steps

1. `radio.md` **Client**: `/radio` unmounts library+playlist and **hides `#player`**. Room is `NowPlayingView` via a thin radio wrapper (not a parallel now-playing). Off `/radio`, mobile `RadioMini` and desktop compact `NowPlayingView` are mutually exclusive. Cover/title navigate to `/radio`. Tune in/out uses `#i-tune-in` / `#i-tune-out` (icon-only on mini; icon+label on room/compact). Stay-tuned: `pause` while `ended` is ignored; `ended` is never Tune-out. Lyrics `seekable=false`. Codec line is injected `PlaybackStatusLine` (`streaming` + profile / lossy source; exclusive snap disabled). `NowPlayingView` does not import `radio.ts` or `player.ts`. `radio.ts` still does not import `player.ts`.
2. Drop sentences that require `RadioNowPlaying` `layout="room" | "bar"` as the now-playing implementation, and that opening Radio “does not steal the bar” if that now means “does not auto-tune” (the bar is gone on `/radio`).
3. `conventions.md`: desktop Radio is pane-only (no compact bar on `/radio`). Off-radio desktop compact radio bar is the player slot. Do not add Radio as a ModeBar chip. Mention the shared view and that Settings still omits `playIndex` while radio chrome is on.
4. `playback.md`: display clocks unchanged (official while not tuned / interpolated while tuned; 2s re-seek). Note that radio now-playing reuses `setRangeFill` and `PlaybackStatusLine` via props, not a second badge.
5. Architecture / project-structure: rename the client chrome list if they still say room/bar/mini as three `RadioNowPlaying` layouts.

### Verify

- Grep `docs/` for `RadioNowPlaying`, `layout="bar"`, `layout="room"`, and “does not steal the bar”. Remaining mentions must match the shipped wrapper (or be the archived plan under `docs/plans/`).
- Read `docs/systems/radio.md` Client + Guardrails: stay-tuned, no `#player` on `/radio`, no `player.ts` import from `radio.ts`.

## Acceptance

- Living docs describe hide-`#player`-on-`/radio`, `NowPlayingView` + radio wrapper, mini vs desktop compact, tune glyphs, injected codec line, lyrics, and stay-tuned.
- No living page still prescribes a parallel radio now-playing with text Tune in/out on the mini.
- Exclusive radio, live pipe, and lossy re-encode remain out of scope.
