# Stage 05: Exclusive radio status

## Status
done

## Description

When exclusive is enabled, the radio room uses the exclusive primary face and exclusive details (lossy source-format rows from stage 01). Pass a real exclusive snap into `RadioNowPlaying` instead of `null`.

## Rationale

Stage 04 can play exclusive radio while the face still says Streaming · browser codec and the room forces `exclusive-snap="null"`. Status must match hog output.

## Invariants

- `formatPrimaryStatus` / `buildPlaybackDetailsRows` apply exclusive chrome when `exclusiveSnap?.enabled` and `session` is `"queue"` **or** `"radio"`. Session `"none"` still ignores the snap.
- Exclusive-off radio is unchanged: play-source line (`Streaming ·` / `Downloaded ·`), no Output Exclusive.
- Exclusive-on radio primary face is `formatExclusiveFace` (`Ready · {device}` / Needs device / …), never `Streaming · opus…`.
- Exclusive-on radio details: Output Exclusive + Device + stage 01 lossy rows when the official track is lossy; lossless exclusive tag rows when `playProfileId` is an exclusive tag.
- `radioPlayState()` still sets `session: "radio"`, still nulls `playProfileId` when `radio.isLossy`, and still reports real `playSource`. Lossless exclusive uses `radio.playProfileId` from stage 04 (exclusive tag or locker profile), not `tunerProfile` as a fallback when `playProfileId` is already set. Fallback to `tunerProfile` / Streaming only when exclusive is **off** and `playProfileId` is empty (today).
- `RadioNowPlaying` passes `exclusiveStatusSnapshot()` when `isExclusiveEnabled()`, else `null`. Compact / mini still have no codec line.

## Risks

- Flipping exclusive face on radio before stage 04 would lie. This stage assumes 04 already loads companion when exclusive is on.
- `radioPlayState()` must not invent an exclusive tag from `tunerProfile` while exclusive is on and `playProfileId` is still null (tuning). Empty profile + exclusive face is OK (Ready · device, details without Profile).

## Implementation

### Files

- `frontend/src/playbackStatus.ts`
- `frontend/src/stores/radio.ts`
- `frontend/src/components/radio/RadioNowPlaying.vue`
- `frontend/tests/playback/playbackStatus.test.ts`
- `frontend/tests/stores/radio.test.ts`

### Steps

1. In `frontend/src/playbackStatus.ts`, change the exclusive-face and exclusive-details gates from `state.session === "queue"` to `state.session === "queue" || state.session === "radio"`.
2. In `frontend/src/stores/radio.ts` `radioPlayState()`, keep lossy `playProfileId` null. When exclusive is off, keep today’s `playProfileId || tunerProfile || getActiveStreamCodec()` fallback. When exclusive is on, use `radio.playProfileId` only (no tuner/Streaming fallback). Import `isExclusiveEnabled`.
3. In `frontend/src/components/radio/RadioNowPlaying.vue`, replace `:exclusive-snap="null"` with a computed that returns `exclusiveStatusSnapshot()` when `isExclusiveEnabled()`, else `null`. Import from `@/stores/exclusiveAudio`.
4. In `frontend/tests/playback/playbackStatus.test.ts`, replace `"radio session ignores an enabled exclusive snap"` with: radio + exclusive enabled → primary face is exclusive (`Ready ·` / device name), details have Output Exclusive; radio + exclusive snap `enabled: false` still shows `Streaming · MP3 320k` and no Output Exclusive. Add exclusive-on radio lossless details with `playProfileId: "flac_24_96000"` → Profile / bit depth (use exclusiveFormats in opts). Exclusive-on radio lossy uses stage 01 rows.
5. In `frontend/tests/stores/radio.test.ts`, change `"radioPlayState is streaming with the tuner profile, never exclusive"` so exclusive-off still reports the tuner profile, and exclusive-on + `playProfileId: "flac_24_96000"` reports that tag (not the tuner profile). Mock `isExclusiveEnabled` as needed.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/playback/playbackStatus.test.ts frontend/tests/stores/radio.test.ts
pnpm --dir frontend typecheck
```

On a Mac: exclusive radio room shows **Ready · {device}** while tuned, details Output Exclusive + exclusive tag (lossless) or MP3/bitrate (lossy). Exclusive off: radio line is Streaming / Downloaded again.

## Acceptance

- Exclusive-on radio face is exclusive; exclusive-off radio face is play-source.
- Exclusive-on radio details match queue exclusive (including stage 01 lossy rows).
- `radioPlayState()` does not substitute the household tuner profile while exclusive is on.
- `RadioNowPlaying` no longer hardcodes `exclusive-snap="null"`.
- `pnpm --dir frontend typecheck` passes.
