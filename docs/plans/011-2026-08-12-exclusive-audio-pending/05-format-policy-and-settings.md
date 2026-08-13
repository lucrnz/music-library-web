# Stage 05: Format policy and exclusive settings (PWA ∩ macOS)

## Status
pending

## Description

Add pure **formatPolicy**, exclusive settings store, and **ExclusiveAudioPanel** visible only for **installed PWA on macOS**. Fetch **`GET /api/exclusive-formats`** when that UI can appear. Persist enable, HOG token, port (default 18765), device id, format mode. No player routing yet.

## Rationale

Tags come only from the server catalog. Settings must not show on phones or non-Mac PWAs. A dedicated panel keeps `SettingsModal.js` from bloating.

## Implementation

- **`static/js/exclusive/formatPolicy.js`** (pure):
  - Inputs: source `{ sampleRateHz, bitDepth } | null`, device caps, mode `prefer_source` | `upsample_device`, **formats list from exclusive-formats**.
  - Output: a **tag that exists in that list** (never invent).
  - **prefer_source:** exact source rate/depth if allowlisted and device supports; else nearest **lower-or-equal** device-supported allowlisted format; keep source bit depth when possible (no pointless 16→24).
  - **upsample_device:** highest rate×depth in list that device supports.
  - **null source:** same as device-max / upsample for that track (toast later).
- **Store** `stores/exclusiveAudio.js`: `enabled`, `hogToken`, `port` (default **18765**), `selectedDeviceId`, `formatMode`, `formats[]`, connection/lock snapshots. `localStorage` persistence.
- **Fetch exclusive-formats** when exclusive UI capability is true (mac + installed PWA), at exclusive store init—not on every device/browser boot.
- **Visibility:** installed PWA (`display-mode: standalone` and/or `minimal-ui`) **and** macOS platform/UA only. No iOS path in v1.
- **UI:** `ExclusiveAudioPanel.js` in settings—token (`HOG_TOKEN` value), port, enable (OK while companion down), format mode when enabled, companion help when disconnected, device select filled in stage 06.
- When `enabled`, **one gate** hides/disables normal stream quality, download quality, and playback-policy controls (shared helper, not scattered ifs).
- Manual: Mac PWA shows panel and loads formats; browser tab / non-mac hidden; reload keeps prefs.
