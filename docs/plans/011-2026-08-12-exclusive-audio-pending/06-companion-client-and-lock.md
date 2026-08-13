# Stage 06: Companion client, devices, and controller lock

## Status
pending

## Description

PWA WebSocket client to `ws://127.0.0.1:<port>` (default 18765): hello with token + sessionId, heartbeat ~5s, controller vs read-only, device list/select. Mirror protocol type constants from the Python schema (string constants in JS).

## Rationale

One bridge module owns transport/lock so player and settings only read store state.

## Implementation

- **`static/js/exclusive/companionClient.js`** + store bindings; JS message type constants aligned with `protocol.py` (`v` must match).
- Connect when exclusive **enabled** and token non-empty (and exclusive capability true). Disconnect when disabled. Backoff reconnect; no storms when disabled.
- Controller: `list_devices`, `set_device`. Read-only: status only; no device/play.
- Heartbeat ~5s; rely on companion TTL ~15s.
- **Arming inputs for stage 07:** `enabled` ∧ `selectedDeviceId` ∧ connected ∧ **this tab is controller**.
- Manual: two windows—controller vs readonly; kill companion; heartbeat starve frees lock.
