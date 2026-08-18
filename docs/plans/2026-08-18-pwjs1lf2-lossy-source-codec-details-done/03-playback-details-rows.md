# Stage 03: Playback details rows

## Status
done

## Description

Map `bitrate_mode` and source sample rate through the client `Track` and download catalog, then add Encoding and Sample rate rows to the existing lossy Playback details list. Status-line formatters stay as they are.

## Rationale

`PlaybackDetailsBody` already renders a row list. The gap is the lossy early-return in `buildPlaybackDetailsRows` plus catalog projection dropping `sampleRateHz`. This stage is the user-visible payoff; Vue chrome does not change.

## Invariants

- Lossy details row order: Source → Codec → Bitrate → Encoding → Sample rate → Source file. Omit Bitrate / Encoding / Sample rate independently when the value is missing.
- Encoding values are `CBR`, `VBR`, `ABR` (uppercase of the stored token). Unknown / null / other strings omit the row — do not print the raw token.
- Sample rate uses the existing `formatSampleRate` helper on `track.sampleRateHz` (file rate, not a stream profile).
- Status line still uses `formatLossyCodecText` only (codec + bitrate). No mode or rate on the face.
- `fromApiTrack` reads `bitrateMode` / `bitrate_mode`. `fromCatalogRecord` passes `sampleRateHz` and `bitrateMode` through (today it drops sample rate).
- Catalog commit and `QueueTrackSnapshot` store `sampleRateHz` and `bitrateMode` so a downloaded original still has the rows offline.
- `PlayStatusState.track` is `Pick<Track, "isLossy" | "sourceCodec" | "bitrateKbps" | "sampleRateHz" | "bitrateMode">`. Do not grow an anonymous optional-field object. Do not import `player.ts` from tests.
- Exclusive branch and lossless profile rows stay unchanged.

## Risks

- Older IDB catalog rows and in-memory queue tracks lack the new fields until the track is fetched or re-downloaded. Omit those rows; do not migrate IDB.

## Implementation

### Files

- Change: `frontend/src/models/track.ts`
- Change: `frontend/src/downloads/catalog.ts`
- Change: `frontend/src/downloads/queue.ts`
- Change: `frontend/src/playbackStatus.ts`
- Change: `frontend/tests/models/track.test.ts`
- Create: `frontend/tests/playback/playbackStatus.test.ts`

### Steps

1. Add `bitrateMode: string | null` to `Track`. Map it in `fromApiTrack` (`bitrateMode` / `bitrate_mode`). In `fromCatalogRecord`, pass `sampleRateHz` and `bitrateMode` into `fromApiTrack`. Do not add `bitDepth` to the catalog contract.
2. Extend `CatalogTrackRecord` and the catalog write in `catalog.ts` with `sampleRateHz` and `bitrateMode` from the normalized track.
3. Extend `QueueTrackSnapshot` and the snapshot object in `queue.ts` the same way so a refresh-fail commit still has the fields.
4. Replace the anonymous `PlayStatusState.track` type with the `Pick<Track, …>` in Invariants. In the lossy branch of `buildPlaybackDetailsRows`, after the bitrate row: push Encoding when mode is `cbr`/`vbr`/`abr`; push Sample rate when `formatSampleRate(track.sampleRateHz)` is non-null; then the existing source-file row.
5. `fromApiTrack` tests: snake_case `bitrate_mode` + `sample_rate_hz`; `fromCatalogRecord` round-trip of both fields.
6. `buildPlaybackDetailsRows` tests (lossy streaming and downloaded):
   - MP3 + bitrate + `vbr` + 44100 → Codec, Bitrate `320 kbps`, Encoding `VBR`, Sample rate `44.1 kHz`, Source file
   - AAC + bitrate + null mode + missing rate → Codec, Bitrate, Source file only
   - `abr` → `ABR`; unknown string → no Encoding row
   - lossless / exclusive fixtures still omit the new lossy rows
7. Do not edit `PlaybackStatusLine.vue` / `PlaybackDetailsBody.vue` unless a type import requires it. `pl.current` is already the full `Track`.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend test
```

## Acceptance

- [ ] Lossy Playback details shows Encoding and Sample rate when those fields are present, in the order above.
- [ ] Missing mode or rate omits that row only.
- [ ] Status line text is unchanged (`Streaming · MP3 320k` when bitrate exists).
- [ ] Catalog / queue snapshot retain `sampleRateHz` and `bitrateMode`.
- [ ] Node tests cover the formatter cases; no `player.ts` import; no Vue/browser test required.
