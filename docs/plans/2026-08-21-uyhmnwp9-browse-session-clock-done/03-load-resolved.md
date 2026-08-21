# Stage 03: One loadResolved loop

## Status
done

## Description

Collapse `loadIntent` + the local-broken copy into one `loadResolved` that remints and recurses. Move `ensurePreferredDevice` into `companionSink.load`. Delete `issueNearEndPrepare` and the dead `prevIndex` restart union.

## Rationale

`player.ts` is 790 lines and the growth site is a second exclusive/HTML loader pasted under the first. The leftovers plan said apply + `sink.load`. This stage actually does that.

## Invariants

- Exclusive still refuses downloads and lossy in `resolvePlayIntent`. Ready exclusive is companion + streaming.
- HTML still goes through `resolvePlaySource`. `localBroken` still forces stream or `broken` / `play_failed`.
- Unavailable UX: exclusive blocks toast, no title prefix; other blocks prefix `Title:`.
- Exclusive same-sink loads still do not release the hog (`needsCompanionStop` unchanged).
- `player.ts` still does not import `radio.ts`.
- `prepareTracks` still groups exclusive by tag. Do not thread intents into prepare.
- Source-codec probe for HTML `source` stays in `intentForTrack`.

## Risks

- Moving the gate to the sink means a gate failure happens after `selectSink("companion")`. `companionSink.load` must fail **before** `companionLoad` (no hog). `loadResolved` maps that throw onto the existing exclusive unavailable path (toast, maybe Settings).
- `onError` still using `isExclusiveEnabled()` will treat enabled-but-HTML as companion failure. Switch that fork to `activeSink.kind === "companion"` only.

## Implementation

### Files

- `frontend/src/stores/player.ts`
- `frontend/src/stores/playlist.ts`
- `frontend/src/playback/sinks/companionSink.ts`
- `frontend/src/playback/playIntent.ts`
- `frontend/tests/playback/playIntent.test.ts`
- `frontend/tests/stores/playlist.test.ts`

### Steps

1. `companionSink.load`: call `ensurePreferredDevice({ timeoutMs: 1500 })` first. On `!ok`, throw an `Error` whose `message` is the block copy and that carries `code` = `gate.reason` (`exclusive_needs_device` / `exclusive_not_ready` / `exclusive_readonly`). Do not call `companionLoad` on failure.
2. `exclusiveIntent` in `playIntent.ts`: if `exclusiveGate` is omitted, skip the gate check (tag + lossy still apply). Tests: exclusive enabled + no gate + valid tag → ready companion intent.
3. Replace `loadIntent` / the local-broken tail with `loadResolved(gen, track, extra?)`: `intentForTrack` → `applyIntent` → `needsCompanionStop` → unavailable notice → missing-tech toast → `selectSink` → `attemptPlay`. If play fails and `source === "downloaded"` and `!extra.localBroken`, `markDownloadBroken` + revoke + `return loadResolved(gen, track, { localBroken: true })`. Other failures go through one `failLoad` (companion throw / `activeSink.kind === "companion"` → exclusive fail; else `play_failed`).
4. `intentForTrack` stops calling `ensurePreferredDevice`. Drop `exclusiveGate` assembly. Keep `exclusiveEnabled`, `exclusiveTag`, and the HTML source-codec probe.
5. `onError`: exclusive fail only when `activeSink.kind === "companion"` (or an explicit companion error code). Do not OR with `isExclusiveEnabled()`.
6. Delete `issueNearEndPrepare`; `maybePrepareNext` calls `prepareTracks` directly.
7. `playlist.ts` `prevIndex()`: drop the `currentTime` argument and the `{ restart: true }` union. `playPrev` already restarts on the sink when `currentTime > 3`.

### Verify

- `rg -n "ensurePreferredDevice" frontend/src/stores/player.ts` is empty.
- `rg -n "issueNearEndPrepare|restart: true" frontend/src` is empty.
- `rg -n "isExclusiveEnabled\\(\\)" frontend/src/stores/player.ts` is not used in `onError`.
- `pnpm --dir frontend typecheck`
- `pnpm --dir frontend test`

## Acceptance

- There is one resolve/load function. Local-broken is a recursive remint, not a pasted tail.
- Companion gate runs in the sink and does not hog on failure.
- `prevIndex` returns `number`.
- Exclusive refuse / HTML resolve / unavailable copy unchanged.
- `player.ts` line count does not grow (shrink expected).
