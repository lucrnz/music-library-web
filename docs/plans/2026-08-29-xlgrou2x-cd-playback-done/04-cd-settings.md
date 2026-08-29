# Stage 04: CD settings and one store

## Status
done

## Description

Gate CD UI to an installed Mac PWA, persist Enable CD playback + selected drive, list optical drives from the companion, and connect the companion socket when CD is enabled. Prefs and live optical state live on one `stores/cd.ts`.

## Rationale

The room cannot watch a drive until a preference exists. One store (like `exclusiveAudio` + `setExclusiveLive`) avoids a second prefs module the later stages would have to merge.

## Invariants

- No auto-pick. First drive choice is manual.
- Preference id is persisted; live media is not.
- Missing drive: keep `selectedDriveId`; do not clear like exclusive device-gone.
- `wantsCompanionSocket` = token ∧ (exclusive ∨ downloads ∨ (`canShowCdUi()` ∧ cd enabled)).
- Settings panel is hidden unless `canShowCdUi()` (Mac + installed PWA).
- `companionClient` does not import `stores/cd.ts`. Live fields go through `setCdLive`.
- Do not create `stores/cdPlayback.ts`.

## Risks

- Enabling CD while exclusive and downloads are off is a new reason to take the controller lock. Feature-off token probe must still hang up.

## Implementation

### Files

- `frontend/src/exclusive/capability.ts`
- `frontend/src/stores/cd.ts`
- `frontend/src/exclusive/opticalClient.ts`
- `frontend/src/components/settings/CdPlaybackPanel.vue`
- `frontend/src/components/settings/SettingsModal.vue`
- `frontend/src/exclusive/companionClient.ts`
- `frontend/src/main.ts`
- `frontend/tests/exclusive/capability.test.ts`
- `frontend/tests/stores/cd.test.ts`

### Steps

1. Add `canShowCdUi()` in `frontend/src/exclusive/capability.ts` (`isMacPlatform() && isInstalledPwa()`). Tests: Mac standalone true; Windows standalone false; Mac tab false.
2. New store `frontend/src/stores/cd.ts`: persisted `enabled` / `selectedDriveId` (`musicweb.cd.enabled`, `musicweb.cd.driveId`); live `drives`, `mediaPresent`, `toc`, `cdText` (not persisted). Export `setCdLive` for the socket layer. Setters persist prefs. No import of `companionClient`. Cursor/session fields may exist as empty stubs; 05 fills them.
3. `frontend/src/exclusive/opticalClient.ts`: parse `optical_drives` / `optical_media` / `optical_error` and call `setCdLive`. Export `requestListOpticalDrives`, `watchOptical`, `ejectOptical` that send protocol messages through a tiny inject/callback the companion client registers (do not grow `companionClient.ts` with optical field mapping).
4. `companionClient.ts`: on those message types, dispatch to `opticalClient`. Extend `wantsCompanionSocket` with CD enabled. Keep the file to a few call sites.
5. `CdPlaybackPanel.vue`: toggle “Enable CD playback”; when on, `SettingsSelect` of `drives` (`menu-id="cd-drive"`), placeholder “Select drive…”, disabled unless companion connected + controller. Refresh requests `list_optical_drives`. Mount from `SettingsModal.vue` after Exclusive when `canShowCdUi()`.
6. `main.ts`: importing the store hydrates prefs; `syncCompanionConnection` after exclusive init already runs.

### Verify

```sh
pnpm --dir frontend exec vitest run tests/exclusive/capability.test.ts tests/stores/cd.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- Mac installed PWA Settings shows Enable CD playback + drive dropdown; the pick survives reload.
- Enabling CD with a token connects the companion even if exclusive and downloads are off.
- Non-Mac and non-installed clients have no panel and do not add a socket reason.
- Unplugging the selected SuperDrive does not wipe `musicweb.cd.driveId`.
- There is no `cdPlayback.ts`.
