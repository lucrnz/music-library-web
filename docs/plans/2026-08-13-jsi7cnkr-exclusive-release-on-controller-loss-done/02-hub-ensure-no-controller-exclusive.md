# Stage 02: Hub ensure — no controller ⇒ no exclusive

## Status
done

## Description

Encode the invariant **no controller ⇒ no exclusive hold** in one hub helper. Call it only when the controller is lost via WebSocket disconnect or heartbeat TTL demotion. Release mpv first, then clear hub device id, then broadcast status.

## Rationale

Today disconnect only clears the software controller lock (`lock free` log) and never touches mpv. Both disconnect and TTL leave `_controller_id is None`; both must drop hardware. A single helper prevents divergent disconnect/TTL paths and avoids scattering release logic into hello. Ordering release before clearing hub id keeps status honest if mpv release fails.

## Implementation

- In `src/musicweb/exclusive/session.py`:
  - Add one private async helper, e.g. `_ensure_no_controller_exclusive()`, that:
    - Is called only after `_controller_id` has been set to `None` at a controller-loss site (prefer call only from those sites; no-op or assert if a controller still exists).
    - **Order (atomicity):**
      1. `await asyncio.to_thread(self._player.release_device)` (stage 01).
      2. On success: set `_device_id = None`.
      3. Broadcast status (caller may broadcast once after the helper; either way status must reflect post-release state).
    - If `release_device` **throws**: do **not** clear `_device_id` (hub still admits a live target may be held); log the error; re-raise or surface via existing error paths so the failure is visible. Do not invent a multi-state machine.
    - **Idempotent** on the success path (second call: release is no-op-safe, `_device_id` already `None`).
  - **`handle_disconnect`:** if departing session was controller → clear `_controller_id`, log, call ensure helper, broadcast status. Readonly disconnect: no release.
  - **`_check_ttl`:** when demoting controller to readonly and clearing `_controller_id` → call the same ensure helper, then status broadcast (include existing `reason=controller_ttl` to the demoted session).
  - **Hard rule:** **never** call the ensure helper from `handle_connect_hello` / same-`session_id` socket replace. Tab refresh: disconnect releases → new hello becomes controller → client re-`set_device` (stage 04).
  - After successful ensure: status shows null `selected_device_id`, not playing, no url.
- Server remains sole authority for hardware release (no client unload dependency).
- No unit tests in this stage (stage 03); no client changes (stage 04).
