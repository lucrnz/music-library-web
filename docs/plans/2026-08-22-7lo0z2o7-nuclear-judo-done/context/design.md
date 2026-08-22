**Archive.** Decisions in this file were current as of 2026-08-22 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Nuclear judo

## Goal

Delete the five highest-impact forks the 2026-08-22 codebase nuclear review named: exclusive as a play *mode*, radio as a second player plus retain leak, a rebuilt-per-caller downloads catalog, untyped tree nodes, and the jobs `PHASES`/`getattr` mini-framework plus multiplied scan I/O. Behavior stays the same.

## Settled decisions

- Scope is those five judo items, **TreeNode only** (no `LibraryView` / `LibraryTreePane` merge). Living docs are a final stage.
- Every stage is behavior-preserving. No exclusive-mode radio. No CSS dumps. No NowPlaying cover-flip extract. No playlist saved-list split. No Core Audio HAL split. No downloads `index.ts` façade collapse. No exclusive FLAC matrix move: the 12 tags stay in `PROFILES` (`browser_listed=False` except the three marketing FLACs). `GET /api/exclusive-formats` stays on the library server.
- Play decision lives in `frontend/src/playback/playIntent.ts` (`resolvePlayIntent`, `shouldPrepare`, `isPlayableNow`). `PlayIntentCtx` has no `exclusiveEnabled`. `isExclusiveEnabled()` is not imported from `playIntent.ts`, `prepare.ts`, or `settings.ts`. A small `playback/deliveryPolicy.ts` is the only exclusive-aware builder (`sink` + `profileFor`); `load.ts` and `prepare.ts` call it. `PlayDelivery` is deleted. `failCurrentLoad` stays the only fail writer; exclusive toast / `openSettings` on `exclusive_needs_device` stay identical.
- `bindSettingsPrepareTracks` / `StreamChangeCtx` / `getTracksFn` are deleted. `setStreamCodec(id)` persists only. `player.ts` watches `settings.streamCodec` and `settings.playbackPolicy` and owns both reload and prepare-on-change.
- Radio keeps a **second** `HTMLAudioElement`. It implements `PlaybackSink` (plus today’s async load/seek/play). Radio does **not** go through `loadResolved`. `radio/runtime.ts` is socket only. Face + `loadCurrent` move to new `frontend/src/radio/session.ts`. `stores/radio.ts` stays chrome. `RadioRuntimeHost` is deleted. `become("radio")` remains the handoff.
- `/api/transcode/forget` stops importing the station. Lifespan registers a retain-ids hook; `media.py` reads it through `routes/deps.py`. Same skip-retained set as `station.retained_track_ids()`.
- Downloads: one in-memory catalog view in `snapshot.ts`, invalidated on catalog mutation. `addAll` / list / tree / manager share it. `index.ts` façade and queue hook inversion stay.
- `TreeNode` is a discriminated union (`artist` / `album` / `track` / `dir` / `file`) in `frontend/src/components/tree/treeNode.ts`. Hosts stop casting `data`.
- `LibraryJobRunner` stays the single-flight / thread / cancel / `ScanState` wrapper. `PHASES` and `getattr(self, f"_do_{name}")` go away. `run_scan` / `regen_covers` / `regen_artist_images` / `regen_lyrics` are functions in `src/musicweb/scan/jobs.py`.
- Scan I/O: one mutagen (or MP4) open per path on the **batch + sibling** hot path. Walk eligibility may still classify before batch. **Lyrics pass1b stays** — it is the candidate collector for stale `ok`/`instrumental` fingerprints; dropping it would skip those rows. `needs_fetch` remains the gate.

## Design

**Delivery.** Exclusive is a sink + per-track profile, not a boolean in the decide function. `deliveryPolicy.ts` asks exclusive prefs and returns `{ sink, profileFor(track) }`. `resolvePlayIntent` branches on `ctx.sink === "companion"` (today’s `exclusiveIntent`) vs `resolvePlaySource` + `htmlAudio`. `prepareTracks` groups by `profileFor` and never names exclusive. `shouldPrepare` is today’s `tracksToPrepare` / `willPreferLocal` test. `isPlayableNow` is today’s offline skip used by `playNext` / `playPrev`. HTML resolve stays in `downloads/resolve.ts` without an exported `PlayDelivery` twin.

**Radio session.** Two elements, one sink interface. `createRadioAudio()` already owns ignore-during-seek; it also satisfies `PlaybackSink` (`kind: "htmlAudio"`). `radio/session.ts` owns face transitions and `loadCurrent` (url → load → interpolated seek → play → Media Session). `runtime.ts` owns WebSocket open/close/send/recv/reconnect and emits parsed snapshots / tune acks. The chrome store calls session + runtime; it does not pass a host bag.

**Radio retain.** Forget still calls `resolve_forget(session, ids, retained)`. `retained` comes from `app.state.retain_stream_ids()` set in `lifespan` to `station.retained_track_ids`. `deps.retain_stream_ids(request)` is the HTTP read. `media.py` does not mention radio.

**Catalog view.** `loadDownloadsCatalogView` builds once, caches the `DownloadsCatalogView`, and `invalidateDownloadsCatalogView()` clears it. `writer.ts` catalog mutations (finalize / delete / wipe / orphan / art pin) invalidate. Callers keep the same function name; they no longer each walk IDB.

**TreeNode.** Union members carry typed `data` (`Artist`, `LibraryAlbum`, `Track`, `FileRowModel`) or `path` for `dir`. `treeNodeId` / `treeNodePath` become field access. Sources construct the matching member. `LibraryTreePane.targetFromNode` and browse `cover({ kind: "tree" })` switch on `kind` with no `as Artist`.

**Jobs.** `run_scan(...)` runs index → finalize → covers → artist_images → lyrics with cancel checks and a progress callback. Regen functions are the current `_do_*` bodies. The runner maps `kind` to one function, owns `ScanState` / thread / `_begin` / cancel.

**Scan I/O.** `process_batch` and `lossless_slots_in_dir` share a per-path metadata cache so `audio_kind` / `read_metadata` do not reopen the same file. Sibling skip keys stay tag-based (same winners). Lyrics candidate SQL + pass1b + sidecar stay.

## Stage map

Dependency first, then impact among independents.

1. **Delivery policy** — nothing in this plan depends on it; it unblocks later playback work and is the highest-impact delete.
2. **Radio session** — independent of (1); next impact on the play stack.
3. **Radio retain** — independent of (1)–(2) at the type level; follows (2) so radio ownership moves as one backend/frontend pair.
4. **Typed TreeNode** — independent of play; must land before the downloads snapshot because that snapshot packs tree roots.
5. **Downloads catalog** — depends on (4) so the cached view is built with the union.
6. **Jobs functions** — independent of the client; backend impact after radio retain.
7. **Scan I/O** — no dependency on (6); follows it so jobs and scan do not share a stage.
8. **Living docs** — depends on (1)–(7) file locations.

## Out of scope

- Merging `LibraryView` and `LibraryTreePane` (menu hosts, `BrowseSource` shrink, stats as a sibling view)
- Exclusive-mode radio; exclusive flags on radio `PlayIntent`
- Moving the 12-cell FLAC matrix or `exclusive_formats_payload` out of `transcode/profiles.py`
- Downloads `index.ts` façade / `setQueueMutationSideEffects` invert
- `NowPlayingView` cover-flip extract, `NowPlayingFull` deletion, CSS splits
- `playlist.ts` saved-playlist split
- `exclusive/coreaudio.py` HAL split
- Moving `NowPlayingHub` out of `routes/radio.py` as its own change
- Dropping lyrics pass1b
- `start` / `run_sync` lock-dance dedup on the runner
- Walk + batch as a single file open
- `app.state` dataclass / global `ValueError` handler / `CoverStore` deletion
- `SnapshotTrack` / `TrackPayload` merge

## Assumptions

- Existing exclusive toast / Settings-open / broken-local fallback / radio seek-ignore / retain-skip / sibling-skip / lyrics fingerprint refresh behavior is correct and must be preserved.
- `/stats` stays a `mode` hole inside a mounted `LibraryView`.
- Tests already pin `playIntent`, `prepare`, `playBlock`, radio audio latch, `resolve_forget` retain, jobs single-flight, and scan batch — stages extend those rather than inventing a second harness.
- `pnpm --dir frontend typecheck` and the named vitest/pytest files are the checkable bar for each code stage.
