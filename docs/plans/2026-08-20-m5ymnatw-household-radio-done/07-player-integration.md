# Stage 07: Player integration

## Status
done

## Description

The listener path: Tune in/out, radio-owned audio on `/api/stream` + seek, both PlayerBar slots, Media Session, settings, lyrics, connectivity. Preview (stage 06) already exists. This stage is one state machine, not a pile of hooks.

## Rationale

Radio-owned audio keeps `player.ts` (848 lines) from absorbing tune-in, seek-sync, and reconnect. `htmlSink` cannot instructed-seek-before-audible without changing the on-demand contract.

## Invariants

- `/api/stream?id=&codec=` for the **current** id only. Codec on the wire is `SOURCE_TAG` if `snapshot.is_lossy`, else the tuner’s stored **profile**. Never OPFS or exclusive companion URLs.
- `tune_in.codec` is only a `browser_listed` profile. Never send `source`.
- Radio owns `HTMLAudioElement` (`frontend/src/radio/audio.ts`). Do not call `htmlSink.load`.
- `radio.ts` owns the socket. Disconnect only when chrome is `inactive` / `preview` **and** the Radio tab is not showing.
- `playIndex` / library / queue play calls `radio.exitToQueue()` first.
- Tune-in uses `onDemandControl.stopOnDemandSinks()` (no `pl.index = -1`, no `playNext`).
- No listen cycle. `discardListen` on enter. No radio branches in `connectivity.ts` or `maybeStartListenCycle`.
- `LyricsOverlay` `seekable` (default `true`); radio passes `false`. Overlay does not import `radio.ts`.
- `NowPlayingFull` stays on-demand. Tests do not import `player.ts`. `radio.ts` does not import `player.ts`. `settings.ts` does not import `radio.ts`.
- `fromApiTrack` only when face is `current` and `id` is present.

## Risks

- Desktop hides `.player-mini` and shows `.player-full`. Mini-only radio chrome leaves desktop on the queue.
- Two full `RadioNowPlaying` instances sharing `#player .player-full` hooks = two compact bars or a broken room.
- `SettingsModal` → `setStreamCodec` → `playIndex(pl.index)` steals the frozen queue unless the call site **omits** `playIndex`.
- `setStreamCodec` always `requestPrepare({ replace: true })` and drops radio next-2 until the follow-up `tune_in`. Accepted; do not add a radio branch in `settings.ts`.
- Track-change `load()` / seek / `ended` fire `pause`. Without a latch, every advance Tunes out.
- A 409 from the wrong stream tag (lossy+profile or lossless+`source`) looks like a load failure and can hit the 3/10s cap.

## Implementation

### Files

- `frontend/src/stores/radio.ts` (chrome + façade + socket)
- `frontend/src/radio/audio.ts` (element, load, instructed seek, pause/ended latch)
- `frontend/src/radio/sync.ts` (2s drift)
- `frontend/src/radio/failures.ts` (3 / 10s)
- `frontend/src/playback/onDemandControl.ts` (stop sinks + Media Session install/restore/suspend)
- `frontend/src/components/radio/RadioNowPlaying.vue` (`layout="room" | "bar"`)
- `frontend/src/components/radio/RadioMini.vue` (small template)
- `frontend/src/components/radio/RadioView.vue`
- `frontend/src/stores/player.ts` (exitToQueue + volume fan-out only)
- `frontend/src/components/settings/SettingsModal.vue` (omit `playIndex`)
- `frontend/src/api.ts` (`streamUrl`)
- `frontend/src/components/player/PlayerBar.vue`
- `frontend/src/components/player/LyricsOverlay.vue` (`seekable`)
- `frontend/tests/stores/radio.test.ts`
- `frontend/tests/radio/` (audio, sync, failures)

Do **not** add `playbackStatus.ts` / `PlaybackDetailsBody.vue` / `settings.ts` / `playerSession.ts` to this list.

### Import graph

```
onDemandControl.ts  →  sinks, playerSession handlers. Not radio.ts.
player.ts           →  onDemandControl + radio.exitToQueue + radio.setVolume
radio.ts            →  onDemandControl + radio/*. Not player.ts.
settings.ts         →  no radio
SettingsModal.vue   →  radio chrome flag. May import radio.ts.
RadioView           →  radio.connect (not disconnect)
radio tests         →  radio.ts / radio/*.ts only
```

### State machine

Chrome: `inactive | preview | stopped | tuning | tuned`  
Face: `catching_up | skip_pending | idle | current`  
Socket: required when Radio tab is showing **or** chrome is `stopped | tuning | tuned`

| Chrome × face | Socket | Audio | `tune_in` |
|---|---|---|---|
| `preview` × any | tab only | none | — |
| `stopped` × `current` | required | none | Play sends profile |
| `stopped` × other | required | none | toast, stay stopped |
| `tuning` × `current` | required | load + seek | already sent |
| `tuning` × `catching_up` / `skip_pending` | required | none | wait; re-send when `current` |
| `tuning` × `idle` | required | none | `tuneOut` → `stopped` |
| `tuned` × `current` | required | playing at clock | only if **profile** changed |
| `inactive` | off (unless tab) | none | — |

`streamUrl(current, snapshot.is_lossy ? SOURCE_TAG : profile)`. Re-read `is_lossy` on every track change and reconnect. Do not send `tune_in` unless the profile changed.

### Steps

1. Chrome starts `inactive`. Opening `/radio` alone → `preview` (no bar steal). First Tune-in enters `stopped`/`tuning`/`tuned` until `exitToQueue()`.
2. Extract `onDemandControl`: `stopOnDemandSinks()` (bump load generation, `clearPlaySourceState`, stop both sinks, leave `pl.index`); Media Session install/restore + `suspendMediaSession` / `restoreMediaSession`.
3. Socket: `RadioView` `connect()` on enter (idempotent). Never disconnect from unmount. `tuneIn()` connects if needed, waits for a snapshot. Disconnect only in `exitToQueue()` when the Radio tab is not showing, or when chrome returns to `preview`/`inactive` off `/radio`.
4. `tuneIn()`:
   - reject `catching_up` / `skip_pending` / `idle` without loading audio
   - `stopOnDemandSinks()`, `discardListen`
   - send `tune_in` with `getActiveStreamCodec()` (profile only)
   - on `{ ok: true }`, chrome `tuning`; load `streamUrl` from `is_lossy`; on `canplay` seek (seconds) + `play()` → `tuned`
   - `{ ok: false }` → toast, stay `stopped` / `preview`
5. `tuneOut()`: send `tune_out`, stop the radio element, chrome `stopped`, **keep the socket**. Play handler = `tuneIn`.
   `exitToQueue()`: `tune_out` if needed, stop element, restore Media Session, chrome `inactive`, disconnect if tab not showing.
6. Latch in `audio.ts`: ignore `pause`/`ended` while load or seek is in flight. `ended` is never Tune-out. OS/headphone/Media Session pause is Tune-out only when the latch is clear.
7. Drift (`sync.ts`): if `tuned` and `|heard − official| > 2` (WS position or tab visible), seek. Do not seek every 1s.
8. Track change while `tuned` / `tuning`: re-read `is_lossy`, load new URL, seek. Does not increment the failure cap. Does not send `tune_in`.
9. Failures (`failures.ts`): network / decode / seek throw, 3 in 10s → toast, `tuneOut`. Station advance and tag-correct track-change reloads do not count.
10. Reconnect while chrome requires a socket: `catching_up` / `skip_pending` → stay, no stream load, `tune_in` once `current`; `idle` → `tuneOut`; `current` → `tune_in` once (idempotent).
11. Layouts: `RadioView` uses `RadioNowPlaying layout="room"`. PlayerBar, when chrome is `stopped|tuning|tuned`, mounts `RadioNowPlaying layout="bar"` instead of `NowPlayingFull` and `RadioMini` instead of the on-demand mini. Hide seek/skip/shuffle/repeat on the bar layout. `playerBarVisible` includes those chrome states.
12. `player.ts` only: `playIndex` / `stopPlayback` / library play → `exitToQueue()` first; `setVolume` / `applyVolume` call `radio.setVolume` while chrome is on. One stored `player.volume`. No `playSource: "radio"`.
13. Radio Media Session: title/artist/album/artwork + play/pause/stop only. `exitToQueue()` restores on-demand handlers.
14. Codec/lossy rows on `RadioNowPlaying`: existing formatters with explicit snapshot + chosen **profile**. Do not open `PlaybackDetailsBody`.
15. `SettingsModal.chooseStream`: while chrome is `stopped|tuning|tuned`, build `playbackCtx` **without** `playIndex`. Then `tune_in` with the new profile. Reload `/api/stream` only if current `is_lossy` is false. Write in tests that `replace: true` may drop radio prewarm until that `tune_in` / next advance.
16. Connectivity: `radio.ts` watches the store; loss → `tuneOut` + toast.
17. Tests: chrome × face × socket table; `tune_in` never sends `source`; lossless→lossy load uses `SOURCE_TAG` and does not 409; lossy→lossless uses the stored profile; `fromApiTrack` only on `current`; `tuneIn` connects if needed; socket stays up while `stopped` off `/radio`; RadioView unmount does not disconnect; pause latch; drift; failure cap vs track-change; `seekable=false`. Mock `@/api`. No `player.ts` import.

### Verify

- `pnpm --dir frontend test`
- `pnpm --dir frontend typecheck`
- Browser, mobile **and** desktop:
  - Tune in: waits if cold, joins mid-track; no user seek/skip
  - Leave `/radio` while tuned: audio continues; desktop **bar** is `layout="bar"`; room unmounts; WS stays up
  - Tune out, leave `/radio`: bar stays radio, WS stays up; Play retunes
  - Leave `/radio` without tuning in: WS disconnects
  - Play a library track: radio chrome ends; on-demand plays; Media Session next/prev work
  - Frozen queue still there when Playlist remounts
  - Change Streaming while tuned: `tune_in` new profile; reload only if lossless; queue does not start
  - Lossless→lossy advance: load uses `source`, no toast, no Tune-out
  - Volume slider drives the radio element
  - Lyrics overlay does not seek
  - Streaming = FLAC: complete-file FLAC (no Opus fallback)
  - Lock-screen Pause tunes out; track advance does not
  - Server restart while tuned: stay `tuning` through `catching_up` / `skip_pending`; `tune_in` once `current`; idle → stopped
  - Two tabs: two tuners (optional)

## Acceptance

- Chrome × face × socket matches the table, including stopped radio face after Tune-out and `tuning` until playing at the seek point.
- Tuner codec is never `source`. Lossy/lossless advances do not 409 from the wrong tag.
- Radio audio is not the shared HTML sink.
- Desktop bar is `RadioNowPlaying layout="bar"`; room is `layout="room"`; mini is `RadioMini`.
- Changing Streaming omits `playIndex` and re-sends `tune_in` with the profile.
- Library/queue play takes the player and restores on-demand Media Session.
- No user seek, skip, pause control, queue spoilers, or listen events from radio.
- Typecheck and frontend unit tests pass; radio tests do not import `player.ts`.
