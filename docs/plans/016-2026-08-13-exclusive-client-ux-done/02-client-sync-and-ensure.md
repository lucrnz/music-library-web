# Stage 02: Client sync preference → companion + ensure-before-play

## Status
done

## Description

Keep companion live device in sync with user preference whenever this tab is controller. Make exclusive play **ensure-then-load** so preference + connected becomes play without a manual re-pick after controller reclaim. Own hard-stop and needs-device toast + Settings paths.

## Rationale

Companion correctly forgets the hog target on controller loss. The client must re-apply preference automatically. Play must not race a missing live device when the user already chose one. Ensure/wait logic must not live as a timeout loop inside `playIndex`.

## Implementation

### Live field updates (`companionClient.js`)

- **Set** `companionDeviceId` when status (or hello_ok) has truthy `selected_device_id`.
- **Clear** live on: disconnect; TTL / controller loss paths; explicit `selected_device_id: null` if protocol sends it; preference cleared (stage 01 gone-from-list / user clear).
- **Never** write `selectedDeviceId` (preference) from companion status.

### Single sync function

- **`syncPreferredDevice()`** (name flexible; **one** place): if controller ∧ preference set ∧ (live missing or live ≠ preference) → `requestSetDevice(preference)`.
- Call sites **only** via this function:
  - controller `hello_ok`
  - after `devices` update (when preference still valid / still in list)
  - when user chooses a device (`setSelectedDeviceId`)
  - from ensure-before-play
- **Delete** one-off `requestSetDevice(selectedDeviceId)` branches that duplicate the same rule (e.g. raw call only on hello_ok without the shared helper).
- **No auto-pick** of a device id. First selection is manual only.

### Ensure gate (companion client, not player)

- **`ensurePreferredDevice({ timeoutMs ≈ 1500 })`** on `companionClient.js`:
  - If already armed → resolve success.
  - If no preference → resolve/fail `exclusive_needs_device` (no wait).
  - If not controller / not connected / rejected → `exclusive_readonly` or `exclusive_not_ready` as appropriate (no long wait).
  - Else call `syncPreferredDevice()`, wait until live matches preference **or** ~1.5s timeout → then `exclusive_needs_device` (or a dedicated timeout mapped to needs_device toast copy).
- Returns a small result the player can switch on (armed vs specific fail reason). **No `setTimeout` loops in `player.js`.**

### Player exclusive path

- When exclusive enabled and about to companion-load: `const gate = await ensurePreferredDevice(...)`; if not armed → `failPlayback` with the **specific** reason + toast; return.
- **`exclusive_needs_device` only:** toast + **`openSettings()`** (existing settings open API). **No** exclusive-section scroll/focus work in this plan.
- Other fails (`not_ready`, `readonly`, etc.): toast only; do **not** force-open Settings.
- Then load as today (absolute stream URL + exclusive tag).

### Mid-play and device list

- Live cleared mid-play (disconnect / TTL / ensure-release): **existing exclusive hard-stop** path (`exclusive_failed` / controller_lost) — no HTML fallback.
- Preferred device **disappears from list** while exclusive on: clear preference + persist (stage 01); if companion sink active / playing exclusive → **hard-stop** + needs_device toast + `openSettings()`.

### Delete / replace

- Baggy play path that only checks `!isExclusiveArmed()` with `exclusive_unarmed` without ensure.
- Any ensure/wait/`setTimeout` orchestration inlined in `playIndex`.
- Player importing modal internals ad hoc — only `openSettings()` (or equivalent public settings API).
- Preference mutation from status (if still present after stage 01).

### Out of scope

- No companion Python / protocol API changes.
- No status-line or Settings face rewire (stages 03, 05).
