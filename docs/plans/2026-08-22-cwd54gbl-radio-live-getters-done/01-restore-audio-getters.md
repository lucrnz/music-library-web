# Stage 01: Restore live RadioAudio getters

## Status
done

## Description

Stop object-spreading the radio audio object. Attach `PlaybackSink` on the same object that owns the getters and return that object so `currentTime`, `paused`, `ended`, `loadInFlight`, and `seekInFlight` stay live. Extend the radio audio and store tests so a later spread cannot hide behind `el.currentTime`.

## Rationale

This is the entire playback break: frozen `currentTime === 0` sticks the seek bar and makes every 1 Hz tick reseek. Restoring the getters makes radio usable; the new assertions are what would have blocked `6126d94`.

## Invariants

- `createRadioAudio()` returns one object: live getters plus `sink.kind === "htmlAudio"`.
- After `el.currentTime` (or `sink.seek`) changes, `radio.currentTime` equals the element’s `currentTime`. A second assignment still matches (not a construction-time snapshot).
- `loadInFlight`, `seekInFlight`, `paused`, and `ended` are accessor properties on the returned object, not data properties.
- `heardPosition` while `chrome === "tuned"` returns the live `radioAudio.currentTime`, not `interpolatedPosition`.
- `maybeReseek` / `load` / `seek` / `play` behavior and the 2 s drift threshold do not change except that they now read a live clock.

## Risks

- Assigning `sink` onto an object typed as `Omit<RadioAudio, "sink">` needs a single cast or a `RadioAudio`-typed result. Do not rebuild via object spread to satisfy the type.
- Happy-dom may clamp `currentTime` when no media is loaded. Use the same path as the existing sink seek test (`sink.seek` / assign `el.currentTime`) and compare `radio.currentTime` to `el.currentTime`, not to a hardcoded value the environment might rewrite.

## Implementation

### Files

- `frontend/src/radio/audio.ts`
- `frontend/tests/radio/audio.test.ts`
- `frontend/tests/stores/radio.test.ts`

### Steps

1. In `frontend/src/radio/audio.ts`, keep building the getter object and the `PlaybackSink` that closes over it. Assign `sink` onto that same object and `return` it. Delete `return { ...radio, sink }`.
2. In `frontend/tests/radio/audio.test.ts`, add cases that: (a) after `sink.seek` (or `el.currentTime = …`), `radio.currentTime` equals `radio.el.currentTime` when `el` exists; (b) a later `el.currentTime` change still updates `radio.currentTime`; (c) `Object.getOwnPropertyDescriptor` on the returned object shows getters for `currentTime`, `paused`, `ended`, `loadInFlight`, and `seekInFlight`. Keep the existing latch and `sink.kind` tests.
3. In `frontend/tests/stores/radio.test.ts`, add a tuned-chrome case: `applySnapshot` as today, set `radio.chrome = "tuned"`, set `radioAudio.el.currentTime` to a nonzero value when `el` exists, and expect `heardPosition(...)` to equal that element time (not `0` and not the interpolated official clock).

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/radio/audio.test.ts frontend/tests/stores/radio.test.ts frontend/tests/radio/session.test.ts
pnpm --dir frontend typecheck
```

On a running app (`uv run musicweb` with a built SPA, or `pnpm --dir frontend dev` against the API): open `/radio`, Tune in mid-track, confirm the seek bar and elapsed time leave `0:00` and advance without a 1 s skip loop, then Tune out and confirm preview time still interpolates.

## Acceptance

- `createRadioAudio()`’s returned `currentTime` tracks `el.currentTime` after two successive assignments (proven in `frontend/tests/radio/audio.test.ts`).
- The five transport fields above are getters on the returned object (same test file).
- `heardPosition` in chrome `tuned` follows `radioAudio`’s live clock (proven in `frontend/tests/stores/radio.test.ts`).
- `pnpm --dir frontend typecheck` passes.
- Browser tune-in on `/radio` shows advancing seek/time and does not skip once per second.
