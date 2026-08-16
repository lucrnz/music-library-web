# Stage 01: Store live device + true arming + status face module

## Status
done

## Description

Split user **preference** from companion **live** device in the exclusive store. Make `isExclusiveArmed()` depend only on a companion-accepted live device. Add pure exclusive status-face helpers used by stages 03–05.

## Rationale

False “Armed” UX treated localStorage preference as play-ready while hub `selected_device_id` was empty. Arming and glanceable status must follow the live hog target; preference is only what the user picked for re-sync.

## Implementation

### Model (`stores/exclusiveAudio.js`)

| Field | Meaning | Persist |
|-------|---------|---------|
| `selectedDeviceId` | User preference | yes (`KEY_DEVICE`) |
| `companionDeviceId` | Live companion hog target | **no** |

- **`isExclusiveArmed()`:** `isExclusiveEnabled()` ∧ `connection === "connected"` ∧ `role === controller` ∧ **live** (`companionDeviceId`) set ∧ (when `devices` is non-empty, live id is still in that list). **Do not** arm on preference alone.
- **Profile caps** for `getExclusiveProfileTag`: resolve device from **preference if that id is still in `devices`**, else live. Never invent caps for a stale id not in the list.
- Device **gone from list:** clear preference via store setter (or equivalent) so **persist** runs; clear live if it matched; **no auto-pick**. Mid-play hard-stop + toast + Settings are stage 02.

### Status face pure module

- Add **`static/js/exclusive/statusFace.js`** (pure; no WebSocket side effects).
- Single formatter, e.g. `formatExclusiveFace(snapshot) → { kind, text, icon, interactive }`.
- **Fixed kinds and primary copy** (one module owns strings):

  | kind | text |
  |------|------|
  | `needs_device` | `Needs device` |
  | `connecting` | `Connecting…` |
  | `offline` | `Companion offline` |
  | `rejected` | auth rejected copy (use `lastError` only if user-safe; else short default) |
  | `readonly` | `Controlled elsewhere` |
  | `ready` | `Ready · {deviceName}` (name from `devices`, else id) |

- Snapshot inputs: enabled, connection, role, lastError/reason, preference id, live id, devices[].
- Stages 03 and 05 **must call this module** — no second switch for the same vocabulary.

### PlayBlockReason set (introduce types/messages here or stage 02; wire play in 02)

- `exclusive_needs_device` — no preference, preference cleared/gone, ensure timeout after set_device
- `exclusive_not_ready` — offline / connecting / rejected / missing token (replaces baggy unarmed for those)
- `exclusive_readonly` — this tab not controller
- keep `exclusive_failed`, `exclusive_no_format`
- **Delete/replace** baggy `exclusive_unarmed` usage (remove from play path; drop message or leave unused)

### Delete / replace (must land in this stage or leave compile-broken paths only where stage 02 owns play)

- **`isExclusiveArmed()`** based on `selectedDeviceId` alone (preference).
- **`applyStatus` writing preference** from `msg.selected_device_id` (in `companionClient.js` — remove that assignment; live goes to `companionDeviceId` only; wire full live clear/set rules in stage 02 if needed for status events, but **never** preference-from-status).
- Devices-handler clear of preference **without** persist — must go through persist path.
- Any comment that claims preference is not overwritten while code still overwrites it.

### Out of scope this stage

- No companion/protocol changes.
- No player ensure-then-play, status-line UI, or Settings panel rewire yet (03–05 consume face helpers; 02 owns ensure).
