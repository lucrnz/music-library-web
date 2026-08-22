# Stage 02: Radio volume subscribe

## Status
done

## Description

Subscribe radio audio to the playerPrefs volume registry from a boot-time `initRadioListeners()` called in `main.ts` before `createApp()`. Remove the volume `watch` from `bindVolumeWatch`. After this stage, `setOutputVolume` (either slider) sets `radioAudio` even if RadioView has never mounted or has unmounted.

## Rationale

This is the reported bug. Stage 01 made apply global for whoever subscribes; radio still dies with RadioView until it uses the registry from a detached init.

## Invariants

- `radio.ts` does not import `player.ts`. `player.ts` does not import `radio.ts`.
- Radio has no `watch` on `player.volume`. Live apply is only `subscribeOutputVolume`.
- `initRadioListeners()` is idempotent. `resetRadioStore()` does not unsubscribe.
- `tuneIn` may still call `audio.setVolume(player.volume)` once; it is not required for later slider moves.
- Both sliders keep `:volume="player.volume"` and `setOutputVolume` (via `setVolume` on-demand). No `NowPlayingView` change.

## Risks

- Exporting `initRadioListeners` from `radio.ts` and importing it in `main.ts` loads the radio module at boot. That is accepted (see `context/design.md`). Do not fix that by putting a `watch` at `radio.ts` top level — first import from a component would reattach the bug.
- `bindVolumeWatch` still registers codec/policy watches until stage 03. Do not delete that function yet; only remove the volume `watch` and any volume-only latch comments that become lies.

## Implementation

### Files

- `frontend/src/stores/radio.ts`
- `frontend/src/main.ts`
- `frontend/tests/stores/radio.test.ts`

### Steps

1. In `frontend/src/stores/radio.ts`, export `initRadioListeners()`: latch once, `subscribeOutputVolume((v) => audio.setVolume(v))`. Do not call `watch` on `player.volume` here. Remove the volume `watch` from `bindVolumeWatch`. Keep `bindVolumeWatch` for streamCodec / playbackPolicy. `connect()` still calls `bindVolumeWatch`. Change `tuneIn`’s one-shot from `readVolume() ?? 1` to `player.volume` (the face store is already imported).
2. In `frontend/src/main.ts`, call `initRadioListeners()` after `initOutputVolume()` and next to `initAudioListeners()`, still before `createApp()`.
3. In `frontend/tests/stores/radio.test.ts`, call `initRadioListeners()` from `beforeEach` (idempotent). Add a case that does **not** call `connect()` / `setTabOpen`: `setOutputVolume(0.35)` then expect `radioAudio.el.volume` to be `0.35` when `el` exists. Add a second write (`0.1`) and expect the element to follow. Import `setOutputVolume` from `@/stores/playerPrefs`, not from the on-demand player store.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/stores/radio.test.ts frontend/tests/stores/playerPrefs.test.ts frontend/tests/radio/session.test.ts
pnpm --dir frontend typecheck
```

On a running app: set the on-demand slider to a mid value, open `/radio`, Tune in — radio plays at that level. Leave `/radio` (desktop compact bar or return later), drag the radio slider — level changes. Return to a queue track — the on-demand slider shows the same value and applies.

## Acceptance

- `frontend/tests/stores/radio.test.ts` proves `setOutputVolume` changes `radioAudio.el.volume` without `connect()` or RadioView.
- `frontend/src/stores/radio.ts` has no `watch` on `player.volume`.
- `pnpm --dir frontend typecheck` passes.
- After leaving `/radio`, the radio slider changes the radio element; the on-demand slider still shares the face.
