# Stage 04: Playback session

## Status
done

## Description

Extract radio socket / load-gen / media-session into `radio/runtime.ts`. Rename `onDemandControl.ts` to `playback/session.ts`. Share one HTML-element helper. Settings persist + prepare only. Lyrics emit `seek-fraction`. `removeIndices` returns the next cursor. Map `/api/codecs` to camelCase once. Exclusive status rows run only when `session === "queue"`. Delete `exitToQueue`. Do not reopen `failCurrentLoad` or `intentForTrack`.

## Rationale

`radio.ts` is the remaining playback god. Settings `playIndex?` and LyricsOverlay’s player import are feature logic in shared paths. This stage deletes those forks now that the load contract is honest.

## Invariants

- `player.ts` does not import `radio.ts`. Radio watches `player.volume`.
- Radio does not use the on-demand `PlaybackSink`. Two `HTMLAudioElement`s remain (session teardown is the point of `become`).
- Tuner codec is still a `browser_listed` profile, never `source`.
- `become("none" | "queue" | "radio")` stays the handoff.
- Stage 02 fail/intent code in `player.ts` is not rewritten.

## Risks

- Radio tests mock `@/playback/onDemandControl` and `exitToQueue`.
- Codec camel mapping can break `qualityRank` / status tests that still read `bitrate_kbps` on settings options.
- Player codec watch must not restart when radio chrome is active.

## Implementation

### Files

- `frontend/src/playback/session.ts`
- `frontend/src/playback/onDemandControl.ts`
- `frontend/src/radio/runtime.ts`
- `frontend/src/radio/audio.ts`
- `frontend/src/playback/sinks/htmlElement.ts`
- `frontend/src/playback/sinks/htmlAudioSink.ts`
- `frontend/src/stores/radio.ts`
- `frontend/src/stores/player.ts`
- `frontend/src/stores/settings.ts`
- `frontend/src/stores/playlist.ts`
- `frontend/src/components/settings/SettingsModal.vue`
- `frontend/src/components/player/LyricsOverlay.vue`
- `frontend/src/components/player/NowPlayingView.vue`
- `frontend/src/components/playlist/PlaylistView.vue`
- `frontend/src/components/playlist/queueMenuItems.ts`
- `frontend/src/qualityRank.ts`
- `frontend/src/playbackStatus.ts`
- `frontend/src/components/player/PlaybackStatusLine.vue`
- `frontend/src/components/player/NowPlayingFull.vue`
- `frontend/tests/stores/radio.test.ts`
- `frontend/tests/playback/handoff.test.ts`
- `frontend/tests/stores/settings.test.ts`
- `frontend/tests/stores/playlist.test.ts`
- `frontend/tests/playback/playbackStatus.test.ts`
- `frontend/tests/playback/qualityRank.test.ts`
- `frontend/tests/playlist/queueMenuItems.test.ts`

### Steps

1. Move `frontend/src/playback/onDemandControl.ts` to `frontend/src/playback/session.ts` (same `become` / leave hooks / Media Session install). Point `player.ts`, `radio.ts`, and `frontend/tests/playback/handoff.test.ts` at the new path. Delete `onDemandControl.ts`.
2. Add `frontend/src/playback/sinks/htmlElement.ts`: attach, set src, stop (pause + remove src + load), volume, wait-for-event. `htmlAudioSink.ts` and `radio/audio.ts` use it. Radio keeps `loadInFlight` / `seekInFlight` ignore policy and does not implement `PlaybackSink`. Delete public in-flight setters on radio audio if they exist only for tests that can use the ignore helpers.
3. Add `frontend/src/radio/runtime.ts` owning WebSocket connect/ack/reconnect, `radioGen`, `loadCurrent`, and Media Session writes. `stores/radio.ts` keeps the reactive face, `applySnapshot`, `tuneIn` / `tuneOut` / `setTabOpen` chrome API, and watches. Bind pause/error once at audio create, not on every `tuneIn`. Delete `exitToQueue`. Update `frontend/tests/stores/radio.test.ts`.
4. `setStreamCodec` in `frontend/src/stores/settings.ts` only persists and calls `prepareTracks` (plus today’s exclusive prepare short-circuit). Delete `StreamChangeCtx.playIndex` and `ApplyStreamOpts.playIndex`. `player.ts` watches the active stream codec while `activeSession() === "queue"` and `playIndex`es the current row when the tag changes. Radio watches while chrome is active and calls today’s `onStreamProfileChanged` body. `SettingsModal.vue` stops branching on `radioChromeActive()` for `playIndex`.
5. Map `GET /api/codecs` to camelCase (`bitrateKbps`, `bitDepth`, `sampleRate`) once in `settings.ts`. Change `ProfileMeta` in `qualityRank.ts` to those camel fields (tag-parse internals may keep local names). `playbackStatus.ts` and `PlaybackStatusLine.vue` read the camel fields. `ExclusiveFormat` stays snake until stage 07; `resolveAnyProfile` still reads those wire fields. Delete `as ProfileMeta[]` casts that existed to paper over the codec catalog. Update `frontend/tests/playback/qualityRank.test.ts`.
6. `LyricsOverlay.vue` emits `seek-fraction` (same units as the range input). `NowPlayingView` forwards it. Delete the `player.ts` import from the overlay. Radio may keep `lyricsSeekable=false` as the product rule, not as a hide for the import.
7. `playlist.removeIndices` returns `{ removedCurrent, nextIndex }`. `PlaylistView.vue` and `queueMenuItems.ts` call `playIndex` / `stopPlayback` themselves. Delete the injected function parameters.
8. In `playbackStatus.ts`, exclusive face/details run only when `state.session === "queue"` (same as today’s `!== "radio"` for enabled snaps). Extract exclusive detail rows as a helper. `NowPlayingFull.vue` builds `queuePlayState()` next to `radioPlayState()` with no `as` cast and no `void pl.index`.
9. `player.ts` in this stage: switch the session import, add the codec watch, do not edit `failCurrentLoad` / `intentForTrack` / `loadResolved`.

### Verify

- `pnpm --dir frontend test -- frontend/tests/stores/radio.test.ts frontend/tests/playback/handoff.test.ts frontend/tests/stores/settings.test.ts frontend/tests/stores/playlist.test.ts frontend/tests/playback/playbackStatus.test.ts frontend/tests/playback/qualityRank.test.ts frontend/tests/playlist/queueMenuItems.test.ts frontend/tests/playback/playIntent.test.ts`
- `pnpm --dir frontend typecheck`
- `rg -n "onDemandControl|exitToQueue|playIndex\\?:" frontend/src frontend/tests` is empty
- `rg -n "from \\\"@/stores/player\\\"" frontend/src/components/player/LyricsOverlay.vue` is empty
- `rg -n "bitrate_kbps" frontend/src/stores/settings.ts` is empty (server JSON is mapped at the fetch)

## Acceptance

- `playback/session.ts` exists. `onDemandControl.ts` is gone.
- `radio/runtime.ts` owns the socket, load generation, and Media Session writes. `exitToQueue` is gone.
- One HTML-element helper. Radio is not a `PlaybackSink`.
- Settings does not take `playIndex`. Player restarts on-demand; radio re-tunes.
- Lyrics overlay does not import `player.ts`.
- `removeIndices` does not take player functions.
- Codec catalog on the settings store is camelCase.
- Tune-in, exclusive refuse, and queue/radio handoff behave as today.
