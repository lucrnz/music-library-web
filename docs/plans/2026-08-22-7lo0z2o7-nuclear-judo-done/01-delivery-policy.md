# Stage 01: Delivery policy

## Status
done

## Description

Make exclusive a sink + profile, not a mode. `resolvePlayIntent` / `shouldPrepare` / `isPlayableNow` live in `playIntent.ts` without `exclusiveEnabled`. `prepare.ts` and `settings.ts` stop importing `isExclusiveEnabled`. `PlayDelivery` dies. Settings stops owning prepare-on-codec-change.

## Rationale

This is the highest-impact delete: exclusive currently forks decide, prepare, settings, and load. Pulling it behind one policy builder erases those branches without changing what plays.

## Invariants

- Same exclusive / HTML / offline / broken-local outcomes as today (including exclusive toast and `openSettings` on `exclusive_needs_device`).
- `failCurrentLoad` remains the only play-source fail writer.
- `isExclusiveEnabled()` is not imported from `playIntent.ts`, `prepare.ts`, or `settings.ts`.
- Lossy exclusive still blocks `exclusive_lossy`. Prepare still skips lossy ids.

## Risks

- `deliveryPolicy.ts` can become a new mode flag if it re-exports `isExclusiveEnabled` into prepare. Keep it a `{ sink, profileFor }` builder only.
- Settings tests currently pass `StreamChangeCtx`; update them when the second argument dies.

## Implementation

### Files

- frontend/src/playback/playIntent.ts
- frontend/src/playback/deliveryPolicy.ts
- frontend/src/playback/prepare.ts
- frontend/src/playback/load.ts
- frontend/src/stores/settings.ts
- frontend/src/stores/player.ts
- frontend/src/main.ts
- frontend/src/downloads/resolve.ts
- frontend/src/components/settings/SettingsModal.vue
- frontend/tests/playback/playIntent.test.ts
- frontend/tests/playback/prepare.test.ts
- frontend/tests/stores/settings.test.ts
- frontend/tests/downloads/resolve.test.ts

### Steps

1. Add `frontend/src/playback/deliveryPolicy.ts` that reads exclusive prefs and returns `{ sink, profileFor(track) }`. Do not export `isExclusiveEnabled`.
2. Change `PlayIntentCtx` in `playIntent.ts`: drop `exclusiveEnabled`. Callers pass `sink` and the exclusive tag (or `profileFor` result). `resolvePlayIntent` uses `ctx.sink === "companion"` for today’s `exclusiveIntent`; otherwise `resolvePlaySource` + `htmlAudio`. Export `shouldPrepare` (today’s `tracksToPrepare` / `willPreferLocal` predicate) and `isPlayableNow` (today’s offline skip used by `playNext` / `playPrev`).
3. Delete exported `PlayDelivery` from `resolve.ts`. Keep `resolvePlaySource` as the HTML-only resolver; `playIntent.ts` maps it onto `PlayIntent`.
4. `prepare.ts`: drop the `isExclusiveEnabled` import and the exclusive bucket branch. `prepareTracks` groups with `deliveryPolicy.profileFor` (or an injected `profileFor` defaulting to that). `shouldPrepare` filters the HTML group.
5. `load.ts` `intentForTrack` builds ctx from `deliveryPolicy` instead of passing `exclusiveEnabled: isExclusiveEnabled()`.
6. `settings.ts`: delete `bindSettingsPrepareTracks`, `getTracksFn`, `StreamChangeCtx`, and the exclusive fork in `applyActiveStreamSideEffects`. `setStreamCodec(id)` and `setPlaybackPolicy` persist only (codec change may still close the modal).
7. `player.ts`: keep the `settings.streamCodec` watch that reloads the current queue track; add prepare-on-change for `streamCodec` and `playbackPolicy` via `prepareTracks`. `playNext` / `playPrev` call `isPlayableNow` instead of inlining `isOfflineUnplayable` + `isLocallyPlayableDownload`.
8. `main.ts`: remove `bindSettingsPrepareTracks`. `SettingsModal.vue`: `setStreamCodec(id)` with no ctx.
9. Update `playIntent.test.ts` (ctx shape: `sink` / tag, not `exclusiveEnabled`), `prepare.test.ts` (no mocked `isExclusiveEnabled`; policy builder mocked or real), `settings.test.ts` (`setStreamCodec` one argument), and `resolve.test.ts` if it names `PlayDelivery`.

### Verify

- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test -- tests/playback/playIntent.test.ts tests/playback/prepare.test.ts tests/playback/playBlock.test.ts tests/stores/settings.test.ts tests/downloads/resolve.test.ts`

## Acceptance

- `rg -n "isExclusiveEnabled" frontend/src/playback/playIntent.ts frontend/src/playback/prepare.ts frontend/src/stores/settings.ts` is empty.
- `rg -n "exclusiveEnabled|PlayDelivery|bindSettingsPrepareTracks|StreamChangeCtx" frontend/src` is empty except comments if any (should be none).
- `rg -n "export (type|interface) PlayDelivery" frontend/src` is empty.
- Exclusive lossy still resolves to `exclusive_lossy`; exclusive lossless still `sink: "companion"` with the exclusive tag (`playIntent.test.ts`).
- Offline skip / `isOfflineUnplayable` tests still pass (`playBlock.test.ts`).
- `setStreamCodec` persists without a tracks/index argument (`settings.test.ts`).
- Typecheck is clean.
