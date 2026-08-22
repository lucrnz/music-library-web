# Stage 02: Settings quality size hints

## Status
done

## Description

Map `approx_mb_per_hour` on the client and show `~{n} MB/h` as secondary text on open Settings Streaming and Downloads quality rows only.

## Rationale

Stage 01 put the integers on `/api/codecs`. This stage is the only UI that may display them, and it must not leak into the closed trigger or any other codec label.

## Invariants

- Closed SettingsSelect trigger text is still `option.label` (or the existing placeholder).
- Playback-policy and Exclusive Audio dropdowns pass no `hint`.
- `playbackStatus.ts`, `DownloadsModal.vue`, radio chrome, and Exclusive Audio do not read `approxMbPerHour`.
- Format is exactly `~` + integer + ` MB/h` (example: `~29 MB/h`). Omit the hint when `approxMbPerHour` is missing.
- `settings.options[].label` stays the server profile label. Do not append the estimate to `label`.

## Risks

- Two-line option rows need a slightly taller open list on small screens. Keep the hint one short muted line; do not wrap a paragraph into `SettingsSelect`.
- Spreading the raw catalog onto `CodecOption` can leave a leftover snake_case field. Map `approxMbPerHour` the same way as `bitrateKbps` so Settings does not depend on the raw key.

## Implementation

### Files

- `frontend/src/stores/settings.ts`
- `frontend/src/components/settings/SettingsSelect.vue`
- `frontend/src/components/settings/SettingsModal.vue`
- `frontend/css/modal.css`
- `frontend/tests/stores/settings.test.ts`

### Steps

1. In `frontend/src/stores/settings.ts`, add optional `approxMbPerHour?: number` to `CodecOption`. In `mapCodecOption`, set it with `numField(raw, "approxMbPerHour", "approx_mb_per_hour")`. Export `formatApproxMbPerHour(n: number): string` that returns `` `~${n} MB/h` `` for a finite integer; do not invent a value for `undefined`.
2. In `frontend/src/components/settings/SettingsSelect.vue`, add optional `hint?: string` to `SettingsSelectOption`. Render `hint` only inside each open `<li>` (muted secondary line under the label). Do not include `hint` in `triggerLabel`.
3. In `frontend/src/components/settings/SettingsModal.vue`, build a computed quality-options list from `settings.options` that sets `hint` via `formatApproxMbPerHour` when `approxMbPerHour` is a finite number. Pass that list to the Streaming and Downloads `SettingsSelect`s only. Leave the policy select on `playbackPolicies`.
4. In `frontend/css/modal.css`, style `.settings-select-option` so the label + hint stack on the left and the check icon stays end-aligned. Hint uses the existing dim text token and a smaller weight than the label. Do not change `.settings-select-trigger-label`.
5. In `frontend/tests/stores/settings.test.ts`, cover `formatApproxMbPerHour(29) === "~29 MB/h"` and that `mapCodecOption` (via a catalog hydrate, or by exporting the mapper if that stays private — prefer testing through the existing hydrate path) copies `approx_mb_per_hour: 29` to `approxMbPerHour: 29` and leaves it undefined when the field is absent.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/stores/settings.test.ts frontend/tests/playback/playbackStatus.test.ts frontend/tests/downloads/media.test.ts
pnpm --dir frontend typecheck
```

In the browser (dev or built SPA): open Settings → Streaming, confirm each open row shows `~N MB/h` including Opus 64/96, and the closed control shows only the profile label. Repeat Downloads quality. Confirm now-playing status/details and the downloads manager still show labels without MB/h. Check a phone-width viewport so two-line rows still tap cleanly.

## Acceptance

- Open Streaming and Downloads quality lists show `~29 MB/h` / `~43 MB/h` / `~58 MB/h` / `~72 MB/h` / `~86 MB/h` / `~380 MB/h` / `~410 MB/h` / `~1230 MB/h` next to the matching labels when the catalog includes those integers.
- Closed quality triggers, the policy dropdown, Exclusive Audio, now-playing, and download rows do not show MB/h.
- `pnpm --dir frontend typecheck` passes.
- `frontend/tests/stores/settings.test.ts` covers the formatter and the camelCase map.
