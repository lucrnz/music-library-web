# Stage 04: Exclusive radio load

## Status
done

## Description

When exclusive is enabled, `loadCurrent` uses `exclusiveDelivery` and the companion radio backend, prepares the current exclusive FLAC tag, and hard-fails (stay `tuning`) when exclusive cannot arm or format. Household `tune_in` stays a browser codec.

## Rationale

This is the exclusive-radio feature. Stages 02–03 are unused until `loadCurrent` switches backend and URL.

## Invariants

- `loadCurrent` does not call `resolvePlayIntent` or import `player.ts`.
- `sendTuneIn` still sends `getActiveStreamCodec()` (browser-listed). Never exclusive tags, never `source`.
- When `isExclusiveEnabled()`: `radioAudio.setBackend("companion")`, then `exclusiveDelivery(track, { enabled: downloads.enabled, offline: false, exclusiveTag: getExclusiveProfileTag(track), activeStreamCodec: streamCodecForLoad(), playbackPolicy: settings.playbackPolicy, catalog: settings.options })`. Ready URL is what `radioAudio.load` receives. Unavailable → exclusive fail (below), not HTML remint.
- When exclusive is off: `radioAudio.setBackend("htmlAudio")` and today’s `resolveRadioDelivery`.
- Exclusive ready + lossless + `source === "streaming"` + non-null exclusive tag → `requestPrepare([track], tag, { urgent: true })` before or with load. Do not prepare lossy, `SOURCE_TAG`, or downloaded locker. Do not `drop_pending_prewarm`.
- Successful exclusive load writes `radio.playSource` and `radio.playProfileId` (lossy: `null`; lossless: exclusive tag or locker profile). Then seek(clock) → play → `tuned` as today.
- Local locker play failure while exclusive: `markTrackBroken`, remint through `exclusiveDelivery` with no locker (stream `source` / exclusive tag), same `radioGen`. Do not fall back to HTML.
- Exclusive fail reasons: `exclusive_needs_device` toast + `openSettings()`; `exclusive_readonly` toast; `exclusive_no_format` toast; `exclusive_not_ready` / other retryable load errors silent. All stay `tuning` and `scheduleRadioRejoin()`. Never `tuneOut()`.
- `maybeReseek` uses `radioAudio.duration` and `radioAudio.currentTime` (not `radioAudio.el`).
- `onPlaybackPolicyChanged` still re-resolves while `tuning` / `tuned`. Add `onExclusivePlaybackChanged` with the same chrome gate: exclusive enabled/formatMode/selectedDeviceId change re-resolves (backend may flip). `stopped` / `inactive` is a no-op. Watch those exclusive fields from `initRadioListeners()`, not from `connect()`.
- Tune out / leave / catch-up / skip-pending: `radioAudio.setBackend("htmlAudio")` or `stop()` the active backend; hog stays armed (`companionStop` only).

## Risks

- First exclusive Tune-in mid-track waits on exclusive encode + duration then seeks. That is accepted (`context/design.md`). Do not add upcoming-id prepare.
- Calling `setBackend("companion")` after queue teardown is required so radio does not load HTML into a hogged device.
- `getExclusiveProfileTag` needs a live/preferred device. Unarmed → `exclusive_no_format` or device gate from `radioAudio.load`. Prefer the load gate for “no device” (`exclusive_needs_device`) and `exclusive_no_format` only when armed but no tag.

## Implementation

### Files

- `frontend/src/radio/session.ts`
- `frontend/src/stores/radio.ts`
- `frontend/tests/radio/session.test.ts`
- `frontend/tests/stores/radio.test.ts`

### Steps

1. In `frontend/src/radio/session.ts`, import `exclusiveDelivery` from `@/playback/exclusiveDelivery`, `isExclusiveEnabled` / `getExclusiveProfileTag` from `@/stores/exclusiveAudio`, `requestPrepare` from `@/playback/prepare`, `SOURCE_TAG` (already), `PlayBlockError` / `isPlayBlockReason` from `@/playBlock`, `openSettings` from `@/stores/settings`, `showToast` from `@/stores/ui`. Do not import `player.ts` or `resolvePlayIntent`.
2. Split delivery: if `isExclusiveEnabled()`, companion path per Invariants; else existing HTML `resolveRadioDelivery`. On exclusive unavailable or `PlayBlockError` from `radioAudio.load`, call a small `failExclusiveTune(reason)` that applies the toast/Settings table then `failTuneIn()`.
3. After a successful exclusive lossless streaming resolve, `requestPrepare([track], tag, { urgent: true })` when `tag` is a non-`source` exclusive tag.
4. Change `maybeReseek` to read `radioAudio.duration` / `radioAudio.currentTime` instead of `radioAudio.el`.
5. In `frontend/src/stores/radio.ts`, export `onExclusivePlaybackChanged` (same chrome gate as `onPlaybackPolicyChanged`: bump gen, `clearLoadedKeys`, `onFaceOrTrack(null)`). In `initRadioListeners`, `watch` `() => [exclusiveAudio.enabled, exclusiveAudio.formatMode, exclusiveAudio.selectedDeviceId]` and call it. Import `exclusiveAudio` from `@/stores/exclusiveAudio` (store only; not `companionClient`).
6. On `leaveRadio` / `tuneOut` / `clearLoadedKeys` as needed, `radioAudio.setBackend("htmlAudio")` after `audio.stop()` so a later HTML radio (exclusive off) is not stuck on companion.
7. In `frontend/tests/radio/session.test.ts`, mock `exclusiveDelivery`, `isExclusiveEnabled`, `getExclusiveProfileTag`, `requestPrepare`, and `radioAudio.setBackend`. Cases: exclusive off → HTML resolve unchanged (`offline: false`); exclusive on + streaming exclusive URL → `setBackend("companion")`, `load` that URL, `requestPrepare` urgent with that tag, then seek + play; exclusive + lossy `source` URL → no `requestPrepare`; exclusive + locker downloaded → companion `load` of that URL, no prepare; exclusive unavailable `exclusive_needs_device` → no HTML `load`, rejoin scheduled; leftover HTML remint path still only runs when exclusive is off.
8. In `frontend/tests/stores/radio.test.ts`, add `onExclusivePlaybackChanged`: `tuned` reloads; `stopped` does not. Assert `sendTuneIn` still posts the browser Streaming codec while exclusive is enabled (mock `isExclusiveEnabled` true, `getActiveStreamCodec` still the tune_in body).

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/radio/session.test.ts frontend/tests/stores/radio.test.ts frontend/tests/radio/audio.test.ts
pnpm --dir frontend typecheck
```

On a Mac with exclusive armed and radio on air: Tune in — audio from the hog device, station clock (not 0:00). Lossy current → mpv URL contains `codec=source`. Flip exclusive off while tuned → HTML radio continues on the clock. Exclusive on + no device → Settings opens, chrome stays `tuning`, no browser audio.

## Acceptance

- Exclusive on: companion backend + exclusiveDelivery URL; tune_in codec still browser-listed.
- Exclusive lossless stream POSTs urgent prepare for the exclusive tag only; lossy/locker do not.
- Exclusive fail does not Tune out and does not load HTML.
- `maybeReseek` does not read `el.duration`.
- Exclusive toggle / format mode while `tuned` re-resolves; while `stopped` it does not.
- `pnpm --dir frontend typecheck` passes.
