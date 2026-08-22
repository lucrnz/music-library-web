**Archive.** Decisions in this file were current as of 2026-08-22 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Ownership deletes from nuclear review

## Goal

Delete four leftover ownership forks the codebase nuclear review named as highest impact: one play-fail path, stats out of the browse load machine, a one-way downloads abort graph, and the scan walk out of the job runner. Behavior stays the same.

## Settled decisions

- Scope is those four ownership deletes only. Companion message dispatch, CSS dumps, NowPlaying cover-flip extract, playlist saved-list split, Core Audio HAL split, moving `NowPlayingHub`, exclusive radio, and merging `LibraryView` / `LibraryTreePane` menu hosts are out.
- Play-fail contract is `PlayBlockError` (`reason` + `message`) on `playBlock.ts`, plus `toPlayBlockError(err, fallback)` for unknown rejects. `companionSink.load` throws it. HTML and companion `onError` pass it. `attemptPlay` does not re-read sink kind. `failCurrentLoad` is the only play-source face writer for failures. `beginLoad` / `loadResolved` / `failCurrentLoad` / `attemptPlay` move to `frontend/src/playback/load.ts`. `player.ts` keeps transport, sink wiring, and re-exports.
- `/stats` stays `pane: library` inside a mounted `LibraryView` (ModeBar unchanged). Delete `applyStatsChrome`. Template gates title / back / `StatsView`; navigation never calls `load()` on stats. `BrowseSource` static booleans become a `flags` object; `showAddAll` / `showAddSelected` / `showDownloadAlbum` / `includeArtistPhoto` become one `chrome(input)`. One `cover()` serves list and tree. Load, navigate, tree, and menu methods stay.
- `queue.ts` must not import `queueRuntime`. Active cancel and freeze abort live in `queueRuntime`. `initPolicy` receives `freeze` so `queuePolicy` does not import runtime (runtime already imports policy). The live `Map` in `queue.ts` is the only live-progress store. Delete `downloads.liveProgress` and `overlayQueue`. `refreshQueue` may join `getAllLiveProgress()` onto the listed rows for that assignment only.
- Index walk + batch flush moves to new `src/musicweb/scan/index_phase.py` (`run_index`). `LibraryJobRunner._do_index` calls it. Progress logging stays on the runner via a callback. Runner drops `iter_indexable_audio` / `process_batch` imports.
- Living-doc pointer updates are a final stage so each code stage stays a behavior-preserving delete.

## Design

`PlayBlockError` extends `Error` and is the sink/load failure value. `SinkHandlers.onError` takes `PlayBlockError` (optional media details stay). HTML maps element errors to `play_failed`. Companion maps a known `PlayBlockReason` code or defaults to `exclusive_failed`. `loadResolved` on a failed `attemptPlay` calls `failCurrentLoad` from that error. Exclusive toast / Settings-open rules stay inside `failCurrentLoad`. Broken-local retry stays a `loadResolved(..., { localBroken: true })` re-enter, not a second fail interpreter.

Stats is a body switch in the library pane, not a browse source and not a chrome-mutation function. `libraryShowTree` already excludes stats. Chrome props must not leak the previous mode’s `showBack` (`mode !== "stats"` in the template).

Downloads import graph after the invert:

- `queueRuntime` → `queue` (CRUD) and `queuePolicy` (`canPump`, `initPolicy`)
- `queuePolicy` → `queue` (IDB helpers) and the injected `freeze`
- `queue` → neither runtime nor policy
- `index` → runtime for cancel / freeze / stop

`queue.ts` `freezeWork` becomes IDB-only pause (returns ids that were active). Runtime aborts those ids. `cancelQueueItem` in `index.ts` calls runtime; inactive rows still `discardRow` without touching `activeIds`.

`run_index` is the current `_phase_index` loop: walk, `BATCH_SIZE` flush via `process_batch`, `seen_paths` / `cover_queue`, cancel, progress callback. Result populates `PhaseCtx`. Finalize / covers / enrichment stay on the runner.

## Stage map

Dependency-free code stages, ordered by impact: play-fail blocks future playback work; browse/stats blocks another library mode; downloads cycle is the next client ownership leak; scan walk is the backend twin. Docs last so source-of-truth lines match the finished tree.

1. Play-fail extract — typed error + `playback/load.ts`
2. Stats eject + BrowseSource slim — depends on nothing in (1)
3. Downloads abort invert — depends on nothing in (1)–(2)
4. Scan `index_phase` — depends on nothing in (1)–(3)
5. Living docs — depends on (1)–(4) file locations

## Out of scope

- Companion `handleMessage` dispatch table; device-ensure extract
- `modal.css` / `app.css` splits
- `useCoverFlip`; `NowPlayingView` prop reduction
- `playlist.ts` saved-playlist split
- `exclusive/coreaudio.py` HAL split
- Moving `NowPlayingHub` out of `routes/radio.py`
- Exclusive-mode radio
- Merging list/tree menu hosts
- Exclusive radio flags on `PlayIntentCtx`

## Assumptions

- Existing exclusive toast / Settings-open / broken-local-fallback behavior is correct and must be preserved, not redesigned.
- `/stats` remounting `LibraryView` is rejected; the pane stays mounted.
- `entityActionsFor` keep taking `includePhoto` from the host; the host reads it from `chrome()`.
- No schema, HTTP, or scan identity changes.
