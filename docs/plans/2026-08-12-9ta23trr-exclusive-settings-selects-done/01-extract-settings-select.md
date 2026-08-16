# Stage 01: Extract SettingsSelect, migrate quality, fix dismiss

## Status
done

## Description

Replace `QualitySelect` with a stricter shared `SettingsSelect`, rename field/dropdown CSS to neutral `settings-field-*` / `settings-select-*` names, migrate all Settings quality menus onto the new control, and fix document-level outside-click dismiss so it does not depend on a section root.

## Rationale

Exclusive audio must reuse the same themed control as quality. Extracting first gives a single primitive with a cleaner contract (derived labels, one options list, close-on-choose) so exclusive does not inherit QualitySelect’s boilerplate. Outside-click via `.settings-select` deletes `qualityRoot` and stays correct when quality is hidden or exclusive is the only open menu.

## Implementation

### SettingsSelect

- Add `src/musicweb/static/js/components/settings/SettingsSelect.js`; delete `QualitySelect.js`.
- Props:
  - `menuId`, `labelId`, `fieldLabel` (required)
  - `options`: `{ id: string, label: string }[]` only — **no** `leadingOptions`
  - `selectedId`: string | null
  - optional `placeholder` when `selectedId` is null (trigger text)
  - `openMenu` (parent string | null)
  - optional `disabled` (no toggle; dimmed trigger styles)
- **No** `triggerLabel` prop — derive trigger text: matching option label, else `placeholder`, else a safe fallback (`"—"`).
- Emits: `toggle`, `choose`.
- **Close-on-choose:** `onChoose(id)` → `emit('choose', id)` then `emit('toggle', menuId)`. Parent `toggleMenu` already closes when that id is open.
- Template: `settings-field` / `settings-field-label` / `settings-select` (+ trigger, menu, option, selected/open modifiers). Chevron + check icons as today. Keep slot after the control for hints.
- Accessibility: parity with current QualitySelect only (button + listbox roles, aria-expanded / aria-selected). No arrow-key combobox work.
- Single options `v-for` (leading rows are the caller’s problem).

### CSS (`modal.css`)

- Rename `.quality-field` / `.quality-field-label` → `.settings-field` / `.settings-field-label`.
- Rename `.codec-*` → `.settings-select` / `.settings-select-trigger` / `.settings-select-menu` / `.settings-select-option` (and label/icon/open variants).
- Update the “native select cannot match theme” comment to describe settings selects generally.
- Disabled trigger: muted, non-pointer (or `not-allowed`); do not show open chrome when disabled.

### SettingsModal quality migration

- Import `SettingsSelect`; remove `QualitySelect`.
- Cellular: build one options array with `{ id: SAME_AS_WIFI, label: "Same as Wi‑Fi" }` prepended to codec options (drop `leadingOptions` / `cellularLeading` prop usage).
- Drop per-field `*Label` computeds used only as `triggerLabel` (wifi/cellular/download/policy) once derivation works; keep any label logic still needed for other UI if any (there should be none).
- Choose handlers (`chooseWifi`, etc.): **remove** `openMenu.value = null` — close comes from the control’s second emit. Keep domain setters only.
- `toggleMenu` unchanged.

### Outside click — delete qualityRoot

- Remove `qualityRoot` ref and the quality-section-only `ref="qualityRoot"`.
- `onDocPointer`: if `openMenu` is set and `e.target.closest?.(".settings-select")` is null, set `openMenu` to `null`. Otherwise leave it (click inside any settings select — including another trigger — does not clear here; the target control’s toggle still runs).
- Escape: still clears `openMenu` then closes modal (unchanged).
- No watchers to clear `openMenu` when quality unmounts or exclusive hides; stale menu ids clear on Escape or next outside click.

### Cleanup

- Grep for `QualitySelect`, `codec-dropdown`, `quality-field`, `qualityRoot`, `leadingOptions`, `triggerLabel` and clear leftovers.
- Smoke: open Settings → only one quality menu open at a time; choose updates preference and closes menu; click outside any select closes; Escape closes menu then modal; cellular “Same as Wi‑Fi” still works; no console/template errors.
