# Stage 06: playback.md — online means canReachServer

## Status
done

## Description

Clarify in `docs/systems/playback.md` that play-source “online” means `canReachServer()`. `server_down` uses the offline resolve path.

## Rationale

Stage 02’s real behavior change is `resolvePlaySource({ offline: !canReachServer() })` and no stream fallback from a broken local blob while unreachable. Cover/prepare `isHardOffline()` pairs are already equivalent to `canReachServer()`. Without a precise sentence, the next change is likely to pass `isHardOffline()` again. `exclusive-audio.md` already states the hello-replace rule — do not rewrite it.

## Invariants

- Docs still do not copy request/response shapes or table columns.
- `docs/systems/connectivity.md` still owns the three reachability states; playback only says how play-source reacts.
- `docs/systems/exclusive-audio.md` is not edited.

## Risks

- Over-specifying `playIndex` internals. One paragraph under Delivery source / policy is enough.
- Duplicating the connectivity table. Link to `docs/systems/connectivity.md`.

## Implementation

### Files

- Change `docs/systems/playback.md`
- Do **not** change `docs/systems/exclusive-audio.md`, `docs/systems/connectivity.md`, or `docs/frontend/conventions.md`

### Steps

1. In **Delivery source**, state that resolve treats the library as offline when `canReachServer()` is false (`offline`, `server_down`, or browser offline). A playable download then wins; otherwise unavailable.
2. In the **prefer live stream** bullet, “when the server is reachable (`canReachServer()`).”
3. Guardrail: do not use `isHardOffline()` alone to decide stream vs download.
4. No changelog or plan-archive notes.

### Verify

- Read `playback.md` against stage 02: a new reader must not think `navigator.onLine` is enough to prefer stream.
- Grep: no exclusive reconnect rewrite; no copied API schemas.

## Acceptance

- [x] Playback docs say play-source online ≡ `canReachServer()`.
- [x] Connectivity remains the owner of state definitions (linked, not copied).
- [x] Exclusive-audio.md untouched.
