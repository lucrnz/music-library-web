# Stage 04: Living docs

## Status
done

## Description

Rewrite the volume and radio-watch sentences in living docs so they match stages 01–03: one writer, one boot-time apply watch in `playerPrefs`, sink subscribers, radio listeners inited from `main.ts` before `createApp()`. Do not treat `context/design.md` as living documentation.

## Rationale

`playerPrefs.ts`, `playback.md`, `radio.md`, and `conventions.md` still say each store watches `player.volume`. After 01–03 those sentences are false and will recreate the RadioView-scoped watch.

## Invariants

- Living docs describe shipped client behavior only. No ADR. No exclusive-radio volume redesign.
- Source of truth for encode argv, HTTP shapes, and exact slider DOM stays the code.
- `player.ts` does not import `radio.ts`; `radio.ts` does not import `player.ts` — keep those bullets.

## Risks

- Leaving “radio already watches” / “player.ts watches `player.volume` and applies the active sink” as if those were still the live apply path.

## Implementation

### Files

- `docs/systems/radio.md`
- `docs/systems/playback.md`
- `docs/frontend/conventions.md`
- `docs/`

### Steps

1. In `docs/systems/radio.md` **Client**, replace the sentence that radio watches `player.volume` from the player face store with: `playerPrefs` owns the one volume `watch` (`initOutputVolume` from `main.ts` before `createApp`); radio subscribes `radioAudio.setVolume` from `initRadioListeners()` (same boot, no component). StreamCodec, playbackPolicy, and connectivity watches live in that same init, not in `connect()`. Keep the existing “radio store must not import the on-demand player store” guardrail.
2. In `docs/systems/radio.md` **Guardrails**, add: do not register a Vue `watch` from `connect()` / RadioView `onMounted`; do not attach the volume apply watch to a component effect scope.
3. In `docs/systems/playback.md`, in the player / prefs paragraph, replace the sentence that the on-demand player store watches `player.volume` and applies the active sink with: `setOutputVolume` is the only writer (face + storage); `playerPrefs.initOutputVolume` notifies subscribers; on-demand subscribes `getActiveSink().setVolume`; radio subscribes its own element. In the household-radio paragraph, replace “Radio watches `player.volume` and `settings.playbackPolicy`” with the same subscriber + `initRadioListeners` wording (playbackPolicy stays a radio-owned watch, just boot-time).
4. In `docs/frontend/conventions.md` **Architecture** stores bullet, replace the volume sentence the same way. Mention `initOutputVolume` / `initRadioListeners` next to the other `main.ts` inits.
5. Grep `docs/` excluding `docs/plans/` for leftover “radio already watches”, “player.ts watches `player.volume`”, and `bindVolumeWatch`.

### Verify

```sh
rg -n "radio already watches|player\.ts watches \`player\.volume\`|bindVolumeWatch" docs --glob '!docs/plans/**'
```

Read the edited volume sentences in the three files and confirm they match stages 01–03 (one prefs watch, two subscribers, radio listeners from `main.ts`). No frontend test run required unless a later edit accidentally touched source.

## Acceptance

- `docs/systems/radio.md`, `docs/systems/playback.md`, and `docs/frontend/conventions.md` describe the subscriber registry and boot-time radio listeners.
- Grep in step 5 is clean.
- No ADR file.
