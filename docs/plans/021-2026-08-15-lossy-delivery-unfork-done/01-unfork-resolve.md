# Stage 01: Un-fork resolvePlaySource

## Status
done

## Description

Normalize the active stream tag to `"source"` when the track is lossy, then delete the `if (track.isLossy)` copy of the offline / local / stream tree in `resolvePlaySource`.

## Rationale

That block is a second play-source implementation. `deliveryCodec` already makes `active === "source"` for lossy; prefer_* and offline already do the right thing on that tag. The fork exists so a missed caller does not 409 — normalize inside resolve instead.

## Invariants

- `playHtml` still passes `deliveryCodec(track, getActiveStreamCodec())`.
- Lossy + ready `source` download + `prefer_better` / `prefer_offline` → local blob.
- Lossy + `prefer_stream` while reachable → `streamUrl(track, "source")`.
- Lossy + offline + no playable `source` blob → existing unavailable reasons (`missing` / `broken` / `offline_no_local`).
- Lossless resolve, policy, and catalog ranking are unchanged.
- No new module.

## Risks

- Deleting the fork without normalizing `active` sends Opus/FLAC for lossy (`409`). The first line of resolve must set `active` from `track.isLossy`.
- A catalog row with a leftover non-`source` codec on a lossy track would go through `shouldPreferLocalOnline` against `"source"`. Accept: 019 never wrote those rows.

## Implementation

### Files

- Change `src/musicweb/static/js/downloads/resolve.js`
- Do **not** change `player.js`

### Steps

1. Import `SOURCE_TAG` from `lossyKind.js`.
2. After the `no_id` guard, replace `const active = ctx.activeStreamCodec` with `const active = track.isLossy ? SOURCE_TAG : ctx.activeStreamCodec`.
3. Delete the entire `if (track.isLossy) { ... }` block (offline copy, prefer_stream skip, dedicated `streamUrl(..., "source")` return).
4. The remaining offline / `shouldPreferLocalOnline` / `streamUrl(track, active)` path is the only tree. Do not extract a `resolveLossyPlaySource` helper.

### Verify

- `rg "if \\(track\\.isLossy\\)" src/musicweb/static/js/downloads/resolve.js` — no matches. `track.isLossy` may appear once, on the `active` assignment.
- `rg "resolvePlaySource" src/musicweb/static/js` — `player.js` still uses `deliveryCodec`; no new callers required this stage.
- `uv run --group dev pytest`
- Inspection: lossy + `prefer_better` + `rec.codec === "source"` still hits `shouldPreferLocalOnline("source", "source")` which is true.

## Acceptance

- [x] One play-source tree in `resolve.js`.
- [x] Lossy delivery tag is `"source"` even if the caller passed an Opus/FLAC `activeStreamCodec`.
- [x] Lossless behavior unchanged.
