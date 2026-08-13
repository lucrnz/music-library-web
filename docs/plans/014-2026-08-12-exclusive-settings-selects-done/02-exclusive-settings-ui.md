# Stage 02: Exclusive settings UI (selects + field chrome)

## Status
done

## Description

Wire exclusive-audio format mode and output device to `SettingsSelect`, share SettingsModal’s `openMenu` / `toggleMenu` with the panel, and align HOG_TOKEN and companion port with `settings-field` labels/spacing. One pass so the exclusive section does not land half-themed.

## Rationale

Native `<select class="text-input">` is the look-and-feel break. Stage 01 already provides the themed primitive and global dismiss. This stage is the product surface: exclusive dropdowns match quality exactly, and token/port stop using ad-hoc `modal-hint` / inline field chrome next to real settings fields.

## Implementation

### Shared menu state (props only)

- `SettingsModal` passes into `ExclusiveAudioPanel`:
  - `open-menu="openMenu"`
  - `@toggle="toggleMenu"` (or equivalent prop + listener)
- Do **not** hoist format/device choose handlers into SettingsModal. Panel keeps calling `setFormatMode` / `setSelectedDeviceId` (and existing token/port/enable setters).
- Menu ids must not collide with quality: e.g. `exclusive-format`, `exclusive-device`.
- Explicit `labelId`s (e.g. `exclusive-format-label`, `exclusive-device-label`).

### Format mode SettingsSelect

- Show only when `exclusiveAudio.enabled` (same gate as today).
- Options:
  - `prefer_source` — “Prefer source rate / depth”
  - `upsample_device` — “Upsample to device max”
- `selectedId`: `exclusiveAudio.formatMode`
- `@choose` → `setFormatMode(id)` (close-on-choose handled by SettingsSelect).

### Output device SettingsSelect

- Same enable gate.
- Map `exclusiveAudio.devices` → `{ id, label: name }`.
- `selectedId`: `exclusiveAudio.selectedDeviceId` (may be null).
- `placeholder`: `"Select device…"` — **no** empty row in the menu.
- `disabled` when `exclusiveAudio.role === 'readonly'`.
- `@choose` → `setSelectedDeviceId(id)`.
- Keep “Refresh devices” as existing `pill` / `scan-actions` (out of restyle scope).

### Field chrome (HOG_TOKEN + port)

- Wrap each in `settings-field` + `settings-field-label` (stable label ids optional but good for `aria-labelledby` on inputs).
- Keep `class="text-input"`; do **not** force 48px trigger height or full-width port.
- Port may stay ~`8rem` wide; prefer a small CSS class over long inline styles if easy.
- Remove `field-row` / inline label styles that only faked structure.
- Leave enable toggle, status/armed lines, warn hint, and refresh button as-is.

### Smoke

- Where exclusive UI is capable (Mac installed PWA, or temporary dev force of `capable` if needed):
  - Format and device menus match quality chrome; only one menu open across quality + exclusive.
  - Outside click and Escape dismiss exclusive menus.
  - Readonly disables device select; format still editable when enabled.
  - Empty device list: placeholder trigger, empty option list.
  - Token/port edit and persist; spacing aligns with settings fields.
  - Enabling exclusive while a quality menu was open: dismiss still works (stale id ok until outside/Escape).
