# Stage 03: Radio companion audio

## Status
done

## Description

Give `createRadioAudio()` a companion backend (mpv via `companionClient`) while defaulting to today’s HTML element. Mute the idle queue `companionSink` so radio time events do not leak into the queue player. Session still loads HTML until stage 04.

## Rationale

Radio cannot share the queue `companionSink` handler slot (`player.ts` leaves those handlers attached after teardown). Exclusive radio needs load / wait-for-duration / seek / play / stop / volume with the same live getters HTML already has.

## Invariants

- `createRadioAudio()` still returns one object with live getters (`currentTime`, `paused`, `ended`, `loadInFlight`, `seekInFlight`) plus `sink`. Do not object-spread that object.
- Default backend is HTML. `setBackend("htmlAudio" | "companion")` stops the previous backend’s transport (HTML `stopHtmlAudio` or `companionStop`) and updates `sink.kind`.
- Companion `load(url)`: `ensurePreferredDevice({ timeoutMs: 1500 })`, then `companionLoad(url)`, then wait until a time event reports `d > 0` or reject after `RADIO_LOAD_TIMEOUT_MS`. Failures are `PlayBlockError` with the gate reason or `exclusive_not_ready`.
- Companion `seek(seconds)`: if duration is not yet known, wait as in load (same timeout). Then `companionSeek`. Set `seekInFlight` around the wait + seek. Do not no-op when duration is 0 (that is the queue sink bug for radio).
- Companion `play` / `stop` / `setVolume` map to `companionResume` / `companionStop` / `companionSetVolume(v * 100)`. Pause-on-ended and load/seek latches (`shouldIgnorePause` / `shouldIgnoreTransport`) still apply to companion pause/eof events.
- `currentTime` / `duration` / `paused` / `ended` on the companion backend come from `onCompanionEvent` (`time` / `pause` / `eof`), not `radioAudio.el`.
- Queue `companionSink` ignores `time`, `pause`, `eof`, and `error`/`disconnect` when `hasLoad` is false.
- Radio session is unchanged (still HTML `load`).

## Risks

- Two `onCompanionEvent` subscribers (queue sink + radio). If the queue sink still forwards `time` while idle, queue now-playing position tracks radio. The `hasLoad` mute is mandatory.
- Companion `load` is fire-and-forget on the wire; the duration wait is the only “canplay”. A hung mpv hits the 8 s timeout and stage 04 rejoin.
- Do not import `player.ts` or `playback/load.ts` from `radio/audio.ts`. Import `companionClient` + `PlayBlockError` only.

## Implementation

### Files

- `frontend/src/radio/audio.ts`
- `frontend/src/playback/sinks/companionSink.ts`
- `frontend/tests/radio/audio.test.ts`

### Steps

1. In `frontend/src/playback/sinks/companionSink.ts`, at the top of the `onCompanionEvent` callback, `return` when `!hasLoad` (all event types). Keep `ensureListen` as-is.
2. In `frontend/src/radio/audio.ts`, add `setBackend(kind: "htmlAudio" | "companion"): void`. Track `backend`. HTML path stays. Companion path: subscribe `onCompanionEvent` once while companion is the backend; unsubscribe on switch back to HTML or on a module teardown if you add one. Implement load / seek / play / stop / setVolume / getters per Invariants. `sink.kind` follows `backend`. `sink.load` / `seek` / `setVolume` call the same radio methods (seek on the sink may stay fire-and-forget for HTML; companion radio **`seek` used by `session.ts` is `radioAudio.seek`**, which must wait).
3. Keep `el` as the HTML element (may be unused while companion). Do not delete `el`; stage 04 stops reading `el.duration` for reseek.
4. In `frontend/tests/radio/audio.test.ts`, mock `@/exclusive/companionClient` (`ensurePreferredDevice`, `companionLoad`, `companionSeek`, `companionStop`, `companionResume`, `companionSetVolume`, `onCompanionEvent`). Cases: default `sink.kind === "htmlAudio"` (existing); `setBackend("companion")` then `sink.kind === "companion"`; companion `load` waits until the mocked listener gets `{ type: "time", d: 123 }` and then resolves; companion `load` rejects after `RADIO_LOAD_TIMEOUT_MS` if no duration; `ensurePreferredDevice` `{ ok: false, reason: "exclusive_needs_device" }` rejects with that reason; `seek` after duration calls `companionSeek` with that second; getters stay live (not data properties); HTML tests still pass.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/radio/audio.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- HTML radio audio tests still pass (default backend).
- Companion backend load/seek/timeout/device-gate are covered with a mocked client.
- Getters remain getters after `setBackend("companion")`.
- `companionSink` does not apply events when `hasLoad` is false (read the guard; no new sink test file).
- Session tests still pass if run (HTML load path untouched).
- `pnpm --dir frontend typecheck` passes.
