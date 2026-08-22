# Stage 02: Radio.md getter guardrail

## Status
done

## Description

Add one guardrail to `docs/systems/radio.md`: the radio-owned audio object must expose live getters and must not be object-spread when attaching `PlaybackSink`.

## Rationale

Stage 01 restores the construction; this stage writes the rule into the living radio doc so a later ownership split does not reintroduce `{ ...radio, sink }`.

## Invariants

- The new bullet lives under **Guardrails** in `docs/systems/radio.md`.
- It names the failure mode (spread snapshots getters; tuned `heardPosition` / `maybeReseek` then see `0`).
- It does not restate the full client clock design already in the Client section and in `docs/systems/playback.md`.

## Risks

None

## Implementation

### Files

- `docs/systems/radio.md`

### Steps

1. In the **Guardrails** list of `docs/systems/radio.md`, add a bullet: `createRadioAudio` returns one object with live getters (`currentTime`, `paused`, `ended`, `loadInFlight`, `seekInFlight`) and `sink`; do not object-spread that object to attach `PlaybackSink` — spread copies getter values at construction (`currentTime` stays `0`) and makes every tick reseek.
2. Do not change the Client paragraph unless a wording clash appears; the existing “tuned follows `audio.currentTime` (re-seek if drift > 2s)” sentence stays the behavior spec.

### Verify

```sh
rg -n "object-spread|live getters" docs/systems/radio.md
```

Confirm the new bullet is under **Guardrails** and that **Client** still describes tuned vs interpolated clocks.

## Acceptance

- `docs/systems/radio.md` Guardrails forbids object-spreading the radio audio object and says why (frozen `currentTime` / 1 Hz reseek).
- No frontend or server source files change in this stage.
