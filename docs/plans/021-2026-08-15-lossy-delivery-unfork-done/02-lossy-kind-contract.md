# Stage 02: lossyKind contract

## Status
done

## Description

Fix the client kind union and make `lossyKind.js` the only place that names MP3/AAC/lossy for marks and status. `kindForTrack` returns `mp3` | `aac` | `lossy` | `null`. Details rows use `formatLossyCodecText`. JSDoc matches the exports.

## Rationale

Stage 01 deletes a fork; this stage stops the next one. `'mixed'` on a single track is a type lie. Status details currently rebuild codec labels beside `formatLossyCodecText`.

## Invariants

- `kindForTrack`: `mp3` | `aac` | `lossy` | `null`. Never `'mixed'`.
- `kindForAlbum`: `mp3` | `aac` | `mixed` | `null` (API roll-up only).
- `kindForTracks`: if the set of track kinds is empty → null; one kind → that kind (`lossy` allowed); more than one → `'mixed'`.
- `LossyMark` icons: `mp3` → `fmt-mp3`, `aac` → `fmt-aac`, `lossy` and `mixed` → `fmt-lossy`.
- Details “Source file” row value is still exactly `LOSSY_SOURCE_COPY`.
- `lossySourceParts(track)` returns `{ label: string|null, bitrateKbps: number }` (`label` is `MP3` / `AAC` / uppercased kind / `null`; `bitrateKbps` is `0` when unknown).
- `formatLossyCodecText` is only `lossySourceParts` plus the existing face string (`MP3 320k` or `MP3`). Status line keeps calling `formatLossyCodecText`.
- Details Codec / Bitrate rows read `lossySourceParts` — no local `kind === "mp3" ? "MP3"` chain.
- No sprite redraw.

## Risks

- Mapping only `'mixed'` to the generic icon leaves unknown-codec tracks unmarked after `kindForTrack` stops returning `'mixed'`. `LossyMark` must map `'lossy'` in the same stage.

## Implementation

### Files

- Change `src/musicweb/static/js/lossyKind.js`
- Change `src/musicweb/static/js/components/lossy/LossyMark.js`
- Change `src/musicweb/static/js/playbackStatus.js`

### Steps

1. Rewrite `lossyKind.js` so each export has one JSDoc immediately above it. Delete stacked leftover comments.
2. Add `lossySourceParts(track)`. Implement `formatLossyCodecText` as a thin string over that (same face as today: `MP3 320k` / `MP3`).
3. `kindForTrack`: lossy + `mp3`/`aac` → that kind; lossy + anything else → `'lossy'`; not lossy → `null`.
4. `LossyMark` `ICONS`: add `lossy: "fmt-lossy"`; keep `mixed: "fmt-lossy"`.
5. `buildPlaybackDetailsRows` lossy branch: Codec = `parts.label`; Bitrate row only when `parts.bitrateKbps > 0` (`${n} kbps`); Source file = `LOSSY_SOURCE_COPY`.
6. Do not change album API `lossy_kind` values. No new pytest file.

### Verify

- `rg "mixed" src/musicweb/static/js/lossyKind.js` — only `kindForAlbum` / `kindForTracks`.
- `rg "MP3"|'AAC' src/musicweb/static/js/playbackStatus.js` — no new hand-rolled label chain in the lossy details branch.
- `uv run --group dev pytest`

## Acceptance

- [x] Track kind union is `mp3|aac|lossy|null`. Album mixed unchanged.
- [x] Unknown-codec lossy tracks still show the generic mark.
- [x] Details and status share one formatter for source codec text.
- [x] `lossyKind.js` JSDoc is one-to-one with exports.
