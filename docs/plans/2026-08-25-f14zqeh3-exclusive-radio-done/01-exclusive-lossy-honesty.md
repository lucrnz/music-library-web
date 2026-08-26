# Stage 01: Exclusive-lossy honesty

## Status
done

## Description

Stop exclusive-lossy from looking like an exclusive FLAC track. Skip prepare POST of `source`, do not fire the missing-tech toast on lossy/source, and show source-format detail rows instead of **Profile: source**. Play path stays as shipped (mpv still loads `codec=source` or a locker file).

## Rationale

Queue exclusive lossy already plays AS IS. The remaining gap is honesty: exclusive prepare groups by `profileFor` and POSTs `source`, missing tech toasts “using device max” on typical MP3 (`bitDepth` null), and details render a fake exclusive profile. Radio exclusive will inherit these rows.

## Invariants

- `prepareTracks` companion branch does not call `requestPrepare` when `profileFor(track)` is null or `SOURCE_TAG` (`"source"`).
- `shouldWarnMissingExclusiveTech` is false when `track.isLossy` is true, or when sample rate and bit depth are both present. `loadResolved` only toasts when that helper is true **and** `consumeMissingTechToast` returns true.
- Exclusive details (`exclusiveDetailRows`) for a lossy track (or `playProfileId === "source"`) omit the Profile / exclusive-formats bit-depth / sample-rate rows and include the same Codec / Bitrate / Encoding / file sample rate / Source file rows as HTML lossy details. Output Exclusive and Device stay.
- `exclusive_lossy` and the companion `codec=source` play intent are unchanged.

## Risks

- `load.ts` is not unit-tested (see `docs/development/testing.md`). The toast gate must live in a pure helper that a node test can import.
- Status tests still have an exclusive+lossy fixture with `playProfileId: "flac_24_96000"`. That case is remux-era and must be rewritten to `source` / `isLossy: true`.

## Implementation

### Files

- `frontend/src/playback/prepare.ts`
- `frontend/src/playback/load.ts`
- `frontend/src/stores/exclusiveAudio.ts`
- `frontend/src/playbackStatus.ts`
- `frontend/tests/playback/prepare.test.ts`
- `frontend/tests/playback/playbackStatus.test.ts`
- `frontend/tests/exclusive/missingTech.test.ts`

### Steps

1. In `frontend/src/stores/exclusiveAudio.ts`, add `shouldWarnMissingExclusiveTech(track)` that returns false when `!track` or `track.isLossy`, else true when `sampleRateHz == null || bitDepth == null`.
2. In `frontend/src/playback/load.ts`, wrap the existing missing-tech toast so it also requires `shouldWarnMissingExclusiveTech(track)`.
3. In `frontend/src/playback/prepare.ts` companion `byTag` loop, `continue` when `!tag` **or** `tag === SOURCE_TAG` (import `SOURCE_TAG` from `@/lossyKind`).
4. In `frontend/src/playbackStatus.ts` `exclusiveDetailRows`, when `state.track?.isLossy` or `state.playProfileId === "source"`, skip the Profile / exclusive-catalog depth / rate block and append the existing HTML lossy Codec / Bitrate / Encoding / file sample rate / Source file rows (reuse `lossySourceParts` / `LOSSY_SOURCE_COPY` / `KNOWN_BITRATE_MODES` already in this file). Keep Output Exclusive, Device, Control, Reason.
5. In `frontend/tests/playback/prepare.test.ts`, add: exclusive `profileFor` returns `"source"` for a lossy id → `fetch` is not called (or no body with `codec: "source"`). Keep the lossless tag-grouping case.
6. In `frontend/tests/playback/playbackStatus.test.ts`, replace `"does not add lossy encoding rows in exclusive mode"` with: exclusive + lossy + `playProfileId: "source"` lists Output Exclusive and the lossy source-format keys, and does **not** list Profile `source`. Keep a lossless exclusive case that still lists Profile + bit depth + sample rate.
7. Add `frontend/tests/exclusive/missingTech.test.ts`: lossy → false; lossless missing rate or depth → true; lossless with both → false.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/playback/prepare.test.ts frontend/tests/playback/playbackStatus.test.ts frontend/tests/exclusive/missingTech.test.ts
pnpm --dir frontend typecheck
```

On a Mac with exclusive armed, play an indexed MP3: no “source format unknown — using device max” toast, Playback details show MP3 / bitrate (not Profile: source), network tab has no `POST /api/transcode/prepare` with `codec=source` for that id.

## Acceptance

- Exclusive prepare does not POST `source`.
- Exclusive+lossy details are source-format rows plus Output Exclusive; not Profile: source.
- Missing-tech toast helper is false for lossy.
- Queue exclusive lossy still resolves to companion + `codec=source` (existing `playIntent` tests still pass if run).
- `pnpm --dir frontend typecheck` passes.
