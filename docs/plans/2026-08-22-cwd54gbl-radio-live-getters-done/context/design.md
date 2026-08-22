**Archive.** Decisions in this file were current as of 2026-08-22 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Restore live radio audio getters

## Goal

Make household radio usable again: tuned-in seek bar and time follow the element clock, and the 1 Hz station snapshot no longer reseeks every tick. Restore live getters on the radio-owned audio object and pin that contract in tests and `docs/systems/radio.md`.

## Settled decisions

- This plan fixes the getter freeze from `6126d94` and adds regression tests. It does not harden `onFaceOrTrack` against restarting `loadCurrent` when `lastLoadedTrackId` is still null.
- `createRadioAudio` keeps a `PlaybackSink` (`kind: "htmlAudio"`) on the **same** object that owns the getters (`currentTime`, `paused`, `ended`, `loadInFlight`, `seekInFlight`) and returns that object. Do not object-spread it.
- Living documentation is one guardrail in `docs/systems/radio.md`. No ADR.

## Design

`createRadioAudio` used to return an object whose `currentTime` (and sibling flags) were getters over the private `HTMLAudioElement`. `6126d94` added `PlaybackSink` and ended with `return { ...radio, sink }`. Object spread **evaluates getters once**. At construction the element is idle, so the exported `radioAudio` permanently reports `currentTime === 0`, `paused === true`, `ended === false`, and both in-flight flags `false`. `load` / `seek` / `play` still mutate the live element because those methods close over it.

Tuned chrome reads that frozen `0` as the heard clock (`heardPosition` → `radioAudio.currentTime`). The official snapshot clock (`interpolatedPosition`) is fine, which is why tuned-out preview still moves. Every 1 s tick still runs `maybeReseek`. `needsReseek` is `|heard − official| > 2s`. Heard is always `0`, so after ~2 s of a song every tick seeks the **live** element back to the official position: play ~1 s, jump back, repeat.

Fix: build the getter object, assign `sink` onto it, return that same object. `PlaybackSink.currentTime` / `paused` already delegate to those getters and stay live. Callers (`heardPosition`, `maybeReseek`, Media Session pause/stop) see the element again. Tick reseeks only when real drift exceeds 2 s.

Tests must read `radio.currentTime` (and the flag getters), not only `radio.el.currentTime`. The existing sink test seeks the element and asserts `el.currentTime`, which is why `6126d94` shipped.

```text
tick (1 Hz) → applySnapshot → onFaceOrTrack
                                    │
                     same track, already loaded
                                    ▼
                              maybeReseek
                                    │
              |radioAudio.currentTime − official| > 2s ?
                    live getter          interpolatedPosition
```

## Stage map

1. **Restore getters + tests** — radio is broken until the returned object has live accessors; tests must fail on a second spread. Nothing else in this plan depends on a different return shape.
2. **radio.md guardrail** — write the durable “do not spread RadioAudio” rule against the construction stage 01 actually shipped, so the note cannot drift from the code.

## Out of scope

- Restarting `loadCurrent` on every snapshot while `lastLoadedTrackId` is null
- Removing `PlaybackSink` from radio audio
- Changing `RADIO_TICK_SECONDS`, serialize/position, stream Range, or `NowPlayingView`
- Exclusive-mode radio, radio listen stats, Remote DJ

## Assumptions

- Vitest’s `HTMLAudioElement` allows assigning `currentTime` without a loaded resource, matching the existing sink seek test.
- The 1 Hz now-playing push and 2 s drift threshold stay as they are; they are correct once `currentTime` is live.
- Production callers still do not read `radioAudio.sink`; the sink remains for the documented `PlaybackSink` contract and its unit test.
