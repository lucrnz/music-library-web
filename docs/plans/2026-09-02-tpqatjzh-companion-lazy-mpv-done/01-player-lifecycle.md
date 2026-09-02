# Stage 01: Reversible mpv process lifecycle

## Status
done

## Description

Give `MpvPlayer` a start/stop cycle that can run more than once in one companion process: spawn on demand, tear the OS child down without treating that as a crash, and leave transport commands no-ops when no child is up. Do not change hub or lifespan behavior yet.

## Rationale

Today `close()` sets `_closed` for good and `release_device` keeps `--idle=yes` running. Stage 02 cannot quit-and-respawn until the player object survives a shutdown and tests can lock that without booting mpv.

## Invariants

- Construction does not start a child. `start()` remains idempotent while a child (or Linux stub) is already up.
- After `shutdown_process()`, `start()` may run again (new IPC socket/pipe). After `close()`, further starts are refused.
- Intentional shutdown does not invoke `on_event("error", …)` for IPC close. Unexpected IPC death still does.
- `pause`, `resume`, `seek`, `set_volume`, `stop`, `release_device`, and `use_auto_output` do not call `start()`. With no IPC they return without raising. `stop` / `release_device` still clear local url/device/hog state. `set_volume` may update `ExclusiveVolume` for the next spawn.
- `set_device` and `load` call `start()` when no child is up (so stage 02 can treat those methods as the spawn edge). If `_sock` is already set (volume unit tests), do not spawn.
- Tests never invoke a real mpv binary. Linux stub path stays a no-op with `_proc is None`.
- Existing volume restore order on `release_device` / `close()` is unchanged.

## Risks

- Resetting `_closed` incorrectly lets `_read_loop` fire a late “IPC closed” after a deliberate quit.
- `set_device` auto-start would spawn in `tests/test_exclusive_mpv_volume.py` unless the “already have `_sock`” guard stays in place.

## Implementation

### Files

- `src/musicweb/exclusive/mpv_player.py`
- `tests/exclusive/test_mpv_lifecycle.py`
- `tests/test_exclusive_mpv_volume.py`

### Steps

1. In `src/musicweb/exclusive/mpv_player.py`, add `running` (child or stub is up) and `shutdown_process()` that: sets an intentional-stop flag, unhogs/restores if a device is still selected (same order as `close()`), sends `quit` if connected, closes the socket, terminates the child, joins stderr/reader threads, cleans the IPC tempdir, clears `_proc` / `_sock` / `_ipc` / `_tmpdir`, clears `_closed` so `start()` can run again, and does **not** call `on_event("error")`.
2. Change `close()` to call `shutdown_process()` (or share the teardown) and then set `_closed = True` so a later `start()` is a no-op. Companion exit still restores hardware volume once.
3. In `start()`, if `_closed` after a final `close()`, return. Otherwise keep the current stub / missing-binary / popen / observe-property behavior. Reset the intentional-stop flag when launching.
4. In `_read_loop`, skip the `on_event("error", {"message": "mpv IPC closed"})` path when the intentional-stop flag is set or `_closed` was set by `shutdown_process`/`close`.
5. At the start of `set_device` and `load` (after the stub check), call `start()` only when `_proc is None` and `_sock is None` and not `_stub`.
6. At the start of `pause`, `resume`, `seek`, `set_volume`, `stop`, `release_device`, and `use_auto_output` (after stub checks), if `_sock is None` and not `_stub`, return without raising. `stop` / `release_device` still run their local state clears / volume restore. `set_volume` still calls `_vol.set_user`.
7. Add `tests/exclusive/test_mpv_lifecycle.py` that monkeypatches `popen`, `connect_ipc`, and `hog_supported` (never a real binary). Cover: construct does not spawn; `set_device`/`load` spawn once; second `start()` is a no-op; `shutdown_process()` then `set_device` spawns again; `pause`/`stop`/`release_device`/`use_auto_output` on a never-started player do not spawn; intentional shutdown does not call `on_event`; simulated unexpected IPC close does; `close()` then `start()` does not spawn.
8. In `tests/test_exclusive_mpv_volume.py` `_bind`, keep injecting `_sock` so `set_device` does not take the new auto-start path. Existing volume assertions stay.

### Verify

- `uv run --group dev pytest tests/exclusive/test_mpv_lifecycle.py tests/test_exclusive_mpv_volume.py` passes.
- `rg "Starting mpv" tests/exclusive/test_mpv_lifecycle.py` is empty (no real spawn).
- Companion lifespan still calls `hub.start_player()` — this stage does not change that.

## Acceptance

- `MpvPlayer` can start, shut down, and start again in one object lifetime without a real mpv.
- Down-process transport is silent; only `set_device` and `load` spawn.
- Intentional teardown is not reported as `mpv IPC closed`.
- Volume unit tests still pass without launching mpv.
