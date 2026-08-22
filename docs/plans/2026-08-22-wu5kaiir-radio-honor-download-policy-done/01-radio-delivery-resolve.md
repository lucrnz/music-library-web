# Stage 01: Radio delivery resolve

## Status
done

## Description

Route radio `loadCurrent` through `resolvePlaySource` so the existing **When a download exists** policy picks OPFS vs `/api/stream`. Seek the chosen URL to the official clock. Remint a failed local blob to stream (and mark it broken). Watch the policy while tuned and re-resolve. Keep household `tune_in` / prepare unchanged.

## Rationale

Until `loadCurrent` stops hardcoding `streamUrl`, radio cannot save mobile data and the setting is a lie for the 4G case that motivated this plan. Status copy and docs have nothing true to report before this lands.

## Invariants

- `loadCurrent` does not call `resolvePlayIntent` or import `player.ts`.
- Resolve context while chrome is `tuning` / `tuned`: `enabled: downloads.enabled`, `offline: false`, `activeStreamCodec` = `streamCodecForLoad()`, `playbackPolicy` / `catalog` from settings.
- `streamCodecForLoad()` stays `SOURCE_TAG` when `radio.isLossy`, else `radio.tunerProfile || getActiveStreamCodec()`.
- Successful load writes `radio.playSource` (`"streaming"` | `"downloaded"`) and `radio.playProfileId` (lossy: `null`; lossless downloaded: catalog codec; lossless streaming: tuner profile).
- Tune out, leave radio, catching_up / skip_pending stop, remint, and `resetRadioStore` revoke any radio blob URL and set `playSource` back to `"none"` (reset also clears `playProfileId`).
- Local play/open failure: `markTrackBroken`, revoke, same `radioGen`, load `streamUrl(track, streamCodecForLoad())`. Do not tune out if that stream load succeeds.
- `onPlaybackPolicyChanged` runs only when chrome is `tuning` or `tuned`: `bumpRadioGen`, `clearLoadedKeys`, `onFaceOrTrack(null)`. `stopped` / `inactive` is a no-op.
- `onStreamProfileChanged` still re-sends `tune_in` for any active chrome; lossless `tuning` / `tuned` still reloads. After reload, delivery is whatever policy says now.
- `maybeReseek` does not fire when `el.duration` is finite and `interpolatedPosition() >= el.duration`.
- `tune_in` payload and server prepare are untouched.

## Risks

- A downloaded transcode shorter than `officialDuration` can make `|heard − official| > 2` forever. The `el.duration` skip above is the mitigation; do not “fix” it by stretching or re-encoding on the client.
- Mocking `resolvePlaySource` in session tests can hide a wrong `offline` / `activeStreamCodec`. Assert the context object, not only the URL `load` received.
- Revoking a blob while `HTMLAudioElement` still has it as `src` can error on the next `stop`. Revoke after `radioAudio.stop()` / after a new `load` has replaced `src`, matching `playback/load.ts` order.

## Implementation

### Files

- `frontend/src/radio/session.ts`
- `frontend/src/stores/radio.ts`
- `frontend/tests/radio/session.test.ts`
- `frontend/tests/stores/radio.test.ts`

### Steps

1. In `frontend/src/stores/radio.ts`, add `playSource: "none" | "streaming" | "downloaded"` (default `"none"`) and `playProfileId: string | null` (default `null`) to `RadioStore`. Reset both in `resetRadioStore`. Leave `radioPlayState()` hardcoded to `"streaming"` in this stage (stage 02 flips it).
2. In `frontend/src/radio/session.ts`, keep a module-level radio blob URL. Export `revokeRadioLocalUrl()` that `URL.revokeObjectURL`s it. Call it from `clearLoadedKeys` after any in-flight generation bump the callers already do, and from the remint path. Import `resolvePlaySource` from `@/downloads/resolve`, `downloads` from `@/downloads/state`, `markTrackBroken` from `@/downloads/catalog`, and `settings` from `@/stores/settings`.
3. Split `loadCurrent` so `++radioGen` happens once, then an inner load (same gen) can remint. Inner load: if `localBroken`, `streamUrl` + `streamCodecForLoad()` as streaming; else `resolvePlaySource` with the invariant context. Unavailable + `countsAsFailure` keeps today’s failure-cap / tune-out. On downloaded `load`/`play` rejection and `!localBroken`, `markTrackBroken(track.id)`, revoke, remint with `localBroken: true`. On success, set `radio.playSource` / `radio.playProfileId` as in Invariants, then the existing seek → play → `lastLoaded*` → `chrome = "tuned"` sequence.
4. In `maybeReseek`, if `radioAudio.el` exists, `el.duration` is finite and `> 0`, and `interpolatedPosition() >= el.duration`, return without seeking.
5. In `frontend/src/stores/radio.ts`, export `onPlaybackPolicyChanged` per Invariants. In `bindVolumeWatch`, watch `settings.playbackPolicy` and call it (do not add this watch to `player.ts`).
6. In `frontend/tests/radio/session.test.ts`, mock `resolvePlaySource` and `markTrackBroken`. Default the resolve mock to a streaming URL for the given `activeStreamCodec` so the existing load-order test still passes, but assert `resolvePlaySource` was called with `offline: false` and that codec. Add cases: (a) downloaded blob URL is what `radioAudio.load` receives and `radio.playSource === "downloaded"`; (b) downloaded `load` rejection calls `markTrackBroken` and a second `load` with `/api/stream`; (c) stale `radioGen` still skips seek/play after a downloaded resolve.
7. In `frontend/tests/stores/radio.test.ts`, add `onPlaybackPolicyChanged` cases: `tuned` + current track clears loaded keys and ends in a new `loadCurrent` attempt; `stopped` does not call `radioAudio.load`. Assert `resetRadioStore` sets `playSource` to `"none"`.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/radio/session.test.ts frontend/tests/stores/radio.test.ts frontend/tests/radio/audio.test.ts
pnpm --dir frontend typecheck
```

On a running app with Downloads enabled and at least one catalogled lossless track that the station can pick (or inject via `musicweb radio` if you need a known id): set **Prefer downloaded file**, Tune in when that id is current, confirm the element `src` is a `blob:` URL (not `/api/stream`) and the seek bar sits on the official clock. Flip to **Prefer live stream when online** and confirm it reloads `/api/stream` without Tune out. Break is not required in the browser if the remint unit test covers it.

## Acceptance

- Session tests prove streaming (policy miss or default), downloaded, remint-to-stream, and stale-gen paths.
- `resolvePlaySource` is invoked with `offline: false` and `streamCodecForLoad()` as `activeStreamCodec`.
- Policy change while `tuned` reloads; while `stopped` it does not.
- `pnpm --dir frontend typecheck` passes.
- Browser: prefer-download Tune-in uses a blob and stays on the clock; prefer-stream mid-tune switches to `/api/stream`.
