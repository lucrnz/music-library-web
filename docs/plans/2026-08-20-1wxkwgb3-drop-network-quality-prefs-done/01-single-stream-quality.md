# Stage 01: Single stream quality

## Status
done

## Description

Collapse streaming quality to one persisted tag. Play, prepare, and Settings use that tag only. Connection type no longer chooses a stream profile.

## Rationale

This is the behavior that is broken today and the reason for the plan. Until `getActiveStreamCodec()` ignores the network, later cleanup cannot delete the constraint module without changing what plays.

## Invariants

- `getActiveStreamCodec()` is still the accessor used by player, playlist prepare, and quality-rank compare.
- Changing the Streaming picker still restarts the current track when the active tag changes (`playIndex` via `StreamChangeCtx`).
- Exclusive audio still ignores this tag for play and prepare.
- Lossy / `source` delivery still ignores stream prefs.
- Download quality and playback policy settings are untouched.
- localStorage key remains `musicweb.streamCodec`. Default remains `opus_192_48000`.

## Risks

- A leftover `streamWifi` / `setStreamWifi` / `streamCellular` name will keep implying a network split. Rename the remaining field and setter in this stage.
- `bindNetworkConstraintEffects` still re-prepares on constraint change until stage 03. After this stage that re-prepare is a no-op for the active tag (it cannot change). Do not delete the listener here — downloads still need it until stage 02/03.

## Implementation

### Files

- `frontend/src/stores/settings.ts`
- `frontend/src/components/settings/SettingsModal.vue`
- `frontend/tests/stores/settings.test.ts`

### Steps

1. In `settings.ts`, replace `streamWifi` with `streamCodec`. Keep the stored name `musicweb.streamCodec` (rename `KEY_STREAM_WIFI` if that reads more clearly). Delete `KEY_STREAM_CELLULAR`, `DEFAULT_CELLULAR`, `streamCellular`, `pickDefaultCellular`, and `setStreamCellular`. Rewrite the file comment so it no longer says “Wi‑Fi stream, cellular stream… only-download-on-Wi‑Fi.”
2. `loadPrefs` / `persistAll`: read/write only the one stream key. On load, `localStorage.removeItem("musicweb.streamCodecCellular")`. Do not parse or migrate that value.
3. `getActiveStreamCodec()` returns `settings.streamCodec` with no call to `canDetectConnectionType` or `isConstrainedConnection`. Player, playlist prepare, and quality-rank keep calling this function — do not point those callers at `settings.streamCodec`. Settings may still import the constraint helpers for flags used by the Wi‑Fi-only download toggle (stage 02).
4. Rename `setStreamWifi` to `setStreamCodec`. Same persist, close-modal, and `applyActiveStreamSideEffects(..., { restartPlayback: true })` behavior.
5. In `SettingsModal.vue`, drop the Mobile data `SettingsSelect`, `SAME_AS_WIFI`, `cellularOptions`, `cellularSelectedId`, and `chooseCellular`. Bind the remaining picker to `settings.streamCodec` / `setStreamCodec`. Rename `chooseWifi` and the `wifi` / `wifi-codec-label` menu ids so the modal does not still say Wi‑Fi. Always label the field **Streaming**. Quality hint is “Choose streaming quality” plus the existing downloads sentence when downloads are enabled. `showNetworkQuality` remains only for the Only-download-on-Wi‑Fi toggle until stage 02.
6. Rewrite `frontend/tests/stores/settings.test.ts`: persist `musicweb.streamCodec` via `setStreamCodec`; assert `getActiveStreamCodec() === settings.streamCodec` under both constraint mocks. Delete the wifi-vs-cellular case.

### Verify

- `pnpm --dir frontend test -- frontend/tests/stores/settings.test.ts`
- `pnpm --dir frontend typecheck`
- Open Settings on a browser that reports `connection.type` (or a stub): one Streaming picker, no Mobile data picker. Change the picker while a lossless track is playing and confirm the current track reloads on the new tag.

## Acceptance

- There is no cellular stream preference in state, persistence, or Settings. The remaining picker is bound to `settings.streamCodec` / `setStreamCodec`; its menu ids do not say Wi‑Fi.
- `getActiveStreamCodec()` does not branch on network constraints.
- Changing Streaming still restarts the current track and re-prepares the queue.
- `musicweb.streamCodecCellular` is no longer read or written.
- Typecheck and the settings store tests pass.
