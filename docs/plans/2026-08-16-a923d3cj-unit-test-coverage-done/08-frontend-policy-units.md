# Stage 08: Frontend policy units

## Status
done

## Description

Node Vitest tests for the pure client policy modules: quality rank, play-block copy, network constraints, LRC parse, exclusive format picker + protocol envelope, lossy delivery helpers, track/album model mapping, connectivity classify/copy, and tree flatten.

## Rationale

These modules decide what the user can play and what they see when they cannot. They have no DOM or IDB dependency and are the highest-value frontend tests after the harness.

## Invariants

- Files live under `frontend/tests/` mirroring src areas; node project only (`tests/browser/**` excluded).
- Import via `@/`. Do not mount Vue components.
- Do not bind `window` online/offline listeners or run health probes.
- No production-code edits in this stage. Use existing exports only.

## Risks

- `connectivity.ts` default `state` is `"online"`. Node has no `navigator`. Offline `classifyError` must stub `globalThis.navigator = { onLine: false }` so `browserOffline()` is true. Do not call `reportFailure` (it mutates module health state). Reset `navigator` in `afterEach`.
- `networkConstraints.getConnection` reads `navigator`. In node, `navigator` may be undefined (good) — do not polyfill a fake connection unless the test is specifically covering cellular.

## Implementation

### Files

- Create: `frontend/tests/playback/qualityRank.test.ts`
- Create: `frontend/tests/playback/playBlock.test.ts`
- Create: `frontend/tests/playback/networkConstraints.test.ts`
- Create: `frontend/tests/lyrics/parseLrc.test.ts`
- Create: `frontend/tests/exclusive/formatPolicy.test.ts`
- Create: `frontend/tests/exclusive/protocol.test.ts`
- Create: `frontend/tests/lossyKind.test.ts`
- Create: `frontend/tests/models/track.test.ts`
- Create: `frontend/tests/models/album.test.ts`
- Create: `frontend/tests/connectivity/classify.test.ts`
- Create: `frontend/tests/tree/flattenVisible.test.ts`

### Steps

1. **qualityRank:** `flac_24_96000` ranks above `opus_192_48000`; equal tags → 0; `localAtLeastAsGood` true when local FLAC vs stream Opus.
2. **playBlock:** every key in `PLAY_BLOCK_MESSAGES` round-trips through `playBlockMessage`; unknown string, `""`, and `null`/`undefined` all return `null`.
3. **networkConstraints:** default node → `isConstrainedConnection() === false`. Stub `navigator.connection = { type: "cellular" }` → true; `{ type: "wifi", saveData: true }` → true; `{ type: "wifi" }` → false.
4. **parseLrc:** `[00:01.00]Hi` → `{ t: 1, text: "Hi" }`; two stamps on one line duplicate text; `[ar:x]` ignored; `null` → `[]`.
5. **formatPolicy:** `pickExclusiveProfileTag` with a 12-cell catalog never returns a tag not in `formats`; `prefer_source` near 96 kHz/24 picks that cell when listed; empty `formats` → `null`.
6. **protocol:** `envelope("hello", { token: "t" })` includes `type` and `v === PROTOCOL_VERSION`.
7. **lossyKind:** `deliveryCodec({ isLossy: true }, "flac_16_44100") === "source"`; lossless returns the active codec.
8. **models:** `fromApiTrack` / `fromApiAlbum` map `is_lossy` → `isLossy`, `album_id` → `albumId`, null path for missing.
9. **connectivity:** `classifyError` + `isItemFailHttpStatus` table (404 → `item_fail`, 500/429 → `server_down`, `AbortError` → `abort`). Offline: stub `navigator.onLine === false`. `connectivityBanner` / `connectivityLoadError` strings for online/offline/server_down.
10. **flattenVisible:** two roots, one expanded with children → depths/parentKeys; collapsed → children omitted.

### Verify

```sh
pnpm --dir frontend test
pnpm --dir frontend typecheck
```

## Acceptance

- [ ] Each module in the stage 08 inventory table has a node test file covering the listed behaviors.
- [ ] Icon browser smoke still passes.
- [ ] No Vue mount except the existing Icon test.
