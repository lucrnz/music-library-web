# Stage 06: Companion Settings and connect gates

## Status
done

## Description

Split Desktop companion Settings (token, port, status, data-dir path) onto every installed desktop PWA. Auto-connect when Downloads or exclusive is enabled. Block new OPFS writes on desktop tabs and require a live companion to enable Downloads on a desktop PWA. Jobs still write OPFS until stage 07.

## Rationale

Token and reconnect must exist before companion jobs. Tab/PWA gates prevent a new OPFS locker on desktop once we flip the backend.

## Invariants

- `syncCompanionConnection` connects when a token is set and (`exclusiveAudio.capable && exclusive enabled` **or** `canUseCompanionDownloads() && downloads.enabled`).
- Desktop companion Settings visible iff `canUseCompanionDownloads()`.
- Exclusive panel still iff `canShowExclusiveUi()`; it no longer contains token/port.
- Desktop tab: `enableDownloads` / `downloadTrack(s)` toast to use the installed PWA and do not persist enable or enqueue.
- Desktop installed PWA: enable/enqueue without `connection === "connected"` fails with a toast to start the companion; do not persist enable.
- Android enable path still requires OPFS as today.

## Risks

- Today `syncCompanionConnection` runs only after `initExclusiveAudio`. If Downloads is on and exclusive is off, the socket never opens unless `main.ts` also syncs after `initDownloads`.
- Moving token fields out of ExclusiveAudioPanel can drop the commit-on-blur hook — keep `onTokenCommit` on the new panel.

## Implementation

### Files

- `frontend/src/exclusive/companionClient.ts`
- `frontend/src/components/settings/CompanionPanel.vue`
- `frontend/src/components/settings/ExclusiveAudioPanel.vue`
- `frontend/src/components/settings/SettingsModal.vue`
- `frontend/src/downloads/index.ts`
- `frontend/src/downloads/ui.ts`
- `frontend/src/main.ts`

### Steps

1. In `frontend/src/exclusive/companionClient.ts`, change `syncCompanionConnection` so `should` is token present and (exclusive capable+enabled **or** companion-downloads capable + `downloads.enabled`). Keep debounce reconnect. Import `canUseCompanionDownloads` from `frontend/src/exclusive/capability.ts` and `downloads` from `frontend/src/downloads/state.ts` (reads only).
2. Create `frontend/src/components/settings/CompanionPanel.vue`: title **Desktop companion**; hint to run `uv run musicweb companion`; token + port fields (move handlers from ExclusiveAudioPanel); connection face (reuse exclusive connection/role text, not hog device). Show data-dir as “printed on companion launch” hint this stage (live path waits for `disk_info` in stage 07). Visible only when `canUseCompanionDownloads()`.
3. In `frontend/src/components/settings/ExclusiveAudioPanel.vue`, remove token/port UI and the “paste token” paragraph. Keep hog enable, device, format, Mac-only title. Still call `syncCompanionConnection` on enable.
4. In `frontend/src/components/settings/SettingsModal.vue`, mount `CompanionPanel` when `canUseCompanionDownloads()`, keep `ExclusiveAudioPanel` on `exclusiveAudio.capable`.
5. In `frontend/src/downloads/index.ts` `enableDownloads` / `initDownloads` (enabled boot): if `isDesktopPlatform() && !isInstalledPwa()`, do not enable; `showToast` to use the installed app. If `canUseCompanionDownloads()` and companion not `connected`, do not enable; toast to start the companion. Android / non-desktop still `requireOpfs()`.
6. In `frontend/src/downloads/ui.ts` `downloadTrack` / `downloadTracks`, apply the same tab / not-connected guards before enqueue (toast, return).
7. In `frontend/src/main.ts`, after `initDownloads()` resolves, call `syncCompanionConnection()` again so a Downloads-only desktop PWA connects.

### Verify

```sh
pnpm --dir frontend test -- frontend/tests/exclusive/capability.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- Installed Windows/Linux PWA Settings shows Desktop companion and not Exclusive audio.
- Installed Mac PWA shows both. Token lives only under Desktop companion.
- Enabling Downloads with exclusive off starts the loopback socket when a token is set.
- Desktop tab enable/download toasts and does not write `musicweb.downloadsEnabled` or queue rows.
- Desktop PWA with companion disconnected does not persist enable.
