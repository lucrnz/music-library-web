# Stage 03: Radio room on /radio

## Status
done

## Description

`/radio` hides `#player`. The Radio pane hosts `NowPlayingView` plus a single labeled Tune in/out control. Idle/waiting chrome stays. Codec, lyrics, filled seek/volume, and `⋯` match on-demand.

## Rationale

This is the Radio-tab experience and the duplicate-mini screenshot. The shared view exists after stage 02; this stage is its first radio host.

## Invariants

- `#player` is hidden for the whole `/radio` route (mini and compact).
- Opening Radio still does not auto Tune in. Face `current` shows what is on air plus Tune in.
- No shuffle, prev, next, repeat, or play/pause. One Tune in/out button: new glyph + label.
- Seek visible, filled, `disabled` / non-interactive. Lyrics `seekable=false`.
- `PlaybackStatusLine` gets `playSource: "streaming"`, tuner profile (lossy uses track source fields), and a **disabled** exclusive snap. Do not add `playSource: "radio"`.
- Radio lyrics open state is local to the radio wrapper, not `player.lyricsOpen`.
- `radio.ts` still does not import `player.ts`. Wrapper may import `radio.ts` and `NowPlayingView`.
- Same `⋯` via `nowPlayingMenuItems`.

## Risks

- `.lyrics-toggle` is `#player.expanded .lyrics-toggle { display: inline-flex }`. Inside `#view-radio` it stays hidden unless CSS is extended.
- `#player.expanded .player-full` / desktop compact rules will not apply inside `#view-radio`. The room needs an expanded-stack rule that does not require `#player`.
- Two `NowPlayingView` instances (room + leftover bar in `PlayerBar`) until stage 04. Hide `#player` on `/radio` so they cannot both show on this tab.

## Implementation

### Files

- `frontend/index.html` (`#i-tune-in`, `#i-tune-out`)
- `frontend/src/components/radio/RadioNowPlaying.vue` (rewrite as room wrapper; drop `layout="bar"` usage from `RadioView`)
- `frontend/src/components/radio/RadioView.vue`
- `frontend/src/components/player/PlayerBar.vue` (`visible` is false when `route.meta.pane === "radio"`)
- `frontend/css/radio.css`
- `frontend/css/player.css` (lyrics toggle / `.player-full` stack under `#view-radio` if that is cleaner than duplicating in `radio.css`)
- `frontend/src/stores/radio.ts` (only if a small helper is needed to build play-status props; keep it radio-owned)

### Steps

1. Add sprite symbols `#i-tune-in` (radio + connecting mark) and `#i-tune-out` (same radio + slash), 24×24, `currentColor`, matching `#i-radio` weight.
2. Rewrite `RadioNowPlaying` to compose `NowPlayingView`: radio track/title/`radioSubtitle`/covers; `heard` clock as today (official while not tuned, interpolated while tuned); `seekInteractive=false`; `showClose=false`; `showStatus` and `showLyricsToggle` true; `lyricsSeekable=false`; local `lyricsOpen`.
3. Transport slot: one button. Icon `tune-out` + “Tune out” when chrome is `tuned` | `tuning`; icon `tune-in` + “Tune in” otherwise. Existing `tuneDisabled` rules. Reuse `.radio-tune-in` (pill) plus an `Icon`.
4. Play-status props: `{ playSource: "streaming", playProfileId: radio.isLossy ? null : (radio.tunerProfile || getActiveStreamCodec()), track: radio.track }`. Exclusive snap disabled / non-interactive exclusive face so Settings “exclusive enabled” cannot relabel HTML radio.
5. Volume: keep one stored `player.volume` via `writeVolume` + `setVolume` from `radio.ts` (same as today). Do not import `player.ts`; `playerState` / `playerPrefs` are already used.
6. `RadioView`: idle / catching_up / skip_pending stay as they are. `current` mounts the rewritten room. Header “Radio” stays.
7. `PlayerBar` `visible`: false when the route pane is `radio`, even if radio chrome is on. Do not mount radio mini/bar on this tab.
8. CSS: `#view-radio .player-full` uses the expanded column stack (flex, cover, extras). Show `.lyrics-toggle` on that host. Do not apply desktop compact grid inside `#view-radio`.

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test`
- Manual mobile `/radio`: no mini, no second title row, no `#player`. Room matches on-demand now-playing (filled seek, filled volume, tappable `Streaming · …` or lossy source, lyrics overlay, `⋯`). Tune in/out is the only transport.
- Manual: Tune in, leave the tab (stage 04 still has old off-radio chrome — acceptable). On `/radio` `#player` stays gone.
- Idle / catching_up / skip_pending still replace the room, not a hollow `NowPlayingView`.

## Acceptance

- `/radio` never shows `#player` (mini or compact).
- Face `current` uses `NowPlayingView` with icon+label Tune in/out only.
- Seek and volume are filled. Seek cannot be dragged.
- Codec line is the interactive on-demand badge, including Playback details.
- Lyrics toggle opens the same overlay; synced lines do not seek.
- `⋯` offers the same copy / go-to items as on-demand.
