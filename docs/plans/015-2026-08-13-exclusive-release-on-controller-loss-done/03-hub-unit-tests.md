# Stage 03: Hub unit tests for controller-loss release

## Status
done

## Description

Add focused unit tests that the hub invariant holds with a mocked `MpvPlayer` (no real mpv / Core Audio), including release-then-clear ordering on failure.

## Rationale

Mac gate (stage 05) proves OS-level free. Tests prove the software coupling: controller loss always calls release when it should, does not call it for readonly disconnect, does not release on hello replace, and does not clear hub device id if release fails.

## Implementation

- Under `tests/` (e.g. `test_exclusive_hub_release.py`), inject or monkeypatch a fake player on `ExclusiveHub` with:
  - `release_device` call counter / flag; optional fail mode that raises
  - `set_device`, `status_snapshot` stubs as needed
  - No real subprocess
- Cases:
  1. **Controller disconnect:** after becoming controller (stub websocket / direct hub state), `handle_disconnect(controller_id)` → `release_device` called once, hub `_device_id` is `None`.
  2. **TTL demotion:** controller session with stale `last_heartbeat` → `_check_ttl` → release once, `_controller_id is None`.
  3. **Readonly disconnect:** second session readonly disconnect → `release_device` not called.
  4. **Idempotent ensure:** double disconnect / ensure → no throw; second release safe.
  5. **Hello replace does not release:** connect-hello path does not invoke release when re-helloing same session as controller.
  6. **Release failure keeps hub id:** with device set, force `release_device` to raise on controller disconnect → `_device_id` remains set (not cleared); release was attempted.
- Prefer pure asyncio tests; mock websockets lightly or call hub methods directly.
- Run with existing `uv run pytest` (or project’s documented test command).
- No production code changes unless a tiny seam is required for injecting the fake player (prefer constructor / existing `_player` assignability over a new DI framework).
