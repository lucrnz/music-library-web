# Stage 05: Client play of source audio

## Status
pending

## Description

Play lossy tracks as `source`: skip prepare, ignore quality prefs, probe mp3/aac decode support, show `Streaming · MP3 320` (or AAC) on the status line, and fail exclusive / unsupported-decode as unavailable.

## Rationale

Stage 04 only helps if the player requests `source`. Without this stage the SPA still sends Opus/FLAC tags and gets `409`, so indexed lossy albums are unplayable.

## Invariants

- Lossless play, prepare, quality prefs, and exclusive FLAC tags are unchanged.
- Lossy play always uses `streamUrl(track, "source")` regardless of Wi‑Fi / cellular setting.
- `requestPrepare` is not called for a lossy track (near-end urgent included).
- Exclusive enabled + lossy current track → `unavailable` / `exclusive_lossy`. No companion load, no HTML fallback this plan.
- mp3/aac families are probed like Opus/FLAC. Failed family → `unavailable` / `codec_unsupported` before `load()`.
- Play `error` on a lossy original → `unavailable` / `codec_unsupported` (or existing `play_failed` if that path already covers it — prefer a dedicated reason so the copy is honest).
- Status face for a playing lossy track: `Streaming · MP3 320` / `Downloaded · AAC 256`. Omit the number when `bitrateKbps` is null. Never show the selected Opus/FLAC profile.
- Playback details include a row whose value is exactly: `Lossy source — played as stored. Not a lossless file.`
- `GET /api/codecs` list and Settings pickers do not grow a `source` option.

## Risks

- Teaching `qualityRank` that `source` is “unknown = 0” would make `prefer_better` throw away a downloaded original. Stage 06 will persist the download; this stage must treat a lossy load as “the file is the file” and not rank `source` against Opus.
- `formatPrimaryCodecText(playProfileId)` today only knows opus/flac. Passing `source` as the profile id is not enough — the formatter needs the current track’s `sourceCodec` + `bitrateKbps`.
- Exclusive short-circuit must run before `playHtml` / `playExclusive` so we do not hog the device for an MP3.

## Implementation

### Files

- Change `src/musicweb/static/js/codecProbes.js` (mp3 + aac silent fixtures)
- Change `src/musicweb/static/js/codecSupport.js` (probe those families)
- Change `src/musicweb/static/js/playBlock.js` (`codec_unsupported`, `exclusive_lossy`)
- Change `src/musicweb/static/js/playbackStatus.js`
- Change `src/musicweb/static/js/stores/player.js`
- Change `src/musicweb/static/js/stores/playlist.js` (prepare helpers skip lossy)
- Change `src/musicweb/static/js/downloads/resolve.js` if the stream URL is chosen there
- Change `src/musicweb/static/js/components/player/PlaybackDetailsBody.js` only if it cannot render the new row from `playbackStatus` (prefer extending the helper, not the component)

### Steps

1. Add muted mp3 and aac fixtures to `CODEC_PROBES`. `supportsCodecKind("mp3"|"aac")` uses them. Settings catalog filtering stays opus/flac-only.
2. Helper `deliveryCodec(track)` → `"source"` if `track.isLossy`, else `getActiveStreamCodec()`. Use it in `playHtml`, resolve, and prepare gates.
3. `trackNeedsStreamPrepare` is false when `track.isLossy`.
4. Before exclusive load: if `track.isLossy`, set play source unavailable `exclusive_lossy` and return. Message: “Exclusive playback does not support lossy sources yet.”
5. Before HTML load: if `track.isLossy` and `supportsCodecKind(track.sourceCodec)` is false, unavailable `codec_unsupported`. Message: “This browser cannot decode this file.”
6. `formatPrimaryStatus` / details: if the current track (passed in or read from the playlist store) is lossy, codec text is `MP3 ${bitrate}k` / `AAC ${bitrate}k` / `MP3` / `AAC`. Details add `{ key: "lossy", label: "Source file", value: "Lossy source — played as stored. Not a lossless file." }` and do not list an Opus/FLAC profile row.
7. `playProfileId` for a successful lossy HTML load may be `"source"`; the face must still use the track fields, not `resolveProfileMeta("source")`.

### Verify

- `uv run --group dev pytest` (no JS runner; server tests still pass)
- `uv run musicweb`, flag on, mixed queue:
  - Lossy track plays in the browser as-is. Status is `Streaming · MP3 320` (or AAC / no number). Details show the exact lossy sentence and not “Opus 192k”.
  - Next lossless track still prepares and plays the selected profile.
  - Near-end prepare of a following lossy track does not hit `/api/transcode/prepare` for that id.
  - Cellular stream pref is Opus 128: playing a lossy track still requests `codec=source` (Network tab).
  - Exclusive enabled (Mac PWA): play a lossy track → Unavailable with the exclusive-lossy copy; companion does not start an encode. Play a lossless track still works.
  - DevTools: if you temporarily force the mp3 probe to fail, play is Unavailable with the decode copy.

## Acceptance

- [ ] Lossy play requests only `codec=source` and never prepares an encode.
- [ ] Status and details describe the source file, not the unused stream profile.
- [ ] Exclusive + lossy is unavailable; exclusive + lossless is unchanged.
- [ ] Unsupported mp3/aac family is unavailable. No transcode retry.
- [ ] Quality pickers and `/api/codecs` are unchanged.
