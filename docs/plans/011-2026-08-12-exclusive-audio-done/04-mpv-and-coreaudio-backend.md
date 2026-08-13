# Stage 04: mpv playback and Core Audio probe/volume

## Status
done

## Description

Implement companion audio backend: **mpv** for exclusive HTTP FLAC load/transport; **macOS Core Audio** for device list + format caps. **Digital mpv volume must work first**; Core Audio hardware volume only as a same-stage follow-on if straightforward—never block playback.

## Rationale

mpv is the playback engine; Core Audio supplies honest device capabilities for formatPolicy. Hardware volume is nice-to-have relative to a working digital path.

## Implementation

- **Smoke gate:** verify CLI exclusive play on the maintainer Mac before heavy IPC. If CLI hog fails, fix environment first.
- mpv via IPC: audio-only, exclusive/hog options, selectable device, load absolute HTTP FLAC URL.
- Protocol commands (extend `protocol.py` + server handlers):
  - `list_devices` → id, name, **supported rate/depth caps** (intersect with allowlist rates/depths; client still picks tags via exclusive-formats).
  - `set_device`, `load`/`play`, `pause`, `resume`, `seek`, `stop`, `set_volume` (0–100)
  - Events: `time` `{ t, d }`, `pause`, `eof`, `error`
- **Volume order:** implement digital mpv volume path completely; then attempt Core Audio device volume when APIs allow; status may expose which path is active. Fallback must be automatic.
- Native code: mac-only; prefer ctypes/CoreFoundation; PyObjC only if required and optional for non-mac installs.
- Inter-track rate change: short gap OK; reconfigure per load (not gapless).
- Manual: device caps populated; hog + play remote stream URL with a stage-01 tag; pause/seek/digital volume; unplug → error; HW volume only if available without breaking digital.
