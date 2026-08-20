**Archive.** Decisions in this file were current as of 2026-08-20 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Fix radio now-playing and stay-tuned

## Goal

Radio uses the same now-playing surface as on-demand (filled seek/volume, interactive codec line, lyrics, `⋯`), without a mini-player on the Radio tab. Off that tab, a short tune control and (on desktop) a compact radio bar remain. A station advance must not Tune out.

## Settled decisions

- Hide all of `#player` on `/radio`. The Radio pane is the only now-playing surface there.
- Extract a shared presentational now-playing view. `NowPlayingFull` keeps on-demand transport. Radio is a thin wrapper around the same view. Delete the parallel `RadioNowPlaying` layouts.
- Radio transport is one **Tune in / Tune out** button with a dedicated glyph beside the label. Hide shuffle, prev, next, repeat, and play/pause.
- Seek stays visible and filled (`setRangeFill`) and is not interactive.
- Add `#i-tune-in` and `#i-tune-out` to the sprite. Mini is icon-only. The room/compact button is icon + label.
- Same `⋯` menu as on-demand (`nowPlayingMenuItems`).
- Mini (Library / Playlist, mobile) exists only when the tab is not Radio. Cover/title navigate to `/radio`; they do not expand a sheet.
- Desktop, not on Radio: compact radio bar in the existing player slot (cover, title, filled seek, Tune in/out, volume). Cover/title go to `/radio`.
- Codec line is `PlaybackStatusLine` (`Streaming ·` profile, or the lossy source). Inject play state; do not add `playSource: "radio"`. Pass a disabled exclusive snap so an enabled hog setting cannot show the exclusive face on HTML radio.
- Lyrics overlay + toggle, `seekable=false`. Radio lyrics open state lives on the radio wrapper, not `player.lyricsOpen`.
- `ended` is never Tune-out. Ignore the `pause` browsers fire on `ended`. Stay a tuner and load the next official snapshot.
- Radio still owns its `HTMLAudioElement`. `radio.ts` does not import `player.ts`. Exclusive-mode radio stays a later TODO.

## Design

Today three radio surfaces stack: `RadioView` room, `RadioMini`, and `RadioNowPlaying` `layout="bar"`. On mobile `/radio` that is a full room plus a mini that repeats the title and a long **Tune out** label. Seek/volume ranges never call `setRangeFill`. The codec line is static text. `LyricsOverlay` is mounted with `lyricsOpen` stuck false. `audio.onPause` Tunes out, and browsers fire `pause` on `ended`, so the next track requires Tune in again.

**Stay tuned.** `createRadioAudio` already ignores pause/ended while load or seek is in flight. Extend that latch: a `pause` while `el.ended` does not invoke the Tune-out handler. `onEnded` stays a no-op (station clock owns advance). Chrome stays `tuned` (or follows the existing `skip_pending` → `tuning` path). The next `current` snapshot still `loadCurrent`s. User pause, headphone unplug, and lock-screen Pause still Tune out when the element is not ended.

**Shared view.** New `NowPlayingView.vue` owns cover + lyrics overlay, title/artist/`LossyMark`, filled seek, `PlaybackStatusLine`, volume, lyrics toggle, settings, and `⋯`. A `transport` slot is the only playback controls. It does not import `radio.ts` or `player.ts`. Time, volume, lyrics open, seek interactivity, close affordance, and play-status are props. `NowPlayingFull` becomes the view plus the five on-demand buttons.

`PlaybackStatusLine` takes `playState` and `exclusiveSnap` as props (it is only used from this view). On-demand parent passes `player` / `pl.current` / `exclusiveStatusSnapshot()`. Radio parent passes `playSource: "streaming"`, the tuner profile (lossy rows still use track fields), and a disabled exclusive snap.

**Radio tab.** `RadioView` keeps idle / catching_up / skip_pending chrome. When face is `current`, it mounts the radio wrapper around `NowPlayingView` (expanded stack, no close, no sheet-dismiss). `#player` is `.hidden` on `/radio`. Lyrics toggle must work without `#player.expanded` (today `.lyrics-toggle` is gated on that).

**Off Radio.** `PlayerBar` is visible only when the route is not radio and radio chrome or the queue warrants it. Mobile: `RadioMini` only — new glyphs, cover/title → `/radio`. Desktop: compact `NowPlayingView` in the existing `#player` grid (mini stays `display: none`); cover/title → `/radio`. Never mount mini and compact radio together.

**Glyphs.** `#i-tune-in`: radio set with a connecting mark. `#i-tune-out`: the same radio with a slash. `Icon` already resolves `name="tune-in"` to `#i-tune-in`.

## Stage map

1. **Stay tuned** — independent of chrome; this is the functional break. Fix the latch before any view rewrite so later stages do not reintroduce Tune-out on advance.
2. **Extract `NowPlayingView`** — on-demand must keep the current expanded/compact look before radio mounts the same tree. Status line becomes injectable here so radio does not grow a second badge.
3. **Radio room** — first consumer of the shared view; hides `#player` on `/radio` (the screenshot). Adds glyphs, labeled Tune button, lyrics, and the real codec line.
4. **Off-radio chrome** — depends on the room wrapper and glyphs. Replaces the stacked mini+bar with mobile mini + desktop compact only.
5. **Living docs** — last so `radio.md`, frontend conventions, and playback describe the shipped chrome, not `RadioNowPlaying` room/bar/mini.

## Out of scope

- Exclusive-mode radio (companion hog / mpv)
- User seek, skip, pause-in-place, or remote DJ
- Radio listen stats
- Live stdout / Icecast / HLS / concat radio pipe
- Radio re-encode of lossy into a stream profile
- Changing on-demand transport or `player.ts` loaders
- New Vue/component test runner (no happy-dom / TestClient)

## Assumptions

- A short gap after `ended` before the next WebSocket `current` is acceptable: keep the last face at end-of-track until the snapshot (or show existing `skip_pending` chrome).
- Desktop compact radio does not show lyrics or `PlaybackStatusLine` (same as on-demand compact).
- Going to album/artist from `⋯` leaves `/radio`; a later library play still `exitToQueue()`.
- New sprite symbols can be simple 24×24 companions of `#i-radio`; they do not need a separate icon design pass.
