# Stage 05: Exclusive commands

## Status
done

## Description

Replace the lazy class `_COMMANDS` with a module-level typed table and one `_with_live`. Drop `MSG_PLAY`, unread live mirrors, and `commitHogToken`.

## Rationale

The invert deleted the store→client cycle. This stage deletes the leftover command ladder and the fields nobody reads.

## Invariants

- Store still does not import `companionClient`. Panel / `main.ts` still call `syncCompanionConnection` / `syncPreferredDevice`.
- Heartbeat stays a special case. `list_devices` stays allowed for readonly.
- Inbound hello/device still accept camel or snake. Device caps stay `sample_rates` / `bit_depths`.
- Controller loss still releases the exclusive device (existing hub-release tests).

## Risks

- `_with_live` must re-check after every `await` the way `_still_live` + `_cmd_set_device` do today, or a demoted controller can still hog.
- Dropping `MSG_PLAY` is safe only because the PWA never sends it; do not keep a compatibility alias.

## Implementation

### Files

- `src/musicweb/exclusive/session.py`
- `src/musicweb/exclusive/protocol.py`
- `frontend/src/exclusive/protocol.ts`
- `frontend/src/exclusive/companionClient.ts`
- `frontend/src/stores/exclusiveAudio.ts`
- `frontend/src/components/settings/ExclusiveAudioPanel.vue`
- `tests/test_exclusive_hub_release.py`
- `tests/test_exclusive_protocol.py`

### Steps

1. In `src/musicweb/exclusive/session.py`, replace the lazy `ExclusiveHub._COMMANDS = {}` fill with a module-level table `{type: (handler, broadcast)}`. Add `_with_live(sess)` used after every await in `_handle_controller` and `_cmd_set_device`. Delete `_still_live` once nothing calls it. Heartbeat and `list_devices` stay in `handle_message` (readonly-allowed).
2. Delete `MSG_PLAY` from `src/musicweb/exclusive/protocol.py` and `frontend/src/exclusive/protocol.ts`. Remove the `MSG_PLAY` → `_cmd_load` alias.
3. Delete `companionPlaying` / `companionPaused` from `frontend/src/stores/exclusiveAudio.ts` (state, `setExclusiveLive`, defaults). Stop writing them in `frontend/src/exclusive/companionClient.ts`.
4. Delete `commitHogToken`. In `frontend/src/components/settings/ExclusiveAudioPanel.vue`, token commit calls `setHogToken` (already persists) then `syncCompanionConnection` as today.
5. Update `tests/test_exclusive_hub_release.py` and `tests/test_exclusive_protocol.py` if they mention `MSG_PLAY` or poke `_COMMANDS` / `_still_live`.

### Verify

- `uv run pytest tests/test_exclusive_hub_release.py tests/test_exclusive_protocol.py tests/test_exclusive_volume.py tests/test_exclusive_mpv_volume.py`
- `pnpm --dir frontend test -- frontend/tests/exclusive/protocol.test.ts frontend/tests/exclusive/formatPolicy.test.ts`
- `pnpm --dir frontend typecheck`
- `rg -n "MSG_PLAY|commitHogToken|companionPlaying|companionPaused|_still_live" src/musicweb/exclusive frontend/src/exclusive frontend/src/stores/exclusiveAudio.ts frontend/src/components/settings/ExclusiveAudioPanel.vue` is empty

## Acceptance

- Companion controller commands are a module-level table. One `_with_live`. No lazy class dict.
- `MSG_PLAY`, `commitHogToken`, and unread companion playing/paused fields are gone.
- Store still does not import the client. Panel still pairs setters with `sync*`.
