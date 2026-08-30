# Stage 02: Hide icon and tab; bounce `/cd`

## Status
done

## Description

Show the desktop CD session toggle and the mobile CD tab only when `cdEntryAllowed()` is true. Bounce `/cd` (including desktop absorb and a live `/cd` that becomes disallowed) the same way `!canShowCdUi()` already bounces. Leave the Settings CD panel on `canShowCdUi()`.

## Rationale

Stage 01 owns the rule; this stage is the screen. Until the `v-if`s and the App route watch use that function, a capable PWA still draws a CD button that opens a `needs_setting` room.

## Invariants

- Settings → CD playback (`SettingsModal.vue` / `CdPlaybackPanel.vue`) still mounts when `canShowCdUi()` is true.
- `PlayerBar` `CdMini` stays session-driven (`activeSession() === "cd"`). After stage 01 leave-on-disable, it unmounts with the session.
- Collapse / X still does not leave. Library Play-all and Radio Tune-in still leave.
- Desktop CD list header icon uses the same predicate so it cannot outlive a now-disallowed session.

## Risks

- Watching only `onCd` going true will not bounce if the user turns Enable off while already on `/cd`. The watch must also react when `cdEntryAllowed()` becomes false.
- Replacing `canShowCdUi()` in Settings would hide the only way to turn CD back on.

## Implementation

### Files

- `frontend/src/components/playlist/PlaylistView.vue`
- `frontend/src/components/layout/TabBar.vue`
- `frontend/src/components/App.vue`
- `frontend/src/components/cd/CdTrackList.vue`

### Steps

1. `PlaylistView.vue`: `showCdButton` is `cdEntryAllowed()` (import from `@/stores/cd`). Drop the `canShowCdUi` import if unused. The Queue-header button `v-if` stays `desktop && showCdButton`.
2. `TabBar.vue`: `showCdTab` is `cdEntryAllowed()`. Same import swap.
3. `CdTrackList.vue`: `showChrome` is `desktop && cdEntryAllowed()`. Same import swap.
4. `App.vue`: `showCdPage` and `showCdList` require `cdEntryAllowed()` instead of `canShowCdUi()`. `absorbDesktopCd` and the `/cd` watch bounce with `router.replace(lastLibraryLocation())` when `!cdEntryAllowed()` — do not `enterCdMode`. The rail watch (`desktop && expanded && railFace === "cd"`) calls `enterCdMode` only when `cdEntryAllowed()`. Expand the `/cd` watch so a still-open `/cd` route also bounces when the predicate flips false (disable or unpick), not only on first navigation to `/cd`.
5. Do not edit `SettingsModal.vue`, `CdPlaybackPanel.vue`, or `capability.ts`.

### Verify

```sh
pnpm --dir frontend typecheck
pnpm --dir frontend exec vitest run tests/stores/cd.test.ts
rg -n "cdEntryAllowed|canShowCdUi" frontend/src/components/playlist/PlaylistView.vue frontend/src/components/layout/TabBar.vue frontend/src/components/App.vue frontend/src/components/cd/CdTrackList.vue frontend/src/components/settings/SettingsModal.vue
```

`PlaylistView.vue`, `TabBar.vue`, `App.vue`, and `CdTrackList.vue` call `cdEntryAllowed`. `SettingsModal.vue` still gates the CD panel with `canShowCdUi`.

## Acceptance

- Installed Mac PWA with Enable off, or Enable on and no drive picked: no Queue CD icon, no CD tab, `/cd` replaces to the last library URL.
- Enable on and a drive picked: icon and tab behave as today’s session toggle / `/cd` enter.
- Turning Enable off (or clearing the drive) while on `/cd` or in a desktop CD session leaves the deck and does not leave a CD tab or icon on screen.
- Settings still shows Enable CD playback on a capable Mac PWA.
