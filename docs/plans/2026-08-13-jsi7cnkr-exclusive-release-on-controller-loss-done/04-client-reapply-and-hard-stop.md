# Stage 04: Client re-apply device + TTL hard-stop

## Status
done

## Description

(1) When the PWA becomes controller again, re-send `set_device` from the persisted preference so the companion re-arms exclusive. (2) When controller is lost via TTL while the socket stays open, emit an error event so the existing companion sink → `exclusive_failed` hard-stop path runs.

## Rationale

After stage 02 the hub forgets the live device; the client still owns the **preference** in `selectedDeviceId` / localStorage. Without re-apply, reconnect leaves hub `_device_id` null and `load` fails. Separately, TTL does not close the WebSocket, so today’s `disconnect` event never fires — UI can keep “playing” while hardware is free. Reuse the sink’s existing `error` → `onError` path; no new player modes.

## Implementation

### Preference vs live target (one field, explicit rules)

- `exclusiveAudio.selectedDeviceId` = **user preference** (localStorage).
- Companion `selected_device_id` = **live hog target** (may be null after release).
- `applyStatus`: never overwrite preference with null/empty companion id (keep current truthy-only apply; fix the misleading comment so it states this invariant).
- Devices list handler may still clear preference if the id is absent from a full device list.

### Re-apply on controller reclaim

- In `companionClient.js` on `hello_ok` when `role === controller`:
  - If `selectedDeviceId` is set, **`requestSetDevice` immediately** (do not wait for devices list). That re-arms exclusive via stage 01 `set_device`.
  - `list_devices` in parallel / as today.
- No new modules or store fields.

### TTL / controller-loss hard-stop (simple paths only)

- **Two disjoint paths — do not both fire for the same loss:**
  - **WebSocket close** (PWA quit, network drop): existing `disconnect` event → sink `onError` → hard-stop. Do **not** also emit `controller_lost`.
  - **TTL demotion** (socket still open): on status with `role === readonly` and `reason === controller_ttl`, **`emit({ type: "error", code: "controller_lost", message: "…" })`** once → same sink hard-stop. Do **not** emit `disconnect`.
- Prefer **no sink API change** and **no debounce layer** unless a double-toast is observed in practice (out of scope for this plan).
- No extra “playing became false” watchers beyond these two paths.

### Manual sanity (with stage 05)

- Play → close PWA → headphones free → reopen → preference re-applied without re-select → play works.
- Play → starve heartbeats until TTL → hard-stop/toast, headphones free, role readonly.
