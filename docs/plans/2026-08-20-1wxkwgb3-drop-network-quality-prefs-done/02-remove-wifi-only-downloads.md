# Stage 02: Remove Wi‑Fi-only downloads

## Status
done

## Description

Remove the Only-download-on-Wi‑Fi setting and the `metered` auto-pause path. The download queue runs on cellular the same as on Wi‑Fi. Offline and server-unreachable auto-pause stay.

## Rationale

The same Network Information API that failed for stream quality is the only trigger for this toggle. With the user choosing to drop it, queue policy must stop consulting connection type so stage 03 can delete that module.

## Invariants

- Download *quality* (`settings.download` / `musicweb.downloadCodec`) is unchanged.
- `downloadAutoPauseReason()` still returns connectivity’s `offline` and `server` reasons.
- User pause (`userPaused`) stays separate from auto-pause.
- `reapplyNetworkPolicy` still runs on boot and connectivity recovery.
- After this stage `SettingsModal.vue` has no `showNetworkQuality` computed and no `settings.canDetectConnectionType` read. Settings flags `canDetectConnectionType` / `constrained` stay until stage 03.
- `AutoPausedReason` in `frontend/src/downloads/state.ts` matches `DownloadAutoPauseReason`: `"offline" | "server"`.

## Risks

- Queue items already frozen with reason `metered` stay frozen until the next `reapplyNetworkPolicy`. Boot `resumeQueue` and connectivity recovery already call that; after `metered` is gone they must unpause those items (unless user-paused or offline/server). Do not leave a permanent metered freeze.
- `downloads.onNetworkConstraintChanged` becomes a thin reapply with no metered branch. Leave the function for stage 03 to delete with the listener; do not add new callers.

## Implementation

### Files

- `frontend/src/stores/settings.ts`
- `frontend/src/components/settings/SettingsModal.vue`
- `frontend/src/downloads/queuePolicy.ts`
- `frontend/src/downloads/state.ts`
- `frontend/tests/downloads/queuePolicy.test.ts`

### Steps

1. Delete `KEY_ONLY_WIFI`, `settings.onlyDownloadOnWifi`, `setOnlyDownloadOnWifi`, and the persist/load of `musicweb.onlyDownloadOnWifi`. On load, `localStorage.removeItem("musicweb.onlyDownloadOnWifi")`.
2. In `SettingsModal.vue`, remove the Only-download-on-Wi‑Fi checkbox, `onOnlyWifiChange`, the `showNetworkQuality` computed, and every `settings.canDetectConnectionType` read. Stage 03 deletes the settings flags and does not list this file.
3. In `queuePolicy.ts`, drop the `isConstrainedConnection` import and the `onlyDownloadOnWifi && isConstrainedConnection()` branch. `DownloadAutoPauseReason` is `"offline" | "server"`. Delete the `metered` banner string. `downloadAutoPauseReason()` returns `autoPauseReason()` only. Keep the function; do not inline connectivity into every queue-policy call site.
4. In `frontend/src/downloads/state.ts`, drop `"metered"` from `AutoPausedReason` so it is `"offline" | "server"` (same as `DownloadAutoPauseReason` / connectivity’s `AutoPauseReason`). `getQueueControlState()` already writes that field — do not leave the deleted reason on the public downloads contract.
5. Replace the metered tests in `frontend/tests/downloads/queuePolicy.test.ts` with: `autoPauseReason()` is forwarded; when it is `null`, the result is `null`. Remove settings toggles from that file. Do not add a leftover-constraint-mock case.

### Verify

- `pnpm --dir frontend test -- frontend/tests/downloads/queuePolicy.test.ts frontend/tests/stores/settings.test.ts`
- `pnpm --dir frontend typecheck`
- Enable downloads, enqueue a track, and confirm Settings has no Only-download-on-Wi‑Fi row. Pause banner copy never says “waiting for Wi‑Fi”.

## Acceptance

- Settings has no Only-download-on-Wi‑Fi control, no `showNetworkQuality` computed, and no `canDetectConnectionType` read.
- `downloadAutoPauseReason()` and `AutoPausedReason` cannot be `metered`.
- `musicweb.onlyDownloadOnWifi` is no longer read or written.
- Queue policy tests and typecheck pass.
