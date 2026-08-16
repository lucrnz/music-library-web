# Stage 04: Delivery-tag owner

## Status
done

## Description

Make `deliveryCodec` the only client tag decision. Resolve trusts the caller. Enqueue, catalog UI, prepare, and exclusive profile selection follow that tag. Do not change `playHtml` fail reasons yet (stage 05).

## Rationale

Plan 021 left a second `isLossy → source` line in resolve “so a missed caller cannot 409,” then re-implemented the same test in queue, prepare, exclusive play, and catalog. Exclusive prepare still asks for FLAC tags on MP3s. One owner deletes the scatter.

## Invariants

- `playHtml` still passes `deliveryCodec(track, getActiveStreamCodec())` into resolve as `activeStreamCodec`.
- Resolve uses `const active = ctx.activeStreamCodec` (no `track.isLossy` in `resolve.js`).
- Lossy + ready `source` download + `prefer_better` / `prefer_offline` → local blob (unchanged tree).
- Lossy + `prefer_stream` while reachable → `streamUrl(track, "source")` because the caller passed `source`.
- `enqueueTrackCore` stores `codec === SOURCE_TAG` for lossy via `deliveryCodec`, not a `"source"` literal.
- `catalogUiStatus`: `rec.codec === SOURCE_TAG` is ready (lossy original is always the preferred download).
- `tracksNeedingPrepare` / `trackNeedsStreamPrepare` skip lossy **including exclusive mode**.
- `getExclusiveProfileTag(lossy)` is `null`. `requestExclusivePrepare` and settings exclusive prepare therefore send no lossy ids.
- Settings non-exclusive prepare does not POST lossy ids (filter through `tracksNeedingPrepare` or an equivalent `!t.isLossy` before `requestPrepare`).
- Server `media.py` prepare skip and `plan_stream` 409s stay as-is.
- `playExclusive` still refuses lossy with `exclusive_lossy` (may keep its `isLossy` check until stage 05).
- No new module.

## Risks

- A future resolve caller that passes a raw Opus/FLAC tag for a lossy track will 409. That is the point. Grep callers in this stage.
- `applyActiveStreamSideEffects` today prepares the whole queue on codec change. Filtering lossy must not drop lossless ids or skip `replace: true`.

## Implementation

### Files

- Change `src/musicweb/static/js/downloads/resolve.js`
- Change `src/musicweb/static/js/downloads/queue.js`
- Change `src/musicweb/static/js/downloads/catalog.js`
- Change `src/musicweb/static/js/stores/playlist.js`
- Change `src/musicweb/static/js/stores/exclusiveAudio.js`
- Change `src/musicweb/static/js/stores/settings.js`

### Steps

1. `resolvePlaySource`: `const active = ctx.activeStreamCodec`. Remove the `SOURCE_TAG` import if unused. `rg "isLossy" resolve.js` must be empty.
2. Confirm `rg "resolvePlaySource" src/musicweb/static/js` — only `player.js` (already passes `deliveryCodec`).
3. `enqueueTrackCore`: `codec = deliveryCodec(n, codec)` (import from `lossyKind.js`). Delete `if (n.isLossy) codec = "source"`.
4. `catalogUiStatus`: compare to `SOURCE_TAG` (already imported in `catalog.js`).
5. `tracksNeedingPrepare`: build the id-bearing, non-lossy list first. Exclusive early-return and download-policy filtering run on that list only. `trackNeedsStreamPrepare` can drop its own `isLossy` line if the shared filter covers it (keep a single skip, not two).
6. `getExclusiveProfileTag`: if `track?.isLossy` return `null` before device/caps work.
7. `applyActiveStreamSideEffects` non-exclusive branch: do not `requestPrepare(list, active)` on the raw queue. Use `tracksNeedingPrepare(list, active)` (import from playlist) or filter `!t.isLossy` the same way. Exclusive branch already drops null tags after step 6.

### Verify

- `rg "isLossy" src/musicweb/static/js/downloads/resolve.js` — no matches.
- `rg "codec = \"source\"" src/musicweb/static/js` — no matches (use `SOURCE_TAG` / `deliveryCodec`).
- `rg "rec.codec === \"source\"" src/musicweb/static/js` — no matches.
- `rg "if \\(t.isLossy\\) continue" src/musicweb/static/js/stores/playlist.js` — skip happens before any `isExclusiveEnabled` return, or the exclusive return is already the filtered list.
- `uv run --group dev pytest`
- Inspection: exclusive + lossy track in queue → `requestExclusivePrepare` builds no bucket for it; HTML near-end still uses `trackNeedsStreamPrepare` (stage 05 deletes the extra early return).

## Acceptance

- [ ] One client function decides the delivery tag.
- [ ] Resolve has one tree and no `isLossy` test.
- [ ] Lossy ids are not prepared (HTML or exclusive) on the client.
- [ ] Exclusive profile selection cannot return a FLAC tag for a lossy track.
- [ ] Enqueue and catalog UI use `SOURCE_TAG` / `deliveryCodec`.
- [ ] `playHtml` fail-reason ternaries still exist (stage 05). Lossless play/prepare unchanged.
