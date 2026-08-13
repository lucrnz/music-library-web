# Stage 05: Docs and Mac verification gate

## Status
done

## Description

Document the controller-owns-hog lifecycle and **prove** on a Mac that another app can use the headphones after controller loss (both PWA close and TTL). Logs alone are not done criteria.

## Rationale

The original bug was a semantic lie: “lock free” meant software controller claim, not Core Audio release. Docs must state both steps, that exclusive is armed only via `set_device` (no process-level exclusive flag), and that ensure-release runs on every controller loss. The Mac gate must cover socket death and TTL so both hard-stop paths are proven.

## Implementation

### Docs

- Update `docs/systems/exclusive-audio.md` (architecture / lock section):
  - Companion starts idle mpv **without** process-level `--audio-exclusive=yes`.
  - **Controller + `set_device`** arms exclusive (`audio-exclusive=yes` + device).
  - **Controller session owns exclusive/hog** while that device is selected.
  - When `_controller_id` becomes `None` (controller WebSocket disconnect **or** heartbeat TTL demotion), companion ensure-release: stop transport, `audio-exclusive=no`, clear device, then clear hub `selected_device_id` (only after successful release).
  - Client preference stays in localStorage; re-`set_device` on controller `hello_ok` re-arms exclusive.
  - TTL with socket still open: client emits `error` / `controller_lost` → existing exclusive hard-stop UI (not the disconnect event).
  - Explicit: “lock free” ≠ hardware released; both happen on controller loss.
- Source remains SoT for message shapes; docs state lifecycle intent only.
- Align any operator/CLI notes that still claim mpv is started with `--audio-exclusive=yes` as a fixed process flag (e.g. architecture bullets in the same doc).

### Mac gate (all required)

All must pass on a real Mac with the companion + installed PWA:

1. Armed exclusive; play a track long enough that audio is clearly exclusive/hogging.
2. **Quit/close the PWA** (not only hide).
3. Companion logs controller loss and release; **another app (or System Settings) can use the headphones immediately**.
4. Reopen PWA: becomes controller, device re-applied without manual re-select, play works (exclusive re-armed via `set_device`).
5. **TTL path:** starve JS heartbeats until TTL while PWA stays open — hard-stop/toast (`controller_lost`), role readonly, **headphones free** for other apps.

If the stage 01 sequence fails free-headphones checks, fix the mpv sequence (do not ship “auto under exclusive=yes” or reintroduce a process-level exclusive flag as a false fix) before marking this plan done.
