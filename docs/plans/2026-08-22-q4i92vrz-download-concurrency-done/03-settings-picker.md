# Stage 03: Settings concurrent-downloads picker

## Status
done

## Description

Add a Settings → Downloads `SettingsSelect` for the persisted cap. Show it only when downloads are enabled. Choosing a value calls `setDownloadConcurrency` so stage 02’s apply path runs.

## Rationale

The persist and pump work is unreachable from the product UI until Settings exposes the allowed list. The download manager stays a queue surface; this stage does not add a second picker.

## Invariants

- The control is inside the existing Downloads section and is absent when `!downloads.enabled`.
- Options are exactly the stage 01 allowed values. Closed trigger and open rows use `concurrencyLabel` (`Sequential (1)`, `2`, `4`, …).
- `SettingsSelect` option ids are the decimal strings (`"1"`, `"2"`, …).
- No control is added to `DownloadsModal.vue`. Exclusive-audio hiding of the Quality section does not hide this control.

## Risks

- Wiring the picker to `settings.ts` would split ownership from the enable flag and force `queueRuntime` to import quality prefs. Keep the bind on `downloads.concurrency` / `setDownloadConcurrency`.
- Reusing the quality `openMenu` id space incorrectly (`"download"`) would toggle the codec menu. Use a distinct `menu-id` such as `dl-concurrency`.

## Implementation

### Files

- `frontend/src/components/settings/SettingsModal.vue`

### Steps

1. In `frontend/src/components/settings/SettingsModal.vue`, import `setDownloadConcurrency` from the downloads lifecycle module and `DOWNLOAD_CONCURRENCY_VALUES` plus `concurrencyLabel` from the stage 01 concurrency module. Build a computed options list `{ id: String(n), label: concurrencyLabel(n) }` from `DOWNLOAD_CONCURRENCY_VALUES`.
2. In the Downloads section of `frontend/src/components/settings/SettingsModal.vue`, after the enable toggle (and with the existing storage / near-quota / manager button still gated on enabled), render a `SettingsSelect` only when `downloads.enabled`: `menu-id="dl-concurrency"`, `label-id="dl-concurrency-label"`, `field-label="Concurrent downloads"`, `:options` from that list, `:selected-id="String(downloads.concurrency)"`, same `openMenu` / `toggleMenu` pattern as the other selects. On choose, parse the id with `Number` and call `setDownloadConcurrency`. Do not close the Settings modal (download codec already stays open; match that).
3. Optional one-line hint under the select, via the existing `SettingsSelect` slot / `modal-hint`: “How many tracks to download at the same time.” Do not put a hint on each option row.
4. Bind the trigger to `downloads.concurrency` (hydrated in stage 01). Do not add a parallel field on the quality settings object.

### Verify

```sh
pnpm --dir frontend typecheck
```

In the browser (dev or built SPA):

- Downloads disabled: Settings → Downloads shows enable only; no concurrency control.
- Enable downloads: the picker appears, closed trigger is `2` on a fresh profile (or the stored value after reload).
- Open list shows Sequential (1), 2, 4, 6, 8, 10, 12. Choose 4, reload, confirm it is still 4.
- With several queued tracks, choose 1 while two are downloading: the higher-progress job continues; the other returns to the manager queue with its bar intact and starts when the first finishes.
- Choose 6 with work pending: more rows go active immediately if not paused.
- Pause all, change 6 → 2 → 6: nothing starts until Resume; then at most 6 run.
- Phone-width and desktop: the new select matches the other Settings rows. Download manager has no new control.

## Acceptance

- Settings → Downloads, when enabled, is the only UI that can change the cap.
- Choosing Sequential (1) through 12 persists across reload and is the value the pump uses.
- Reduce / raise behavior matches [context/design.md](context/design.md) when exercised from this picker.
- `DownloadsModal.vue` is unchanged.
