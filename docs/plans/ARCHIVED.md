# Archived plans

Done plan directories removed from `docs/plans/` via git rm. Each entry's command shows that plan's delete commit.

## 2026-08-16-a923d3cj-unit-test-coverage-done

**Title:** Unit test coverage for meaningful components

**Commit:** `bd3ac7b21745124cbbb6ee29878c6bc5d0ab6f6a`

Shipped a hermetic pytest harness (tmp SQLite via the production migrate path) and a dual Vitest node/browser split, then filled unit tests for fingerprint, identity/reattach, job runner, transcode probe, and frontend policy/stores.

A later agent would open the delete commit to recover the coverage inventory and the never-boot / no-ffmpeg / no-coverage-gate boundaries that living docs only summarize.

```bash
git show bd3ac7b21745124cbbb6ee29878c6bc5d0ab6f6a
```

## 2026-08-16-b9ut1p4i-vite-pnpm-vitest-browser-done

**Title:** Vite + pnpm + Vitest browser (initial cutover)

**Commit:** `45ef5c1af6fff2a4bf34e89c73f61ea0c841d844`

Cut the SPA over from no-bundler ESM and vendor_deps onto a frontend/ Vite + pnpm package; FastAPI now serves frontend/dist and refuses to start without it, and PWA inventory walks that dist.

Open the diff to see how Jinja/import-map serving was deleted and how /sw.js fingerprinting was rewritten for hashed assets.

```bash
git show 45ef5c1af6fff2a4bf34e89c73f61ea0c841d844
```

## 2026-08-16-n0sv0eq7-vue-sfc-typescript-done

**Title:** Vue SFC + TypeScript frontend

**Commit:** `76724e2e9ad8a0361dd5d1d42b09580939fb929e`

Converted the Vue 3 SPA from defineComponent JS modules with string templates to <script setup lang="ts"> SFCs under frontend/src/, with vue-tsc as the type gate.

Open the diff for the freeze-and-convert recipe, hand-written API types (no OpenAPI codegen), and the runtime-only Vue / Options-API-off cutover.

```bash
git show 76724e2e9ad8a0361dd5d1d42b09580939fb929e
```

## 2026-08-17-fzzscc2t-mobile-tabs-done

**Title:** Fix mobile tabs

**Commit:** `1503c53c13a682586b97ac1121f842fa5a1a3e37`

Restored single-pane mobile switching by giving LibraryView a real root so .hidden fallthrough lands, made mode chips scroll and light from last library location (including on /queue), and collapsed queue header actions to icons below 900px.

Open the diff to see the fragment-class leak and the ModeBar selection source that must not use raw route.meta.mode on the queue.

```bash
git show 1503c53c13a682586b97ac1121f842fa5a1a3e37
```

## 2026-08-17-htxyxcq5-selection-copy-menus-done

**Title:** Selection and copy menus

**Commit:** `4537e82d11f11dd1d9726ad25471432f147c0df1`

Locked chrome text selection app-wide and put a ⋯ overflow menu on every music entity (list, grid, tree, page headers, now-playing) that copies names and lyrics instead of relying on native selection.

Open the diff for the builder/host split, downloadsMenuMap projections, and the lyrics flatten / memory-peek Copy lyrics contract.

```bash
git show 4537e82d11f11dd1d9726ad25471432f147c0df1
```

## 2026-08-17-s2p5gdhq-custom-artist-art-done

**Title:** Custom artist art

**Commit:** `cd529cf155b9fdf9f7d7c346f09e371b641fde17`

Added a library-wide preferred artist portrait: crop-to-square on the client, store under covers/artists-preferred/ so scan cannot touch it, serve it first from GET /api/artist-image, and queue uploads/reverts while offline.

Open the diff for GET flag honesty, the artistArt overlay/pending module split, and why the preferred store is sacred to scan.

```bash
git show cd529cf155b9fdf9f7d7c346f09e371b641fde17
```

## 2026-08-18-kf508gw0-copy-menu-icon-done

**Title:** Copy menu icon

**Commit:** `501577ce650930a88410b477436a22f63c39f26d`

Added an i-copy sprite and made every ActionMenu copy row (including Copy lyrics) use icon: "copy" so those items match Add/Download/Go to.

Open the diff for the sprite mark and the builder tests that lock the icon field.

```bash
git show 501577ce650930a88410b477436a22f63c39f26d
```

## 2026-08-18-pwjs1lf2-lossy-source-codec-details-done

**Title:** Lossy source codec details

**Commit:** `f1ba93d1525d072efac69d1cdcc93df88968e26b`

Scan now actually persists bitrate_kbps and a new bitrate_mode (MP3 via mutagen, AAC via an esds walk); Playback details shows Encoding and Sample rate for lossy originals without inventing CBR/VBR.

Open the diff for the esds walker, the TrackMetadata bitrate drop bugfix, and the catalog/queue snapshot fields needed offline.

```bash
git show f1ba93d1525d072efac69d1cdcc93df88968e26b
```

## 2026-08-18-urbovyrn-resume-pause-position-done

**Title:** Resume playback position

**Commit:** `a68a905e3a7e9fd3adc6a3bb19d5272231846bf8`

On pause, page hide, or a paused seek, the current track position is stored; the next cold Play seeks there and does not auto-play.

Open the diff for the dedicated localStorage key, near-end-is-0 clamp, invalidation on skip/stop, and companion pending-resume until duration is known.

```bash
git show a68a905e3a7e9fd3adc6a3bb19d5272231846bf8
```

## 2026-08-19-21vzgiyq-exclusive-hw-volume-done

**Title:** Exclusive hardware volume

**Commit:** `12d991d182992165c1dd5439a4a4bf9db474d4ef`

Exclusive hog now writes Core Audio analog gain when a hardware volume selector succeeds, keeps mpv at unity on that path, and restores the pre-hog snapshot after unhog — including companion process stop.

Open the diff for ExclusiveVolume tenure, HAL selector order, and the unhog-then-restore player sequence.

```bash
git show 12d991d182992165c1dd5439a4a4bf9db474d4ef
```
