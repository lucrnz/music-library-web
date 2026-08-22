# Stage 01: Prefs volume registry

## Status
done

## Description

Move output-volume apply into `playerPrefs.ts`: hydrate from localStorage, one detached `watch` on `player.volume`, and a subscriber registry. Boot that watch from `main.ts` before `createApp()`. The on-demand path subscribes `getActiveSink().setVolume` and drops its own volume `watch`. Radio still uses its existing watch until stage 02.

## Rationale

The app already has one writer and one face. Apply is still forked (player watch vs radio watch). A registry in the writer module is the ownership the comments already describe; queue can subscribe without importing radio.

## Invariants

- `setOutputVolume` remains the only writer of `player.volume` and `musicweb.volume`.
- `initOutputVolume()` is safe to call more than once (no second watch).
- `subscribeOutputVolume(fn)` invokes `fn(player.volume)` immediately and again on every later `setOutputVolume`.
- The unsubscribe function returned by `subscribeOutputVolume` stops further calls.
- `player.ts` does not import `radio.ts`. `playerPrefs.ts` does not import `player.ts` or `radio.ts`.
- `initAudioListeners` no longer `watch`es `player.volume`.

## Risks

- Boot order: hydrate, then `initOutputVolume`, then `initAudioListeners` (subscribe). Subscribing before hydrate would apply the default `1` and then need a later write.
- Removing `applyVolume`’s `getActiveSink().setVolume` without an immediate subscribe would leave the queue element at 1 until the first slider move.

## Implementation

### Files

- `frontend/src/stores/playerPrefs.ts`
- `frontend/src/stores/player.ts`
- `frontend/src/main.ts`
- `frontend/tests/stores/playerPrefs.test.ts`

### Steps

1. In `frontend/src/stores/playerPrefs.ts`, add: `hydrateOutputVolume()` (current `readVolume` → `player.volume` if stored); `subscribeOutputVolume(fn)` (store `fn`, call it with `player.volume`, return unsubscribe); `initOutputVolume()` (one `watch` on `() => player.volume` that notifies subscribers; latch so a second call is a no-op). Keep `setOutputVolume` as the only writer. Do not import the on-demand player store or the radio store.
2. In `frontend/src/stores/player.ts`, delete the `player.volume` `watch` from `initAudioListeners`. Subscribe `getActiveSink().setVolume` there instead. Delete `applyVolume`’s sink apply (hydrate moves to playerPrefs). Keep `setVolume` as a `setOutputVolume` wrapper. Do not import the radio store.
3. In `frontend/src/main.ts`, replace `applyVolume()` with `hydrateOutputVolume()` then `initOutputVolume()` (both from playerPrefs), still **before** `createApp()`, and still before `initAudioListeners()`.
4. In `frontend/tests/stores/playerPrefs.test.ts`, add cases that: (a) `hydrateOutputVolume` sets `player.volume` from `musicweb.volume` when the stored value is in `[0, 1]`; (b) after `initOutputVolume`, `setOutputVolume(0.4)` notifies a subscriber with `0.4` and writes storage; (c) unsubscribe then `setOutputVolume(0.2)` does not notify that subscriber; (d) `initOutputVolume` twice does not double-notify. Reset `player.volume` and the storage key in `beforeEach`.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/stores/playerPrefs.test.ts
pnpm --dir frontend typecheck
```

On a running app, play a queue track and drag the on-demand slider: level still changes and survives a reload (storage). Do not expect the radio slider apply fix until stage 02.

## Acceptance

- `frontend/tests/stores/playerPrefs.test.ts` proves hydrate, notify, unsubscribe, and single `initOutputVolume`.
- `frontend/src/stores/player.ts` has no `watch` on `player.volume`.
- `pnpm --dir frontend typecheck` passes.
- On-demand volume still changes the playing queue (or companion) sink.
