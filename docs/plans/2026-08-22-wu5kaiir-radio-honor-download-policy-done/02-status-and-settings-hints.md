# Stage 02: Status line and Settings hints

## Status
done

## Description

Make the tuned radio room tell the truth about play source, and make the existing **When a download exists** hints say the policy applies to radio. No second resolve path.

## Rationale

Stage 01 already stores delivery on `radio`. Until `radioPlayState()` reads it, the room still says Streaming while the bytes are local. Until the Settings hints mention radio, the 4G use case stays undiscoverable.

## Invariants

- `radioPlayState()` uses `radio.playSource` when it is `"streaming"` or `"downloaded"`; otherwise `"streaming"` (stopped / not yet loaded). `session` stays `"radio"`.
- Lossy: `playProfileId` remains `null` so `PlaybackStatusLine` keeps using the track’s source-format fields. The source **word** still follows `playSource` (`Downloaded` vs `Streaming`).
- Lossless downloaded: `playProfileId` is the catalog file’s codec, not the tuner profile, when they differ.
- Compact bar and `RadioMini` still do not mount a codec line (`RadioNowPlaying` `show-status` stays room + `tuned` only).
- Exclusive snap stays ignored for `session === "radio"`.
- Settings labels stay the same three options. Only `hint` strings change, and they stay on `PLAYBACK_POLICIES` (the modal already renders those hints).

## Risks

- A hardcoded `"streaming"` fallback when `playSource === "none"` can still lie if the room ever shows status off `tuned`. Do not widen `show-status`; do not invent a fourth source word.

## Implementation

### Files

- `frontend/src/stores/radio.ts`
- `frontend/src/stores/settings.ts`
- `frontend/tests/stores/radio.test.ts`
- `frontend/tests/stores/settings.test.ts`
- `frontend/tests/playback/playbackStatus.test.ts`

### Steps

1. In `frontend/src/stores/radio.ts`, change `radioPlayState()` so `playSource` is `radio.playSource` when that value is `"streaming"` or `"downloaded"`, else `"streaming"`. `playProfileId` stays `null` when `radio.isLossy`; otherwise `radio.playProfileId || radio.tunerProfile || getActiveStreamCodec()`.
2. In `frontend/tests/stores/radio.test.ts`, keep the existing lossless streaming assertion. Add: set `radio.playSource = "downloaded"` and `radio.playProfileId` to a catalog tag different from `tunerProfile`; expect `radioPlayState().playSource === "downloaded"` and `playProfileId` to be that catalog tag. Lossy + downloaded still has `playProfileId === null`.
3. In `frontend/tests/playback/playbackStatus.test.ts`, add a radio + downloaded lossless case (`session: "radio"`, `playSource: "downloaded"`, a profile id) that `formatPrimaryStatus` starts with `"Downloaded ·"` and `buildPlaybackDetailsRows` source is `"Downloaded"`. Keep the existing radio-ignores-exclusive test.
4. In `frontend/src/stores/settings.ts`, set `PLAYBACK_POLICIES` hints to exactly:
   - `prefer_better`: `Use a download when it’s at least as good as streaming quality; otherwise stream. Applies to queue play and radio.`
   - `prefer_offline`: `Always play the on-device file when present, including on radio.`
   - `prefer_stream`: `Stream when online; use downloads only offline. Applies to queue play and radio.`
5. In `frontend/tests/stores/settings.test.ts`, assert each of those three `id`s has a `hint` that mentions `radio` (case-insensitive). Do not add a second Settings field.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/stores/radio.test.ts frontend/tests/stores/settings.test.ts frontend/tests/playback/playbackStatus.test.ts frontend/tests/radio/session.test.ts
pnpm --dir frontend typecheck
```

On a running app: Tune in on `/radio` to a downloaded track with **Prefer downloaded file** and confirm the room line is `Downloaded · …`. Flip to **Prefer live stream when online** and confirm it becomes `Streaming · …`. Open Settings and read the three hints. At a desktop width and a mobile width, confirm compact / mini still have no codec line.

## Acceptance

- `radioPlayState()` reports `downloaded` + local profile (lossy profile still `null`).
- Playback-status tests cover radio + `Downloaded`.
- All three `PLAYBACK_POLICIES` hints mention radio; labels unchanged.
- `pnpm --dir frontend typecheck` passes.
- Browser: room line and Settings hints match the cases above; compact/mini codec line still absent.
