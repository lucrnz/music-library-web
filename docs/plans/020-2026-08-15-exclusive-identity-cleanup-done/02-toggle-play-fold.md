# Stage 02: Fold togglePlay onto ensureAudible

## Status
done

## Description

`togglePlay` becomes: if the sink is not paused, `pause()`; else `ensureAudible()`; then `syncTransportFlags()`. Delete the leftover empty-queue and `index < 0` branches.

## Rationale

Plan 018 extracted `ensureAudible` for Play / Media Session but left the old `togglePlay` shape in front of it. That is the copy the review said the extract was supposed to delete.

## Invariants

- `ensureAudible` is unchanged (empty queue return; `index < 0` → `playIndex(0)`; non-live source → `playIndex(pl.index)`; else `resume()`).
- Toggle does **not** read `playSource`. After `beginLoad`, source is `none` while companion may still be playing — a “live source only” pause would start a second `playIndex` and abort the in-flight exclusive load.
- Media Session `"play"` stays `ensureAudible` only. `"pause"` stays `activeSink.pause()`.
- `syncTransportFlags()` still runs at the end of `togglePlay`.

## Risks

- Gating pause on `playSource === streaming|downloaded` looks cleaner and is wrong during `beginLoad`. Do not do that.

## Implementation

### Files

- Change `src/musicweb/static/js/stores/player.js` (`togglePlay` only)

### Steps

1. Replace `togglePlay` with:

```js
export function togglePlay() {
  if (!activeSink.paused) {
    activeSink.pause();
  } else {
    ensureAudible();
  }
  syncTransportFlags();
}
```

2. Do not touch `ensureAudible`, `playIndex`, or Media Session handlers.

### Verify

- Read `togglePlay`: no `pl.length`, no `pl.index < 0`, no `playSource` check.
- `uv run --group dev pytest` (no JS runner; must stay green).
- Manual if a queue is handy: Play on empty is a no-op; Play with `index < 0` starts track 0; pause while playing pauses; Play after reload with `unavailable` retries via `ensureAudible`. Do **not** pause-during-exclusive-ensure if that would require a Mac companion this session — the `playSource` non-gate is verified by inspection.

## Acceptance

- [ ] `togglePlay` is pause vs `ensureAudible` only.
- [ ] `ensureAudible` and Media Session handlers are unchanged.
- [ ] No `playSource` branch in `togglePlay`.
