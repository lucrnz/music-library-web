# Stage 03: Delete Network Information plumbing

## Status
done

## Description

Remove `networkConstraints.ts` and every settings/downloads/boot hook that existed only to mirror connection type or react to its `change` event. Keep a boot-time tracks getter on settings so prepare-on-policy-change still works.

## Rationale

After stages 01 and 02, this module has no product consumer. Leaving it would preserve a dead cost-hint layer that the docs would still have to explain.

## Invariants

- Reachability stays in `connectivity.ts` (`online` / `offline` / `server_down`). Do not move or delete those APIs.
- Settings still receives a playlist-tracks getter at boot so `setPlaybackPolicy` / `applyActiveStreamSideEffects` can re-prepare without importing the playlist store.
- `setStreamCodec` still restarts playback and re-prepares; that path does not need a constraint listener.

## Risks

- `bindNetworkConstraintEffects` currently does two jobs (store `getTracksFn` and subscribe to `onConstraintChange`). Deleting the whole bind without a replacement leaves `getTracksFn` null and `setPlaybackPolicy` prepares an empty list.
- `settings.ts` importing `../downloads/index.js` only to call `onNetworkConstraintChanged` must go, or the cycle-prone dynamic import remains for no reason.

## Implementation

### Files

- `frontend/src/networkConstraints.ts` (delete)
- `frontend/tests/playback/networkConstraints.test.ts` (delete)
- `frontend/src/stores/settings.ts`
- `frontend/src/main.ts`
- `frontend/src/downloads/index.ts`
- `frontend/src/downloads/queuePolicy.ts` (imports only, if any remain)
- `frontend/tests/stores/settings.test.ts`
- `frontend/tests/downloads/queuePolicy.test.ts`

### Steps

1. Delete `frontend/src/networkConstraints.ts` and `frontend/tests/playback/networkConstraints.test.ts`.
2. In `settings.ts`, remove imports of `canDetectConnectionType`, `isConstrainedConnection`, and `onConstraintChange`. Remove state fields `canDetectConnectionType` and `constrained`, `refreshNetworkFlags`, `onNetworkConstraintChanged`, and every `notifyDownloads` / `onNetworkConstraintChanged` dynamic import. `openSettings` no longer refreshes network flags. `applyActiveStreamSideEffects` no longer takes or acts on `notifyDownloads`.
3. Replace `bindNetworkConstraintEffects` with a bind that only stores `getTracksFn`. Name it for that job; do not keep “constraint” in the name. Do not call `onConstraintChange`.
4. In `main.ts`, call that bind with `() => pl.tracks` in the same boot place.
5. Delete `onNetworkConstraintChanged` from `frontend/src/downloads/index.ts`. Grep `frontend/` only for `networkConstraints`, `onConstraintChange`, `isConstrainedConnection`, `canDetectConnectionType`, `onNetworkConstraintChanged`, `refreshNetworkFlags`, and `bindNetworkConstraintEffects` — zero production references. Do not grep `docs/`; those pages still name `networkConstraints` until stage 04. Do not edit `SettingsModal.vue`.
6. Drop `vi.mock("@/networkConstraints", ...)` and related hoisted fns from `settings.test.ts` and `queuePolicy.test.ts`.

### Verify

- `rg -n "networkConstraints|onConstraintChange|isConstrainedConnection|canDetectConnectionType|onNetworkConstraintChanged|bindNetworkConstraintEffects" frontend`
- `pnpm --dir frontend test`
- `pnpm --dir frontend typecheck`

## Acceptance

- `frontend/src/networkConstraints.ts` is gone.
- No production file imports Network Information helpers or constraint-change callbacks.
- Boot still binds a tracks getter; changing playback policy still re-prepares the current queue.
- Full frontend test suite and typecheck pass.
