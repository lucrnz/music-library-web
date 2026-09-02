# Stage 02: Hub spawn and immediate quit

## Status
done

## Description

Stop starting mpv (and stop enumerating devices) in the companion lifespan. The hub starts the player only for `set_device` and `load`, and calls `shutdown_process()` as soon as there is no selected device and no loaded URL.

## Rationale

Stage 01 only makes quit/respawn possible. This stage is the product change: a Downloads-only or watch-only companion has no idle child and no boot-time `mpv --audio-device=help`.

## Invariants

- Lifespan does not call `MpvPlayer.start()` and does not call `list_output_devices()`.
- `list_devices` still refreshes `self._devices` via `list_output_devices()` and does not start the idle player.
- After `_cmd_set_device` / `_rearm_device` / `_cmd_load`, a hog-capable platform has called `start()` (via the player methods from stage 01, or an explicit hub `start()` immediately before those calls).
- Exclusive-off `_cmd_load` order is: ensure child → `use_auto_output` → `load`. `use_auto_output` alone never starts the child.
- After `release_device`, exclusive-off `stop` (hub `selected_device_id` is None and snapshot `url` is empty), controller TTL, and controller disconnect, the hub calls `shutdown_process()` once the player is idle. Armed exclusive `stop` (device still selected) does not quit.
- Pause / resume / seek / set_volume never start the child.
- Linux stub: still no child. Fake players used by hub tests implement `start` / `shutdown_process` so AttributeError cannot hide a missed call.
- No WebSocket protocol change.

## Risks

- Quitting in `release_device` then immediately `load` (CD exclusive toggle) respawns; that is accepted, but a missing `start()` on the reload path hard-fails play.
- Calling `shutdown_process()` while a device is still selected drops hog. Only call it when both device id and url are empty.
- Optical tests’ `FakePlayer` only has `release_device` today; hub quit will AttributeError unless that fake grows `shutdown_process`.

## Implementation

### Files

- `src/musicweb/exclusive/app.py`
- `src/musicweb/exclusive/session.py`
- `src/musicweb/exclusive/protocol.py`
- `tests/test_exclusive_hub_release.py`
- `tests/exclusive/test_optical.py`

### Steps

1. In `src/musicweb/exclusive/app.py` lifespan, remove `hub.start_player()` (keep `bind_loop` and `ensure_ttl_watch`). Companion ready log stays.
2. In `src/musicweb/exclusive/session.py`, change `start_player()` so it does not start mpv and does not list devices (empty body or delete the method if nothing else calls it). `_devices` stays `[]` until the first `MSG_LIST_DEVICES`.
3. Add `_shutdown_player_if_idle()` that calls `self._player.shutdown_process()` only when `self._device_id` is None and `status_snapshot().get("url")` is empty. Invoke it at the end of `_cmd_release_device`, `_ensure_no_controller_exclusive`, and `_cmd_stop` (so exclusive-off stop quits; hog-armed stop does not).
4. Keep `_cmd_load` hog=false as `use_auto_output` then `load`, but ensure the child exists before `use_auto_output` (call `self._player.start()` in the hub immediately before that pair, or rely on `load` starting and move `use_auto_output` to after `start()` / before `loadfile` inside the already-started player). Do not start from `use_auto_output` itself.
5. `_cmd_set_device` and `_rearm_device` keep calling `set_device` (stage 01 auto-starts). `_cmd_pause` / `_cmd_resume` / `_cmd_seek` / `_cmd_set_volume` stay as they are (player no-ops if down).
6. In `src/musicweb/exclusive/protocol.py`, update the `CONTROLLER_TTL_S` comment: idle TTL unhogs **and** quits the mpv child; reclaim/`set_device` respawns.
7. In `tests/test_exclusive_hub_release.py` `FakePlayer`, add `start_calls` / `shutdown_calls`, `start()`, and `shutdown_process()` (shutdown may clear device/url like a real quit). Assert: `set_device` and hog=false `load` call `start`; `release_device`, TTL, and controller disconnect call `shutdown_process`; `stop` with a selected device does not; `stop` with no device and no url does; `pause` / `list_devices` do not call `start`. Existing release/TTL/readonly tests still pass.
8. In `tests/exclusive/test_optical.py` `FakePlayer`, add no-op `start` and `shutdown_process` so `test_release_device_leaves_watch_and_reader` still proves watch/reader survive `release_device`.

### Verify

- `uv run --group dev pytest tests/test_exclusive_hub_release.py tests/exclusive/test_optical.py tests/exclusive/test_blob_http.py tests/exclusive/test_mpv_lifecycle.py` passes.
- `rg "start_player\\(\\)" src/musicweb/exclusive/app.py` is empty (or the remaining call is not in lifespan).
- `rg "list_output_devices" src/musicweb/exclusive/session.py` hits only the `MSG_LIST_DEVICES` path.

## Acceptance

- Companion lifespan leaves `_player` unstarted and `_devices` empty.
- First `list_devices` still returns a merged device list without starting the idle child.
- Hog arm / CD auto `load` start the child; release, exclusive-off stop, TTL, and disconnect quit it immediately when idle.
- Optical watch is unchanged by `release_device` / player shutdown.
- Blob HTTP tests still do not boot mpv.
