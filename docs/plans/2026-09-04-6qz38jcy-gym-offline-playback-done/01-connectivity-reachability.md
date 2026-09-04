# Stage 01: Connectivity follows live `/api`

## Status
done

## Description

Stop treating `navigator.onLine` as hard truth. A successful same-origin `/api` response marks the session reachable; a classified network / 5xx / 429 failure marks it down. Window online/offline only start a probe. `playIndex` retries `offline_no_local` once as a stream attempt without forcing a downloaded file onto the live-stream policy.

## Rationale

This is the gym play bug: browse 200s while play reads a browser flag Chromium got wrong. Later stages’ “when online” backfill, covers, and flip all sit on this gate.

## Invariants

- `canReachServer()` is `state === "online"`. It does not read `navigator.onLine`.
- `canUseRemoteMedia()` stays `canReachServer() && hasConfirmedReachability()`.
- `isHardOffline()` is `state === "offline"` only.
- `reportSuccess()` always sets confirmed + `online` on a live success, including when `navigator.onLine === false`.
- Window `offline` / `online` do not call `setState`.
- `probeRemote` on a playable local catalog row must not change delivery vs today’s offline-local / online-policy rules.
- `player.ts` still does not import `radio.ts`.

## Risks

- Health loop while `offline` / `server_down` with an empty queue adds `/api/health` traffic on a phone that is truly down (existing 1s–60s backoff).
- A truly offline tap of a non-downloaded track waits up to `JOIN_LOAD_TIMEOUT_MS` before `offline_no_local` instead of failing instantly.
- `api.ts` importing `@/connectivity` is a new edge; `connectivity.ts` must not import `@/api`.

## Implementation

### Files

- `frontend/src/connectivity.ts`
- `frontend/src/api.ts`
- `frontend/src/playback/load.ts`
- `frontend/src/playback/playIntent.ts`
- `frontend/src/downloads/resolve.ts`
- `frontend/tests/connectivity/`
- `frontend/tests/connectivity/classify.test.ts`
- `frontend/tests/connectivity/healthWork.test.ts`
- `frontend/tests/connectivity/reachability.test.ts`
- `frontend/tests/playback/playIntent.test.ts`
- `frontend/tests/downloads/resolve.test.ts`

### Steps

1. In `frontend/src/connectivity.ts`, drop `browserOffline()` from `canReachServer`, `isHardOffline`, `autoPauseReason`, `reportSuccess`, and the opening short-circuit of `classifyError` (keep `state === "offline"` → `"offline"`). `reportSuccess` always confirms and sets `online`. `reportFailure` on `offline` / `server_down` classes sets `offline` if `navigator.onLine === false`, else `server_down`. `effectiveConnectivityState` follows `state` only.
2. Window `offline` / `online` in `bindWindowConnectivity` call `requestHealthProbe(0)` only. Do not `setState`.
3. Allow `requestHealthProbe` with no `setHealthWork` source. `needsHealthProbe` / `syncHealthLoop` run while `state` is `offline` or `server_down` or `probeRequested`, and do not stop because `browserOffline()` is true. Export a test seam `resetConnectivityForTests()` that restores boot defaults (`online`, unconfirmed, backoff start, no health work, no timers).
4. In `frontend/src/api.ts`, `apiFetch`: `res.ok` → `reportSuccess()`; `429` or `>= 500` → `reportFailure(null, status)`; `fetch` throw → `reportFailure(err)` then rethrow. Do not flip on 4xx. `connectivity.ts` must not import this module.
5. Add `probeRemote?: boolean` on the `resolvePlaySource` ctx and on `PlayIntentCtx`. In `frontend/src/downloads/resolve.ts`, when `offline` and the catalog row is not playable, if `probeRemote` then fall through to the existing stream branch; otherwise keep today’s `offline_no_local` / `broken` / `missing`. When `offline` and the row is playable, still `openDownloadedSource` (ignore `probeRemote`). Thread `probeRemote` through `resolvePlayIntent` into `resolvePlaySource`.
6. In `frontend/src/playback/load.ts`, pass `probeRemote: true` from `intentForTrack` into `resolvePlayIntent`. Do not add a second play path in the player store; `playIndex` already goes through `loadResolved`.
7. Replace `frontend/tests/connectivity/classify.test.ts` “navigator.onLine is false ⇒ offline” with: a network-shaped error + `onLine === false` still classifies as `server_down` (or `unknown` per the remaining rules); `reportFailure` is what picks the `offline` copy. Extend `frontend/tests/connectivity/healthWork.test.ts` so `requestHealthProbe(0)` hits `/api/health` with both health sources false.
8. Add `frontend/tests/connectivity/reachability.test.ts`: after `resetConnectivityForTests`, `reportSuccess` with `navigator.onLine === false` yields `canReachServer()` and `canUseRemoteMedia()` true; window-style “do not setState” is covered by asserting `reportSuccess` is the only confirm path in these tests. Add `frontend/tests/downloads/resolve.test.ts` cases for `probeRemote` + no local (stream URL) and `probeRemote` + playable local (downloaded). Add a `frontend/tests/playback/playIntent.test.ts` case that forwards `probeRemote` into the mocked `resolvePlaySource`.

### Verify

- `pnpm --dir frontend test -- frontend/tests/connectivity frontend/tests/playback/playIntent.test.ts frontend/tests/downloads/resolve.test.ts` passes.
- `rg -n "browserOffline\\(\\)" frontend/src/connectivity.ts` has no remaining uses inside `canReachServer`, `isHardOffline`, `autoPauseReason`, or `reportSuccess`.
- `rg -n "from \\\"@/api\\\"|from '@/api'" frontend/src/connectivity.ts` is empty.

## Acceptance

- With `navigator.onLine === false`, a 200 from `apiFetch` makes `canUseRemoteMedia()` true and `playIndex` of an undownloaded track resolves to `streaming` (or exclusive stream), not `offline_no_local`.
- A playable download still plays locally when `offline` is true, even if `probeRemote` is set.
- Window `offline` does not flip `state` by itself; a later failed `apiFetch` can.
