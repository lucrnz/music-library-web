# Stage 05: Play-load unfork

## Status
done

## Description

Delete the remaining `isLossy` control flow in the HTML/exclusive load path. Probe decode only when the delivery tag is `source`. Every `attemptPlay` failure is `play_failed`. Near-end prepare relies on stage 04 predicates.

## Rationale

Stage 04 owns the tag. `playHtml` still maps any load failure on a lossy track to `codec_unsupported` (including 404/network) and special-cases a probe behind `if (track?.isLossy)`. That is a boolean standing in for a typed fail.

## Invariants

- Delivery tag at the load seam is `deliveryCodec(track, getActiveStreamCodec())`.
- When that tag is `SOURCE_TAG`, probe `sourceCodec` only if it is `mp3` or `aac`; otherwise `codec_unsupported` without `attemptPlay`. Failed family probe → `codec_unsupported`.
- `supportsCodecKind`’s “unknown kind → true” path must not apply to source delivery. Do not change the helper’s lossless-profile behavior.
- `attemptPlay` failure (first load or download-fallback stream) → `play_failed` for both lossy and lossless.
- `playExclusive`: `track.isLossy` → `exclusive_lossy` (unchanged copy). Else null tag → `exclusive_no_format`. Stage 04 already makes the tag null for lossy; check `isLossy` first so the reason stays honest.
- `issueNearEndPrepare` has no `isLossy` early return. Exclusive uses `getExclusiveProfileTag`; HTML uses `trackNeedsStreamPrepare`.
- Do not extract `playLoad.js`. Do not grow `player.js` with a new wrapper module.

## Risks

- Browsers that used to fail a source `attemptPlay` (decode error after a passed/skipped probe) will now say `play_failed` instead of `codec_unsupported`. Honest; copy is slightly less specific.
- Removing the near-end `isLossy` return without stage 04 would exclusive-prepare a lossy next track. This stage must not land first.

## Implementation

### Files

- Change `src/musicweb/static/js/stores/player.js`

### Steps

1. `playHtml`: compute `const activeCodec = deliveryCodec(...)` **once** at the top (after `selectSink`). If `activeCodec === SOURCE_TAG` (import `SOURCE_TAG` if needed), probe as specified; on failure `failPlayback("source", "codec_unsupported", ...)` and return. Delete the `if (track?.isLossy)` probe block.
2. Pass that same `activeCodec` into `resolvePlaySource` (already the case). Delete the second `deliveryCodec(...)` on the download-fallback stream if it can reuse the local.
3. Replace both `track?.isLossy ? "codec_unsupported" : "play_failed"` with `"play_failed"` / `PLAY_BLOCK_MESSAGES.play_failed`.
4. `playExclusive`: keep the `isLossy` → `exclusive_lossy` block first (product reason). Do not fold it into `exclusive_no_format`.
5. `issueNearEndPrepare`: delete `if (nextTrack?.isLossy) return;`. Exclusive branch already no-ops on null tag; HTML branch already no-ops via `trackNeedsStreamPrepare`.

### Verify

- `rg "isLossy \\? \"codec_unsupported\"" src/musicweb/static/js` — no matches.
- `rg "if \\(track\\?\\.isLossy\\)" src/musicweb/static/js/stores/player.js` — only `playExclusive` (exclusive refuse).
- `rg "if \\(nextTrack\\?\\.isLossy\\)" src/musicweb/static/js/stores/player.js` — no matches.
- `uv run --group dev pytest`
- Inspection: lossy + unsupported family never calls `attemptPlay`; lossy + supported family + stream 500 → `play_failed`; exclusive + lossy → toast `exclusive_lossy` without companion load.

## Acceptance

- [ ] Source-family probe is keyed on the delivery tag, not a product boolean mid-load.
- [ ] Network/stream failures on lossy tracks are `play_failed`.
- [ ] Exclusive refuse copy unchanged.
- [ ] Near-end prepare has no extra lossy branch.
- [ ] `player.js` is not split; no new loader module.
