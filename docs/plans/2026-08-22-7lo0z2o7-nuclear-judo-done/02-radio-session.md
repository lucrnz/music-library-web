# Stage 02: Radio session

## Status
done

## Description

Radio keeps its own `HTMLAudioElement` but implements `PlaybackSink`. Face + `loadCurrent` move to `radio/session.ts`. `runtime.ts` is socket only. Delete `RadioRuntimeHost`. Radio does not go through `loadResolved`.

## Rationale

Radio is a parallel player glued by a host bag. Making the element a sink and splitting socket from face/load deletes the cycle without sharing the queue element (seek-ignore and preload stay as today).

## Invariants

- Two HTML elements remain (queue `htmlSink` + radio).
- Load/seek-in-flight still ignore pause/ended/error (`shouldIgnoreTransport` / `shouldIgnorePause`).
- `become("radio" | "queue" | "none")` is still the session handoff. `player.ts` still does not import `radio.ts`.
- Tune-in / tune-out / reconnect / interpolated seek / failure-cap tune-out stay the same.

## Risks

- `PlaybackSink.seek` is synchronous; radio’s public `seek` stays async and waits for `seeked` before `play`. Do not change that sequence.
- Moving Media Session writes with `loadCurrent` can double-register handlers if `runtime.ts` is not fully stripped. One writer in `radio/session.ts`.

## Implementation

### Files

- frontend/src/radio/audio.ts
- frontend/src/radio/session.ts
- frontend/src/radio/runtime.ts
- frontend/src/stores/radio.ts
- frontend/src/playback/sinks/types.ts
- frontend/src/playback/session.ts
- frontend/tests/radio/audio.test.ts
- frontend/tests/radio/session.test.ts
- frontend/tests/stores/radio.test.ts

### Steps

1. Implement `PlaybackSink` on `createRadioAudio()` in `audio.ts` (`kind: "htmlAudio"`). Keep `RadioAudio`’s async `load` / `seek` / `play` and the ignore-during-seek latches. Do not change `PlaybackSink.seek` to async.
2. Add `frontend/src/radio/session.ts`. Move `onFaceOrTrack`, `loadCurrent`, `writeRadioMediaSession`, load-generation, and `clearLoadedKeys` / `bumpRadioGen` out of `runtime.ts`. Session reads chrome from `stores/radio.ts` and calls `tuneIn` / `tuneOut` there. It uses the radio `PlaybackSink` / `RadioAudio` for load-seek-play.
3. Shrink `runtime.ts` to WebSocket open/close/send/recv, reconnect, tune-ack, and snapshot dispatch into `applySnapshot`. Delete `RadioRuntimeHost` and `initRadioRuntime`. Runtime may import the chrome store for `connected` / `socketRequired` predicates; it must not load audio or write Media Session.
4. `stores/radio.ts`: drop the `initRadioRuntime({...})` host bag. Wire session + runtime at store init. Keep chrome fields and `radioPlayState()`.
5. `playback/session.ts`: no new exclusive/radio flags. `become("radio")` still suspends on-demand Media Session so radio session can install its handlers.
6. Extend `frontend/tests/radio/audio.test.ts` if the sink surface needs a latch test. Add `frontend/tests/radio/session.test.ts` for face → load / idle → tuneOut / gen stale-guard (mock audio). Update `frontend/tests/stores/radio.test.ts` so it does not construct `RadioRuntimeHost`.

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test -- tests/radio/audio.test.ts tests/radio/session.test.ts tests/radio/failures.test.ts tests/radio/sync.test.ts tests/stores/radio.test.ts tests/playback/handoff.test.ts`

## Acceptance

- `rg -n "RadioRuntimeHost|initRadioRuntime" frontend/src` is empty.
- `rg -n "createRadioAudio|HTMLAudioElement" frontend/src/radio/audio.ts` still shows a radio-owned element (not the queue sink).
- `rg -n "loadCurrent|writeRadioMediaSession|onFaceOrTrack" frontend/src/radio/runtime.ts` is empty.
- `rg -n "loadResolved" frontend/src/radio` is empty.
- Radio latch tests still pass. New session tests cover load-then-seek-then-play and stale gen.
- Typecheck is clean.
