# Stage 02: Client companion token

## Status
done

## Description

Rename the PWA exclusive-audio secret from `hogToken` / `HOG_TOKEN` to `companionToken` / `COMPANION_TOKEN`, point Settings at `uv run musicweb companion`, and persist under a new localStorage key with no migrate.

## Rationale

Stage 01’s operator contract is `COMPANION_TOKEN` + `musicweb companion`. The Settings panel is the only in-app place that tells the user which command and env name to use.

## Invariants

- Settings section title stays **Exclusive audio (macOS)**.
- WebSocket hello still sends `{ token }`. No protocol version bump.
- `localStorage` key is `musicweb.exclusive.companionToken`. Do not read `musicweb.exclusive.hogToken`.
- No leftover `hogToken`, `setHogToken`, or `HOG_TOKEN` strings under `frontend/src/`.

## Risks

- Installed PWAs will show an empty token field until the user pastes again. Accepted (hard cut). Exclusive mode stays off or fails auth until then.

## Implementation

### Files

- `frontend/src/stores/exclusiveAudio.ts`
- `frontend/src/exclusive/companionClient.ts`
- `frontend/src/components/settings/ExclusiveAudioPanel.vue`

### Steps

1. In `frontend/src/stores/exclusiveAudio.ts`, rename state `hogToken` → `companionToken`, `setHogToken` → `setCompanionToken`, and `KEY_TOKEN` to `musicweb.exclusive.companionToken`. Load/persist only that key.
2. In `frontend/src/exclusive/companionClient.ts`, read `exclusiveAudio.companionToken` everywhere it currently reads `hogToken`. Hello payload field stays `token`.
3. In `frontend/src/components/settings/ExclusiveAudioPanel.vue`, import `setCompanionToken`. Hint code becomes `COMPANION_TOKEN=… uv run musicweb companion`. Field label `COMPANION_TOKEN`. Bind value and setters to `companionToken` / `setCompanionToken`. Keep the Exclusive audio title and enable-exclusive copy.

### Verify

```sh
pnpm --dir frontend typecheck
```

Confirm `frontend/src` has no `hogToken`, `setHogToken`, or `HOG_TOKEN`. In the installed Mac PWA (or desktop viewport of the Settings modal), open **Exclusive audio**: title unchanged, label `COMPANION_TOKEN`, hint shows `musicweb companion`. Paste a token, reload: it persists; an old `hogToken` value does not appear.

## Acceptance

- Settings tells the user to run `uv run musicweb companion` with `COMPANION_TOKEN`.
- Token persists only as `musicweb.exclusive.companionToken`.
- Companion hello still uses the `token` field.
- Typecheck is clean. No Python or docs edits in this stage.
