# Stage 03: Detach remaining radio watches

## Status
done

## Description

Move the `settings.streamCodec`, `settings.playbackPolicy`, and `connectivity.state` watches from `connect()` / `bindVolumeWatch` / `bindConnectivity` into `initRadioListeners()` (already called from `main.ts` before `createApp()`). Delete the component-scoped bind helpers and their latches. `bindVisibility` stays a `document` listener.

## Rationale

Those three watches share the RadioView `onMounted` → `connect()` latch that killed volume. After `/radio` unmount they no longer re-resolve Streaming / download policy or flip chrome on connectivity. Volume is already off this path; this stage clears the rest of the landmine.

## Invariants

- `initRadioListeners()` remains idempotent and still includes the volume subscribe from stage 02.
- `connect()` does not call `watch()`.
- `resetRadioStore()` does not stop these watches.
- Callbacks keep their existing chrome gates (`radioChromeActive()`, `tuning` / `tuned`).
- Radio tests still do not import `player.ts`.

## Risks

- `frontend/tests/stores/radio.test.ts` “connectivity loss while tuned stays tuning” currently relies on `connect()` to bind the connectivity watch. After this stage it only works if `initRadioListeners()` has already run (`beforeEach` from stage 02).
- Do not move `bindVisibility` into a `watch` or give it a component-scoped `watch`.

## Implementation

### Files

- `frontend/src/stores/radio.ts`
- `frontend/tests/stores/radio.test.ts`

### Steps

1. In `frontend/src/stores/radio.ts`, register the current streamCodec, playbackPolicy, and connectivity `watch` bodies inside `initRadioListeners()` (same callbacks as today). Remove `bindVolumeWatch` and `bindConnectivity` and their `volumeBound` / `connectivityBound` flags. Stop calling them from `connect()`. Leave `bindSession` and `bindVisibility` on `connect()`.
2. In `frontend/tests/stores/radio.test.ts`, keep `initRadioListeners()` in `beforeEach`. Confirm the existing connectivity-loss case still expects `chrome === "tuning"` after `connectivity.state = "offline"` **without** requiring `connect()` for the watch (you may drop `connect()` from that case if hydrate is unused). Add a case that `initRadioListeners()` twice does not throw and still applies `setOutputVolume` once per write.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/stores/radio.test.ts frontend/tests/radio/session.test.ts
pnpm --dir frontend typecheck
```

On a running app: Tune in, leave `/radio`, toggle Streaming — radio re-sends `tune_in` / re-resolves as today. Drop the network while tuned (or simulate server_down) — chrome goes `tuning` and does not Tune out.

## Acceptance

- `frontend/src/stores/radio.ts` has no `watch()` call outside `initRadioListeners()`.
- `connect()` does not register Vue watches.
- The connectivity-loss test still passes without depending on RadioView.
- `pnpm --dir frontend typecheck` passes.
