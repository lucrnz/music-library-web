# Stage 01: On-demand teardown

## Status
done

## Description

Give on-demand one teardown pair: always stop HTML on a new load; stop companion only when the new intent is unavailable or the sink changes. Radio tune-in and `stopPlayback` use the full leave-on-demand path (both sinks + revoke `localPlayUrl`). Delete the idle exclusive `onError` branch.

## Rationale

The exclusive-keeps-playing defect and the idle `onError` special case are the same missing stop. Fixing that first is independent of browse and is the only user-audible bug in this plan.

## Invariants

- Exclusive track-to-track (companion → companion) does not `stop()` the companion. `selectSink` remains a no-op and `load` runs on the same sink.
- `playGen` still increments on every `beginLoad` and `stopPlayback`. Stale awaits still drop via `still(gen)`.
- `claimOnDemand` still runs the radio-exit hook then `restoreMediaSession`. `player.ts` still does not import `radio.ts`.
- Play-intent policy is unchanged (`resolvePlayIntent`, exclusive refuse lossy/downloads).

## Risks

- Stopping companion on unavailable while a previous exclusive track is loaded will cut audio. That is the intended fix, not a regression.
- `stopOnDemandSinks` gaining blob revoke requires `localPlayUrl` to be reachable from `onDemandControl`’s bound `stopSinks` (same place `initAudioListeners` already binds both sink stops). Do not import `player.ts` from `onDemandControl.ts`.

## Implementation

### Files

- `frontend/src/stores/player.ts`
- `frontend/src/playback/onDemandControl.ts`
- `frontend/src/playback/teardown.ts` (new, pure `needsCompanionStop` or equivalent)
- `frontend/tests/playback/teardown.test.ts` (new)
- `frontend/tests/playback/handoff.test.ts` (only if bind signature changes)

### Steps

1. Add a pure helper `needsCompanionStop(intent, activeKind)` (or same name): `true` when `intent.source === "unavailable"` or `intent` is ready and `intent.sink !== activeKind`. No Vue, no sinks.
2. In `beginLoad`, keep gen bump, listen discard, `clearPlaySourceState`, and HTML `stop`. Do not stop companion here.
3. In `loadIntent`, if unavailable: stop companion, revoke `localPlayUrl`, then today’s notice/toast. If ready and `needsCompanionStop`: stop companion before `selectSink`. Exclusive same-sink skips that stop.
4. Extract `revokeLocalPlayUrl` + stop-both-sinks into the function already passed to `bindOnDemandControl({ stopSinks })`. `stopOnDemandSinks` and `stopPlayback` both call it. Radio `tuneIn` keeps calling `stopOnDemandSinks()` (now includes revoke).
5. In `onError`, delete the `playSource === "none"` exclusive_needs_device / `isExclusiveEnabled()` idle branch. A sink with no current on-demand load does not toast or `hardStopCompanion`. Device-not-ready during a real load still `hardStopCompanion` as today.
6. Do not peel `onDemandLoad.ts`. Do not change volume writers.

### Verify

- `rg -n "playSource === \\"none\\"" frontend/src/stores/player.ts` — the exclusive idle `onError` arm is gone (other `none` checks for resume/ensureAudible may remain).
- `pnpm --dir frontend test` (includes new teardown cases + `handoff.test.ts`)
- `pnpm --dir frontend typecheck`

## Acceptance

- `needsCompanionStop` (or the shipped name) is unit-tested for: unavailable → stop; companion→html → stop; companion→companion → no stop; html→companion → stop.
- `beginLoad` does not call `companionSink.stop()`.
- Unavailable `loadIntent` and `stopOnDemandSinks` revoke `localPlayUrl` and stop companion.
- No `onError` path that toasts or opens Settings when `playSource === "none"`.
- Typecheck and frontend tests pass.
