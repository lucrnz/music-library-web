# Stage 07: Exclusive invert

## Status
done

## Description

One-way exclusive imports: store is prefs + snapshot setter; `companionClient` owns the socket. `ExclusiveDevice` is `sample_rates` / `bit_depths` only. Companion `session.py` uses `_with_live` and a `COMMANDS` dict.

## Rationale

The `companion()` dynamic import exists only to hide a cycle. Dual device casings and the copied live-controller lock are how the next exclusive command will add an eighth clone.

## Invariants

- Exclusive remains Mac PWA + loopback companion. Not Electron. Not in the library process.
- Armed / refuse-lossy / refuse-download rules do not change.
- Wire still accepts `deviceId` or `device_id` on inbound messages.
- `exclusiveStatusSnapshot()` is an `ExclusiveFaceSnapshot` (no cast at the status line).
- Store does not import `companionClient` (static or dynamic).

## Risks

- Settings toggles and `initExclusiveAudio` must call the client or exclusive never connects.
- `_handle_controller` dual lock around mpv work is load-bearing; `_with_live` must preserve “still controller after await”.

## Implementation

### Files

- `frontend/src/stores/exclusiveAudio.ts`
- `frontend/src/exclusive/companionClient.ts`
- `frontend/src/exclusive/formatPolicy.ts`
- `frontend/src/exclusive/statusFace.ts`
- `frontend/src/main.ts`
- `frontend/src/components/settings/ExclusiveAudioPanel.vue`
- `frontend/src/components/player/PlaybackStatusLine.vue`
- `frontend/src/components/player/NowPlayingFull.vue`
- `src/musicweb/exclusive/session.py`
- `frontend/tests/exclusive/protocol.test.ts`
- `frontend/tests/exclusive/formatPolicy.test.ts`
- `tests/test_exclusive_protocol.py`
- `tests/test_exclusive_hub_release.py`

### Steps

1. In `frontend/src/stores/exclusiveAudio.ts`, keep persisted prefs, `exclusiveStatusSnapshot`, `getExclusiveProfileTag`, `isExclusiveEnabled` / `isExclusiveArmed`. Add `setExclusiveLive(...)` (connection, role, devices, live device id, lastError, playing/paused). Delete `companion()` and every `import("@/exclusive/companionClient")`. `setExclusiveEnabled` / `setHogToken` / `setExclusivePort` / `setSelectedDeviceId` / `commitHogToken` only persist; they do not talk to the socket.
2. `companionClient.ts` reads prefs from the store and writes live fields through `setExclusiveLive`. Export `syncCompanionConnection` / `disconnectCompanion` / `syncPreferredDevice` as now. `main.ts` after `initExclusiveAudio` (and `ExclusiveAudioPanel.vue` after persist) call `syncCompanionConnection` / `syncPreferredDevice` / `disconnectCompanion` directly.
3. Normalize devices once at the wire in `companionClient.ts` to `{ id, name, sample_rates, bit_depths }`. Delete `sampleRates?` / `bitDepths?` from `ExclusiveDevice` and the `sample_rates || sampleRates` picks in `exclusiveAudio.ts` and `formatPolicy.ts`.
4. `exclusiveStatusSnapshot()` returns `ExclusiveFaceSnapshot`. Delete the `as ExclusiveFaceSnapshot` casts in `NowPlayingFull.vue` and `PlaybackStatusLine.vue`.
5. In `src/musicweb/exclusive/session.py`, add `_with_live(sess)` that re-checks controller after awaits. Replace `_handle_controller`’s per-command lock copies with a `COMMANDS` map (`MSG_PAUSE` / `MSG_RESUME` / `MSG_STOP` / `MSG_SEEK` / `MSG_SET_VOLUME` / `MSG_LOAD` / `MSG_SET_DEVICE` / `MSG_LIST_DEVICES` as appropriate). Heartbeat stays in `handle_message`. Inbound `deviceId` / `device_id` still both work. Broadcast-after is a flag on the command, not a second copied lock block.
6. Update `frontend/tests/exclusive/formatPolicy.test.ts` and protocol tests for single-casing devices. Hub/protocol pytest stays behavior-identical (readonly, disconnect release, command errors).

### Verify

- `pnpm --dir frontend test -- frontend/tests/exclusive/protocol.test.ts frontend/tests/exclusive/formatPolicy.test.ts frontend/tests/playback/playbackStatus.test.ts`
- `uv run pytest tests/test_exclusive_protocol.py tests/test_exclusive_hub_release.py tests/test_exclusive_volume.py tests/test_exclusive_mpv_volume.py`
- `pnpm --dir frontend typecheck`
- `rg -n "import\\(\\\"@/exclusive/companionClient\\\"\\)|function companion\\(" frontend/src` is empty
- `rg -n "sampleRates|bitDepths" frontend/src/stores/exclusiveAudio.ts frontend/src/exclusive/formatPolicy.ts frontend/src/exclusive/companionClient.ts` is empty
- `rg -n "from \\\"@/exclusive/companionClient\\\"" frontend/src/stores/exclusiveAudio.ts` is empty

## Acceptance

- `exclusiveAudio.ts` does not import the client. Client writes live state through `setExclusiveLive`.
- `ExclusiveDevice` has one casing. Status snapshot needs no cast.
- Companion command ladder is `_with_live` + `COMMANDS`. Dual inbound device id keys still work.
- Exclusive enable/arm/refuse/load behavior matches today.
