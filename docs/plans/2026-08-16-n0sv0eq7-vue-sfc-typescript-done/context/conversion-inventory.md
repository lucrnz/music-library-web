# Conversion inventory

Maps every application file under today’s `frontend/js/` (108 files) to its post-cutover path under `frontend/src/`. Linked from [design.md](./design.md). Stage 02 owns the rewrite.

Rule: a file becomes `.vue` only if it `export default defineComponent`. Everything else becomes `.ts`.

## Components → `.vue` (38)

| From `frontend/js/` | To `frontend/src/` |
|---|---|
| `components/App.js` | `components/App.vue` |
| `components/dialog/AppDialog.js` | `components/dialog/AppDialog.vue` |
| `components/downloads/DownloadIcon.js` | `components/downloads/DownloadIcon.vue` |
| `components/downloads/DownloadsLibraryView.js` | `components/downloads/DownloadsLibraryView.vue` |
| `components/downloads/DownloadsModal.js` | `components/downloads/DownloadsModal.vue` |
| `components/icons/Icon.js` | `components/icons/Icon.vue` |
| `components/layout/LayoutMenu.js` | `components/layout/LayoutMenu.vue` |
| `components/layout/ModeBar.js` | `components/layout/ModeBar.vue` |
| `components/layout/TabBar.js` | `components/layout/TabBar.vue` |
| `components/library/EntityListHost.js` | `components/library/EntityListHost.vue` |
| `components/library/LibraryChrome.js` | `components/library/LibraryChrome.vue` |
| `components/library/LibraryView.js` | `components/library/LibraryView.vue` |
| `components/library/rows/AlbumCard.js` | `components/library/rows/AlbumCard.vue` |
| `components/library/rows/AlbumListRow.js` | `components/library/rows/AlbumListRow.vue` |
| `components/library/rows/ArtistCard.js` | `components/library/rows/ArtistCard.vue` |
| `components/library/rows/ArtistRow.js` | `components/library/rows/ArtistRow.vue` |
| `components/library/rows/FileCard.js` | `components/library/rows/FileCard.vue` |
| `components/library/rows/FileRow.js` | `components/library/rows/FileRow.vue` |
| `components/library/rows/FolderCard.js` | `components/library/rows/FolderCard.vue` |
| `components/library/rows/FolderRow.js` | `components/library/rows/FolderRow.vue` |
| `components/library/rows/TrackRow.js` | `components/library/rows/TrackRow.vue` |
| `components/lossy/LossyMark.js` | `components/lossy/LossyMark.vue` |
| `components/menu/ActionCard.js` | `components/menu/ActionCard.vue` |
| `components/menu/ActionMenu.js` | `components/menu/ActionMenu.vue` |
| `components/menu/ActionMenuItem.js` | `components/menu/ActionMenuItem.vue` |
| `components/menu/AnchoredMenu.js` | `components/menu/AnchoredMenu.vue` |
| `components/player/LyricsOverlay.js` | `components/player/LyricsOverlay.vue` |
| `components/player/NowPlayingFull.js` | `components/player/NowPlayingFull.vue` |
| `components/player/PlaybackDetailsBody.js` | `components/player/PlaybackDetailsBody.vue` |
| `components/player/PlaybackStatusLine.js` | `components/player/PlaybackStatusLine.vue` |
| `components/player/PlayerBar.js` | `components/player/PlayerBar.vue` |
| `components/playlist/PlaylistView.js` | `components/playlist/PlaylistView.vue` |
| `components/settings/ExclusiveAudioPanel.js` | `components/settings/ExclusiveAudioPanel.vue` |
| `components/settings/LibraryScanPanel.js` | `components/settings/LibraryScanPanel.vue` |
| `components/settings/SettingsModal.js` | `components/settings/SettingsModal.vue` |
| `components/settings/SettingsSelect.js` | `components/settings/SettingsSelect.vue` |
| `components/tree/LibraryTreePane.js` | `components/tree/LibraryTreePane.vue` |
| `components/tree/TreeView.js` | `components/tree/TreeView.vue` |

`Icon.js` and `PlaybackDetailsBody.js` have props + `template` only (no `setup`). Same SFC recipe; the script block is just `defineProps`.

`TreeView` calls `expose({ expandPath, bump, visible })`. The SFC must `defineExpose` the same three members. `LibraryTreePane` keeps a template ref and calls `expandPath`.

`NowPlayingFull` calls `expose({ focusClose, closeBtn })`. The SFC must `defineExpose` the same two members. `PlayerBar` calls `fullRef.value?.focusClose?.()` after expand. These are the only two `expose(` sites.

## Helpers under `components/` → `.ts` (14)

| From `frontend/js/` | To `frontend/src/` |
|---|---|
| `components/library/browseChrome.js` | `components/library/browseChrome.ts` |
| `components/library/libraryActions.js` | `components/library/libraryActions.ts` |
| `components/library/loaders.js` | `components/library/loaders.ts` |
| `components/library/rows.js` | `components/library/rows.ts` |
| `components/library/useBrowseLayout.js` | `components/library/useBrowseLayout.ts` |
| `components/library/useLibraryLocation.js` | `components/library/useLibraryLocation.ts` |
| `components/playlist/queueMenuItems.js` | `components/playlist/queueMenuItems.ts` |
| `components/tree/flattenVisible.js` | `components/tree/flattenVisible.ts` |
| `components/tree/treeNavigation.js` | `components/tree/treeNavigation.ts` |
| `components/tree/treeSession.js` | `components/tree/treeSession.ts` |
| `components/tree/sources/albumsSource.js` | `components/tree/sources/albumsSource.ts` |
| `components/tree/sources/artistsSource.js` | `components/tree/sources/artistsSource.ts` |
| `components/tree/sources/downloadsSource.js` | `components/tree/sources/downloadsSource.ts` |
| `components/tree/sources/foldersSource.js` | `components/tree/sources/foldersSource.ts` |

## Other modules → `.ts` (56)

### Entry and roots (15)

`api.js`, `codecProbes.js`, `codecSupport.js`, `connectivity.js`, `connectivityUi.js`, `layout.js`, `lossyKind.js`, `main.js`, `networkConstraints.js`, `playbackStatus.js`, `playBlock.js`, `pwa.js`, `qualityRank.js`, `router.js`, `util.js` → same names as `.ts` under `frontend/src/`.

`router.ts` keeps the `RouteShell` stub as a function component (`const Shell = () => null`). It is not an SFC and must not keep a `render:` option.

### Stores (11)

`stores/connectivity.js`, `dialog.js`, `exclusiveAudio.js`, `modalLock.js`, `player.js`, `playerPrefs.js`, `playerSession.js`, `playerState.js`, `playlist.js`, `settings.js`, `ui.js` → `.ts`.

`player.ts` still re-exports `player` from `playerState.ts`. Loaders stay in `player.ts`.

### Models (3)

`models/album.js`, `models/lyrics.js`, `models/track.js` → `.ts`. JSDoc `@typedef`s become exported types (`Track`, `CatalogTrackRecord`, `Album`, `Lyrics`). Runtime mappers keep their names.

### Downloads (15)

`downloads/actionKind.js`, `browse.js`, `catalog.js`, `db.js`, `hierarchy.js`, `index.js`, `lyricsStore.js`, `opfs.js`, `queue.js`, `queuePolicy.js`, `resolve.js`, `state.js`, `storageInfo.js`, `ui.js`, `worker.js` → `.ts`.

### Exclusive (5)

`exclusive/capability.js`, `companionClient.js`, `formatPolicy.js`, `protocol.js`, `statusFace.js` → `.ts`.

### Other packages (7)

- `diag/idb.js`, `diag/log.js`
- `lyrics/cache.js`, `lyrics/parseLrc.js`
- `playback/sinks/companionSink.js`, `htmlAudioSink.js`, `types.js`

→ `.ts`. `playback/sinks/types.js` already exports nothing and exists for JSDoc; it becomes real exported `SinkHandlers` and `PlaybackSink` types.

## Non-`js/` files the cutover also rewrites

These are not in the 108-file count. Stage 02 still changes them:

| Path | Change |
|---|---|
| `frontend/index.html` | `./js/main.js` → `./src/main.ts`. CSS `<link>`s unchanged. |
| `frontend/vite.config.js` | Deleted after `vite.config.ts` lands. |
| `frontend/vitest.config.js` | Deleted after `vitest.config.ts` lands. |
| `frontend/tests/icon.smoke.test.js` | Becomes `frontend/tests/icon.smoke.test.ts`; import `@/components/icons/Icon.vue`. |
| `frontend/package.json` | `typecheck` / `build` use `vue-tsc --noEmit -p tsconfig.app.json` (`build` then `&& vite build`). `test` still `vitest run`. |
| `frontend/tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` | App/node split. Gate is `-p tsconfig.app.json`. No `--build`, no `composite`. |
| `frontend/env.d.ts` | Move/replace as `frontend/src/vite-env.d.ts`. |
