# Stage 05: Settings exclusive panel status copy

## Status
done

## Description

Align Settings exclusive panel status with the **same** plain-language face as the now-playing bar (`statusFace.js`). Stop saying “Armed — ready to play” when the companion has not accepted a device.

## Rationale

Settings showed Armed from preference alone while play failed with device/setup errors. One vocabulary across player and settings.

## Implementation

- In `ExclusiveAudioPanel.js`, status line uses **`formatExclusiveFace`** (or the same snapshot helper) for a **single** status string.
- Device dropdown remains the control for **preference**; choose → `setSelectedDeviceId` → `syncPreferredDevice` (stage 02).
- Map known companion `lastError` / hub messages to friendly copy where we already toast; do not leave raw operator strings as the only signal when a face kind already covers it.
- No layout redesign beyond status text clarity.
- `openSettings()` from stage 02 needs_device path: no exclusive-section scroll/focus required in this plan.

### Delete / replace

- Dual status: separate `connectionLabel` switch **plus** `Armed — ready to play` / `Not armed (need connection + device as controller)`.
- Any Armed/Not armed boolean display based on `isExclusiveArmed()` as the only user-facing status (arming remains for play gate; face text is what users read).
- Duplicate connection/role English that diverges from `statusFace.js` kinds.

### Out of scope

- Companion CLI changes.
- Docs (stage 06).
