# Archived plans

Done plan directories removed from `docs/plans/` via git rm. Each entry's command shows that plan's delete commit.

## 2026-08-12-cpnkw10w-near-end-urgent-prepare-done

**Title:** Near-end urgent prepare

**Commit:** `c8cae4f402ebc4fffed970ed4edac0d5aa703e53`

Collapsed Transcoder enqueue/promote/preempt into one helper shared by non-blocking `prepare` and blocking `ensure_stream`, and made queue “what plays next” a single pure computation. A later agent would open the delete commit for the client prepare-policy helper and the thin once-per-load near-end urgent prepare latch (offline is not a permanent miss).

```bash
git show c8cae4f402ebc4fffed970ed4edac0d5aa703e53
```

## 2026-08-12-8v5zed63-np-playback-status-done

**Title:** Now-playing playback status

**Commit:** `1037d5e0abfbaf35fc21cf6782374225b5193a38`

Replaced boolean `fromDownload` with structured play-source state (streaming / downloaded / unavailable, profile tag, block reason) and pure formatters for the status line and details rows. Open the diff for the expanded now-playing status line and Playback details (mobile modal / desktop popover) that read that state instead of guessing from `audio.src`.

```bash
git show 1037d5e0abfbaf35fc21cf6782374225b5193a38
```

## 2026-08-12-jkijfpzr-np-playback-status-cleanup-done

**Title:** Now-playing playback status cleanup

**Commit:** `63330e8fa4af9c41e8fe83ee41bda99ccddd13ae`

Deduped play-block messages/types so resolve and formatters share one map, and made every player play-source write set source, profile, and block reason together. Open the diff for `PlaybackStatusLine` extraction and the collapse of dual modal/popover flags into one `detailsOpen`.

```bash
git show 63330e8fa4af9c41e8fe83ee41bda99ccddd13ae
```

## 2026-08-12-9sk1mb4n-library-tree-layout-done

**Title:** Library tree layout

**Commit:** `ac84687411dd01a933229365cd04782cfba5c088`

Widened `libraryLayout` to list/grid/tree with a Finder-style menu and one recursive TreeView (session expand, lazy cache, visible-nodes) used by every mode. Open the diff for the pure `treeNavigation` policy (router stays on mode root), mode adapters, entity-id group actions, and WAI-ARIA tree keyboard.

```bash
git show ac84687411dd01a933229365cd04782cfba5c088
```

## 2026-08-12-hqb58c9x-downloads-tree-album-queue-done

**Title:** Downloads tree album queue

**Commit:** `64cd7aea92beef231ffc1afd3deca549a0885f87`

Added a batch catalog-record → `Track[]` projector and replaced tree group-add ternaries with a kind→handler map. Open the diff for `dl-album` “Add all to playlist” that queues offline tracks through that projector.

```bash
git show 64cd7aea92beef231ffc1afd3deca549a0885f87
```

## 2026-08-12-85peeduf-cq-structural-fixes-done

**Title:** CQ structural fixes

**Commit:** `afbacf6fe670e2b2b3cdba56f596a152a1b8ed9c`

Hard-cutover merged the downloads queue micro-graph into `queue.js` and catalog pieces into `catalog.js`, renamed enqueue vs UI download exports, and extracted shared browse-layout composables. Open the diff for the face-state vocabulary (`downloaded` / `streaming` / `unavailable`), catalogIndex-based prepare skip, and linearized `playIndex` attempt/fallback.

```bash
git show afbacf6fe670e2b2b3cdba56f596a152a1b8ed9c
```

## 2026-08-12-fskjdmw1-docs-high-priority-fix-done

**Title:** Docs high-priority fix

**Commit:** `ecb0c4c6dcdc8a2d8cc4151e1fd8ad4d9d421060`

Added durable systems pages for downloads, playback/quality, and connectivity, then thinned frontend conventions to ownership pointers. Open the diff for the docs-map / AGENTS / Source-of-truth hygiene pass that first pointed at `docs/plans/` as historical.

```bash
git show ecb0c4c6dcdc8a2d8cc4151e1fd8ad4d9d421060
```

## 2026-08-12-xkez74gq-cli-library-management-done

**Title:** CLI library management

**Commit:** `1040a9b77e929c8bf1df980a2f049ec0ef53e27e`

Added a data-dir exclusive flock, shared `musicweb.runtime` bootstrap (migrate-if-no-server), and `LibraryJobRunner` as the only scan/regen orchestrator. Open the diff for the Typer CLI (`serve`, `scan`, regen, `stats`, `doctor`), the length-prefixed UDS control protocol, and `run_library_job` that prefers the live server then falls back to local `run_sync`.

```bash
git show 1040a9b77e929c8bf1df980a2f049ec0ef53e27e
```

## 2026-08-12-43bbt818-playback-details-dismiss-done

**Title:** Playback details dismiss

**Commit:** `c40343596373b40061c7fd6ae9f475501208e274`

Moved mobile Playback details from a footer Close pill to a Settings-style header dismiss, then tidied sheet chrome so the modal is not bottom-heavy. Open the diff for the `np-playback-details-*` header/CSS cut.

```bash
git show c40343596373b40061c7fd6ae9f475501208e274
```

## 2026-08-12-wr7lhei2-dismiss-icon-always-x-done

**Title:** Dismiss icon always X

**Commit:** `1a5015378698fc1c951c7918f3168dcee3d69ec2`

Stopped using chevron-down as close: Downloads manager and other modals always show `close`, and expanded now-playing’s collapse control is X on mobile as well as desktop. Open the diff for `PlayerBar` / `NowPlayingFull` `closeIcon` and the modal dismiss buttons.

```bash
git show 1a5015378698fc1c951c7918f3168dcee3d69ec2
```

## 2026-08-12-rkpl98o2-exclusive-audio-done

**Title:** Exclusive audio

**Commit:** `e804f7c11df3007a6f2913dce39a79904d5040f7`

Registered the exclusive FLAC allowlist (`flac_{depth}_{rate}`) on the same stream/prepare path, exposed it via `GET /api/exclusive-formats`, and shipped `musicweb exclusive-audio` (HOG_TOKEN, mpv, Core Audio devices) plus a Mac-PWA companion client. Open the diff for html vs companion sinks, exclusive hard-fail, and per-track exclusive prepare that never uses the browser stream codec.

```bash
git show e804f7c11df3007a6f2913dce39a79904d5040f7
```

## 2026-08-12-lakm77kz-pytest-setup-done

**Title:** Pytest setup

**Commit:** `636c0eb0f22128d74f273fc6bd50293d5f5a171a`

Declared pytest in the uv `dev` dependency group, added a smoke import test, and documented `uv run --group dev pytest`. Open the diff for the first test harness commit before later coverage work.

```bash
git show 636c0eb0f22128d74f273fc6bd50293d5f5a171a
```

## 2026-08-12-d2yjrox0-exclusive-audio-uvicorn-ws-sansio-done

**Title:** Exclusive audio uvicorn WS sansio

**Commit:** `14c6be56fb371b430837ec821cfa9756446531f1`

Pinned the exclusive-audio companion to `ws="websockets-sansio"` so uvicorn stops loading the deprecated legacy adapter, then script-verified hello still works. Open the diff for the one-line `uvicorn.run` pin in the companion CLI only.

```bash
git show 14c6be56fb371b430837ec821cfa9756446531f1
```

## 2026-08-12-9ta23trr-exclusive-settings-selects-done

**Title:** Exclusive settings selects

**Commit:** `bc88c1765256c531a583b88d46034268868553e8`

Replaced `QualitySelect` with a shared `SettingsSelect` (neutral CSS names, one options list, document-level outside-click) and migrated quality menus onto it. Open the diff for the exclusive settings UI that reuses that primitive.

```bash
git show bc88c1765256c531a583b88d46034268868553e8
```

## 2026-08-13-jsi7cnkr-exclusive-release-on-controller-loss-done

**Title:** Exclusive release on controller loss

**Commit:** `ba5708c16a378122b3a095a269512d723137db27`

Made exclusive a runtime property of the selected device (`set_device` arms; `release_device` unhogs and keeps idle mpv) and encoded “no controller ⇒ no exclusive hold” in one hub helper. Open the diff for disconnect/TTL release order, client re-apply of the persisted device, and the TTL hard-stop when the socket stays open.

```bash
git show ba5708c16a378122b3a095a269512d723137db27
```

## 2026-08-13-sj4gm7kd-exclusive-client-ux-done

**Title:** Exclusive client UX

**Commit:** `dc457afd1ac19353d9b3c1411b0fd79d63ddb61a`

Split persisted preference from companion live device so `isExclusiveArmed()` follows the hog target, and made exclusive play ensure-then-load. Open the diff for the exclusive primary face on the status line, Playback details rows from exclusive-formats, and Settings copy that no longer says “Armed” without a live device.

```bash
git show dc457afd1ac19353d9b3c1411b0fd79d63ddb61a
```

## 2026-08-14-qx3t950k-queue-track-context-menu-done

**Title:** Queue track context menu

**Commit:** `1c2777a85c2fd27a2f2edceeafc163b6867e909f`

Landed presentational `ActionCard` / `AnchoredMenu` / `ActionMenu` (no store) and wired session-queue ⋮ plus desktop right-click. Open the diff for Remove, kind-based download / Remove download, and Go to album / artist items, plus the 900px and close-before-confirm conventions.

```bash
git show 1c2777a85c2fd27a2f2edceeafc163b6867e909f
```

## 2026-08-15-5jaewd47-playback-exclusive-correctness-done

**Title:** Playback and exclusive correctness

**Commit:** `d2060f57c1155117f03ce1fc2a3de9824d1c3e28`

Stopped the HTML sink from reporting error with no `src`, isolated player loads so stale sink events no-op, and made hub disconnect/message ignore sessions that are no longer mapped. Open the diff for idempotent companion sync (`event.target === ws`, live inFlightKey), continue-on-remove of the current queue row, and “online means `canReachServer()`”.

```bash
git show d2060f57c1155117f03ce1fc2a3de9824d1c3e28
```

## 2026-08-15-pxfaa9xf-lossy-index-passthrough-done

**Title:** Lossy index and source passthrough

**Commit:** `81298998654dd2ebf1323ec9b8befb9bc54b74d2`

Added opt-in `MUSICWEB_INDEX_LOSSY`, lossless/lossy/indexable predicates, `is_lossy` / `bitrate_kbps` / album `lossy_kind`, and sibling skip so a lossy file next to a lossless copy is not indexed. Open the diff for `codec=source` stream/download (ffmpeg never sees a lossy path), client source play + exclusive refuse, and `LossyMark` on every title.

```bash
git show 81298998654dd2ebf1323ec9b8befb9bc54b74d2
```

## 2026-08-15-9h4h98f3-exclusive-identity-cleanup-done

**Title:** Exclusive identity cleanup

**Commit:** `72afa81f86bc86aa737c4aa0819b4b83ae93c777`

Made “this ClientSession is the current socket / live controller” a locked hub predicate used before player work and again before hub writes. Open the diff for `togglePlay` folded onto `ensureAudible`, `isLiveSocket` for companion sync, and the single `companion(fn)` dynamic-import helper.

```bash
git show 72afa81f86bc86aa737c4aa0819b4b83ae93c777
```

## 2026-08-15-rpkq7l4z-lossy-delivery-unfork-done

**Title:** Lossy delivery un-fork

**Commit:** `187b4ca15254b6e12d947fbdaa8fc601cdfb60f1`

Normalized the active stream tag to `"source"` for lossy tracks and deleted the copied offline/local/stream tree in `resolvePlaySource`. Open the diff for the `lossyKind` contract, shared MP4 ALAC-vs-AAC classify, `sourceFileMedia` ext/MIME table, and the single `read_metadata` reuse on the keep path.

```bash
git show 187b4ca15254b6e12d947fbdaa8fc601cdfb60f1
```

## 2026-08-15-kdeskmib-diag-logging-done

**Title:** Diagnostic event capture

**Commit:** `e0f84d085a4d700a5a874a7e200cf579d011f605`

Added rotating JSONL under the diag dir, `POST /api/diag/events` ingest, and a client logger (stable client_id, IDB outbox, Errors only / Everything cutoff). Open the diff for player/stream/prepare call sites, join-key headers, and `musicweb logs` (list/show/tail/purge) that does not take the data-dir lock.

```bash
git show e0f84d085a4d700a5a874a7e200cf579d011f605
```

## 2026-08-15-6trel93j-diag-quality-judo-done

**Title:** Diagnostic quality judo

**Commit:** `46377c5eac81ac0f45f10694d1b15d5ea709ce2e`

One server envelope + `event_files()`, one client `unacked` outbox, and one `/api` fetch helper that attaches diag headers (ingest flush stays raw `fetch`). Open the diff for `/api/stream`’s single try/except emit, player-seam emits on `beginLoad` / `failPlayback` / `attemptPlay`, and the CLI walker deleted in favor of `event_files`.

```bash
git show 46377c5eac81ac0f45f10694d1b15d5ea709ce2e
```

## 2026-08-15-46gctlry-diag-leftover-judo-done

**Title:** Diagnostic leftover judo

**Commit:** `2950e70939ec0403b5e15cea2c281d822eb23224`

Made `append_many` the only JSONL write+rotate path (`append` is a one-record wrapper) and collapsed outbox ack/cap delete onto `dropIds`. Open the diff for the single `http.stream` success emit after plan and path are known.

```bash
git show 2950e70939ec0403b5e15cea2c281d822eb23224
```

## 2026-08-15-m8zkkqp5-lossy-delivery-judo-done

**Title:** Lossy delivery judo

**Commit:** `3eb36ea70dff4f79c1272125c0f83a5ec3093ce1`

Added `audio_kind(path)` as the only walk/batch classify, restricted passthrough media to mp3/aac (else 400 / JS throw), and made `deliveryCodec` the only client tag decision. Open the diff for album-kind at the fetch boundary, and the play-load unfork that deletes remaining `isLossy` control flow in HTML/exclusive load.

```bash
git show 3eb36ea70dff4f79c1272125c0f83a5ec3093ce1
```

## 2026-08-15-wiicqyl8-offline-startup-done

**Title:** Offline startup and download playback

**Commit:** `c3aa7fb08e16fe3eae0ea4043b34dd30205e4e9b`

Persisted the raw `/api/codecs` payload and applied stored quality prefs before the network GET, then treated the server as reachable only after a successful API in this page lifetime. Open the diff for fail-closed service-worker install (partial precache must not activate) and the boot path that no longer persist-disables downloads on `initDownloads` failure.

```bash
git show c3aa7fb08e16fe3eae0ea4043b34dd30205e4e9b
```

## 2026-08-15-3wzmasnl-offline-play-leftovers-done

**Title:** Offline play leftovers

**Commit:** `344c56df5633897e917dfb82979edb7413f11421`

Made boot `GET /api/codecs` no-store so `reportSuccess()` means the origin answered, and named `canUseRemoteMedia()` as the one play-online gate. Open the diff for queue rows that gray and skip on next/prev/ended when downloads are on and remote media is closed.

```bash
git show 344c56df5633897e917dfb82979edb7413f11421
```

## 2026-08-15-f3622rq7-offline-play-judo-done

**Title:** Offline play judo

**Commit:** `d6bf984ce2c3fe27eb641c2a2921ae8db299ddaf`

Published reachability as a snapshot (`canUseRemote` on the Vue store) and moved skip walks into playlist `stepNext` / `stepPrev` / `advanceToPlayable`. Open the diff for the player split (`playerState`, `playerSession`, `playerPrefs`) so skip and Media Session are not stuffed into the load/transport file.

```bash
git show d6bf984ce2c3fe27eb641c2a2921ae8db299ddaf
```

## 2026-08-16-kvlan2cd-idle-stream-cache-wipe-done

**Title:** Idle stream-cache wipe

**Commit:** `c6ba25a0ac30164554b7302fb2393b61cbc0c8ca`

Added a pure idle predicate and `StreamCacheIdle` counter, then wrapped every HTTP request so enter/exit span the full body send. Open the diff for the ~60s sweeper that calls `Transcoder.clear_cache()` under the same gate as `POST /api/cache/clear`, and drains an in-flight wipe before shutdown.

```bash
git show c6ba25a0ac30164554b7302fb2393b61cbc0c8ca
```

## 2026-08-16-a923d3cj-unit-test-coverage-done

**Title:** Unit test coverage for meaningful components

**Commit:** `bd3ac7b21745124cbbb6ee29878c6bc5d0ab6f6a`

Added a tmp-data-dir migrated-SQLite pytest fixture and a dual Vitest node/browser split, then filled hermetic tests for path jail, fingerprint/walk, identity/reattach, job-runner single-flight, transcode probe, and frontend policy/stores. Open the delete commit to recover the coverage inventory and the never-boot / no-ffmpeg / no-coverage-gate boundaries.

```bash
git show bd3ac7b21745124cbbb6ee29878c6bc5d0ab6f6a
```

## 2026-08-16-b9ut1p4i-vite-pnpm-vitest-browser-done

**Title:** Vite + pnpm + Vitest browser (initial cutover)

**Commit:** `45ef5c1af6fff2a4bf34e89c73f61ea0c841d844`

Scaffolded `frontend/` as a Vite + pnpm package, copied the SPA onto HMR with an `/api` proxy, and added a Chromium Icon smoke. Open the diff for the FastAPI cutover: serve `frontend/dist` or refuse to start, rewrite PWA inventory to walk hashed dist, and delete `vendor_deps` / Jinja / the no-bundler tree.

```bash
git show 45ef5c1af6fff2a4bf34e89c73f61ea0c841d844
```

## 2026-08-16-n0sv0eq7-vue-sfc-typescript-done

**Title:** Vue SFC + TypeScript frontend

**Commit:** `76724e2e9ad8a0361dd5d1d42b09580939fb929e`

Landed Vue SFC + TypeScript tooling on the still-JS app, then freeze-rewrote `frontend/js/` to `frontend/src/` (`<script setup lang="ts">`, `@/` imports, `vue-tsc` in build). Open the diff for the conversion recipe and the runtime-only Vue / Options-API-off cutover.

```bash
git show 76724e2e9ad8a0361dd5d1d42b09580939fb929e
```

## 2026-08-17-fzzscc2t-mobile-tabs-done

**Title:** Fix mobile tabs

**Commit:** `1503c53c13a682586b97ac1121f842fa5a1a3e37`

Gave `LibraryView` a single root so `:class="{ hidden: onQueue }"` lands on `#view-library` and only one pane shows below 900px. Open the diff for mode-chip horizontal scroll with last-library-mode selection on `/queue`, and icon-only queue header actions on mobile.

```bash
git show 1503c53c13a682586b97ac1121f842fa5a1a3e37
```

## 2026-08-17-htxyxcq5-selection-copy-menus-done

**Title:** Selection and copy menus

**Commit:** `4537e82d11f11dd1d9726ad25471432f147c0df1`

Locked chrome selection (opt-in only for inputs and plain lyrics), extracted a shared clipboard helper, and built entity menu builders plus lyrics flatten / memory peek. Open the diff for `⋯` on list/grid/tree/headers/now-playing (including downloads projections) that copies names and flattened synced lyrics.

```bash
git show 4537e82d11f11dd1d9726ad25471432f147c0df1
```

## 2026-08-17-s2p5gdhq-custom-artist-art-done

**Title:** Custom artist art

**Commit:** `cd529cf155b9fdf9f7d7c346f09e371b641fde17`

Added a second `WebpAssetStore` for preferred portraits, made GET serve that file first, and shipped POST/DELETE plus a 1:1 cropper. Open the diff for artist list/grid/tree menus (Change photo / Use library photo), the overlay, and the offline IDB pending queue that POSTs when the server returns.

```bash
git show cd529cf155b9fdf9f7d7c346f09e371b641fde17
```

## 2026-08-18-kf508gw0-copy-menu-icon-done

**Title:** Copy menu icon

**Commit:** `501577ce650930a88410b477436a22f63c39f26d`

Added an `i-copy` sprite and set `icon: "copy"` on every ActionMenu copy row (`copyAction` and the hand-built Copy lyrics item). Open the diff for the sprite mark and the tests that lock the icon field so label-only copy cannot return from conventions.

```bash
git show 501577ce650930a88410b477436a22f63c39f26d
```

## 2026-08-18-pwjs1lf2-lossy-source-codec-details-done

**Title:** Lossy source codec details

**Commit:** `f1ba93d1525d072efac69d1cdcc93df88968e26b`

Scan now puts `bitrate_kbps` on every `TrackMetadata` return and classifies `bitrate_mode` (MP3 via mutagen, AAC-in-m4a via `esds` max vs avg). Open the diff for the `tracks.bitrate_mode` column and the Playback details Encoding / Sample rate rows (catalog snapshot included) that omit unknown values.

```bash
git show f1ba93d1525d072efac69d1cdcc93df88968e26b
```

## 2026-08-18-urbovyrn-resume-pause-position-done

**Title:** Resume playback position

**Commit:** `a68a905e3a7e9fd3adc6a3bb19d5272231846bf8`

Added a pure position-store module (schema, id match, 3s near-end clamp) and wired it to pause, page hide, paused seeks, and cold `playIndex`. Open the diff for HTML and companion resume with no auto-play, and the invalidation paths on skip/stop/already-loaded replay.

```bash
git show a68a905e3a7e9fd3adc6a3bb19d5272231846bf8
```

## 2026-08-19-21vzgiyq-exclusive-hw-volume-done

**Title:** Exclusive hardware volume

**Commit:** `12d991d182992165c1dd5439a4a4bf9db474d4ef`

Added a pure exclusive volume policy (slider clamp, hardware-vs-digital plan, one-device tenure) and real fail-open Core Audio get/set via a shared HAL bootstrap. Open the diff for `MpvPlayer` unhog-then-restore on device change / `release_device` / `close()`, and honest `volume_path`.

```bash
git show 12d991d182992165c1dd5439a4a4bf9db474d4ef
```

## 2026-08-20-46mun4bs-playback-stats-done

**Title:** Playback stats

**Commit:** `f38df6b3cecaebb1a75cc40cb23a5008ef63c875`

Added `listen_events` plus a single-object ingest / rankings API, and a pure 70% play-cycle accumulator. Open the diff for the localStorage outbox (`listens/bridge.ts` from sink hooks) and the bookmarkable Stats mode (time chips, top-100 artist and track rows).

```bash
git show f38df6b3cecaebb1a75cc40cb23a5008ef63c875
```

## 2026-08-20-1wxkwgb3-drop-network-quality-prefs-done

**Title:** Drop network-conditioned quality prefs

**Commit:** `c4236650c0cb14611e81902ec829f9ccb3269e35`

Collapsed streaming quality to one Settings picker and removed cellular/Wi-Fi download pause plus the Network Information module. Open the delete commit for `getActiveStreamCodec` becoming a thin persist read, the dropped `metered` auto-pause reason, and the docs that no longer mention cost hints.

```bash
git show c4236650c0cb14611e81902ec829f9ccb3269e35
```

## 2026-08-20-5yx7hzdd-now-playing-cover-flip-done

**Title:** Now-playing cover flip

**Commit:** `066ce0136b9bbb51b98e0d30480f01ecd8008b9d`

Large now-playing covers (expanded on-demand and the radio room) flip to the album-artist photo when the server confirms one exists. Open the delete commit for the eligibility helper (`canReachServer` plus `has_image` / `has_preferred_image`) and the shared `NowPlayingView` 3D card that mini and compact still treat as an open target.

```bash
git show 066ce0136b9bbb51b98e0d30480f01ecd8008b9d
```

## 2026-08-20-ddwppkpb-fix-radio-player-done

**Title:** Fix radio now-playing and stay-tuned

**Commit:** `90f80f00c5ec53eafa3e784daac8aaf03ee32a1f`

Radio now shares `NowPlayingView` with on-demand, hides `#player` on `/radio`, and no longer Tunes out on station `ended`. Open the delete commit for the stay-tuned pause latch, Tune in/out glyphs, and the mobile-mini / desktop-compact off-radio chrome.

```bash
git show 90f80f00c5ec53eafa3e784daac8aaf03ee32a1f
```

## 2026-08-20-m5ymnatw-household-radio-done

**Title:** Household 24/7 radio

**Commit:** `7b1486150434bb8d8ca3f80ccd83dc5da130e58b`

Added a household-wide encode-and-seek radio station that ticks from process start (simulation when no tuners) and a Radio tab that Tunes in to the official clock. Open the delete commit for the picker/banlist/ffprobe path, SQLite catch-up, tuner WebSocket `tune_in` / `tune_out`, and the radio-owned audio element.

```bash
git show 7b1486150434bb8d8ca3f80ccd83dc5da130e58b
```

## 2026-08-20-nrnijuid-transcode-forget-done

**Title:** Replace wipe-all cache clear with id-scoped forget

**Commit:** `59219ec9f12f9e77d2777f04623893fedcfbfe61`

Replaced `POST /api/cache/clear` with `POST /api/transcode/forget` so queue clear and last-row remove drop only those tracks' process-temp encodes (radio current plus remaining stay). Open the delete commit for the retain-set primitive, the HTTP surface, and the fire-and-forget client callers that also drop `preparedKeys`.

```bash
git show 59219ec9f12f9e77d2777f04623893fedcfbfe61
```

## 2026-08-20-yi1n4gv2-radio-status-when-tuned-done

**Title:** Radio stream details only when tuned

**Commit:** `e30239e8fe3dc82dd4075a9323001ac55d241380`

The Radio room codec-line badge mounts only while `chrome === "tuned"` and leaves an empty same-height hole otherwise. Open the delete commit for the `showStatus` / `reserveStatus` props on `NowPlayingView` and the wrap min-height that keeps extras from jumping.

```bash
git show e30239e8fe3dc82dd4075a9323001ac55d241380
```

## 2026-08-21-hb849r52-critical-structure-done

**Title:** Collapse play, stream, and catalog decision copies

**Commit:** `954766bbde4c5f7b6d3b95d16f694d7b3d683eb9`

Unified exclusive vs HTML play into `resolvePlayIntent`, made server lossy/source a `stream_intent` result, and serialized catalog commit/delete under one IDB mutex. Open the delete commit for `downloads/media.ts`, `passthrough.stream_intent`, and the `claimOnDemand` / `claimRadio` session handoff.

```bash
git show 954766bbde4c5f7b6d3b95d16f694d7b3d683eb9
```

## 2026-08-21-kqhga9l0-teardown-browse-jail-done

**Title:** Delete session, browse, and path-jail twins

**Commit:** `5f80411735ac287c956712929610029e0b4fcfb8`

One on-demand teardown pair (always stop HTML; companion only on unavailable or sink change), one `LibraryView` over a `BrowseSource`, and `Library.present_audio` as the path-jail presence check. Open the delete commit for `useEntityMenu`, the cover-src empty-string vs omit contract, and the exclusive-keeps-playing teardown fix.

```bash
git show 5f80411735ac287c956712929610029e0b4fcfb8
```

## 2026-08-21-lbaziki9-review-leftovers-done

**Title:** Delete leftover wrappers; make PlayIntent the load contract

**Commit:** `3cb0616261416e03cc0f8e0e97ada7168d8c78b9`

Deleted names that did not own a model (`applyCatalogPins`, `applyOutcomeSafely`, `claimRadio`, `prepareTag`) and made `PlayIntent` a discriminated union so `loadIntent` is apply plus `sink.load`. Open the delete commit for tagless `can_encode` on forget and the flattened exclusive-notice branch.

```bash
git show 3cb0616261416e03cc0f8e0e97ada7168d8c78b9
```

## 2026-08-21-opery0np-browse-status-types-done

**Title:** One browse source, session-owned status, camel Artist

**Commit:** `3b1cb9b47a611f6ad697be125f05a43dfe06e5be`

Tree and list now ask one `BrowseSource` for roots, children, and covers; the status line branches on `session` so `RADIO_EXCLUSIVE_SNAP` is gone; artists plus catalog records are camel at the type boundary. Open the delete commit for `fromApiArtist`, stats leaving `load()`, and art-key unification to `artist:` / `cover:` thumbs.

```bash
git show 3b1cb9b47a611f6ad697be125f05a43dfe06e5be
```
