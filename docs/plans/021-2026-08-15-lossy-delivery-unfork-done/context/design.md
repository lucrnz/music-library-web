> **Archive.** Decisions in this file were current as of 2026-08-15 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Lossy delivery un-fork

## Goal

Make the uncommitted plan-019 lossy work pass the thermo-nuclear bar: one play-source tree, one source-kind contract, no copied codec maps. Behavior stays the same.

## Settled decisions

- **`resolvePlaySource`:** normalize `active` to `"source"` when `track.isLossy`. Delete the 40-line `if (track.isLossy)` block. Do not extract a second tree.
- **`playHtml` still calls `deliveryCodec`.** Resolve also normalizes so a missed caller cannot 409. Two one-liners, one decision tree.
- **`kindForTrack`:** `mp3` | `aac` | `lossy` | `null`. `'mixed'` is album-only (`kindForAlbum` / `kindForTracks`). Unknown `sourceCodec` on a lossy track → `'lossy'` (generic icon), not `'mixed'`.
- **`LossyMark`:** map `lossy` and `mixed` to `fmt-lossy`.
- **Python codec map:** do **not** add a path-level `classify_source(path)` that formats and metadata both call — that re-opens MP4s on the walk. Extract public `mp4_kind(info) -> "alac" | "aac" | None` in `formats.py` (MP4-family `info` only). `_is_alac(path)` opens the file and uses it. `metadata._audio_tech_from_info` uses `mp4_kind(info)` and stops duplicating codec/desc checks.
- **`LOSSY_EXTENSIONS`:** use it in `is_lossy_audio`. Do not leave a dead set.
- **JS mime/ext:** `sourceFileMedia(sourceCodec)` lives in `lossyKind.js` only. `codecExt` / `codecMediaType` keep the two-arg call sites and delegate when `codec === SOURCE_TAG`. No `{ codec, sourceCodec }` record type. Catalog does not grow a second table.
- **Status + details:** `lossySourceParts(track) -> { label, bitrateKbps }`. `formatLossyCodecText` is `${label} ${bitrateKbps}k` or `label`. Details Codec/Bitrate rows use the same parts. No third `kind === "mp3" ? "MP3"` chain.
- **`process_batch`:** one `read_metadata` per kept lossy file. Reuse the sibling-skip meta on the keep path.
- **`lossyKind.js` JSDoc:** one block per export, in the right order. No stacked leftover comments.
- **Out:** no `playLoad.js` extract, no icon redraw, no living-docs rewrite, no catalogUiStatus change.

## Design

Plan 019 added a real server fork (`plan_stream`) and then copied the client play-source tree for lossy. The client model is already “active tag is `source`.” Make that the only input to resolve.

**Play source.** `deliveryCodec` at the player, `active = track.isLossy ? "source" : ctx.activeStreamCodec` inside resolve. Offline / prefer_better / prefer_stream / prefer_offline stay the existing lossless code paths. `localAtLeastAsGood("source", "source")` is already true.

**Kind contract.** A track is never mixed. Album roll-up stays `mp3` | `aac` | `mixed`. The generic sprite is the `'lossy'` kind (and still `'mixed'` on albums).

**Codec maps.** Walk eligibility stays extension + `_is_alac(path)` (one mutagen open). Source naming for tags/bitrate stays in metadata but asks `mp4_kind(info)` so ALAC vs AAC is one function. Downloads keep `codecExt(codec, sourceCodec)` so queue/worker call sites do not churn; the mp3/aac → ext/mime table is `sourceFileMedia` in `lossyKind.js`.

**Scan.** Sibling skip already has `TrackMetadata`. Do not throw it away and parse the file again.

## Stage map

1. **Un-fork resolve** — the review’s actual judo. Independent of kind/mime cleanups; play behavior is defined here.
2. **`lossyKind` contract** — kind union, JSDoc, details rows, mark icon map. Client surfaces share one meaning of “lossy track” before mime helpers grow more callers.
3. **`_mp4_kind` + `LOSSY_EXTENSIONS`** — Python-only. No client dep.
4. **`sourceFileMedia`** — JS mime/ext table in `lossyKind.js`. After stage 02 so the module is already the kind+container owner.
5. **Single metadata read** — scan-only. Independent of 01–04; last because it is the smallest.

## Out of scope

- Extracting `player.js` play loaders into a new module.
- Redrawing `i-fmt-lossy`.
- Changing `catalogUiStatus` (`source` → ready).
- Living docs / README / AGENTS.md (already match 019).
- A `{ codec, sourceCodec }` typed record on every download call site.
- A path-level `classify_source` that re-probes files during walk.

## Assumptions

- Plan 019 implementation is still uncommitted on the working tree; this plan edits that tree.
- No JS test runner. Resolve un-fork is verified by inspection plus existing pytest.
- `fromApiTrack` / `fromCatalogRecord` already set `isLossy`.
- `localAtLeastAsGood("source", "source")` remains true (unknown kind ranks 0).
- Frontend exclusive/lossy refuse and mp3/aac probes stay in `player.js`.
