**Archive.** Decisions in this file were current as of 2026-08-22 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Delete leftover host forks

## Goal

Finish the nuclear-review extracts the last wave named and then parked. After this plan: one fail host, one volume writer with sink subscribers, radio face machine in `radio/runtime.ts`, queue abort in `queueRuntime.ts`, a typed job `PhaseCtx`, a module-level exclusive `COMMANDS` table, and the leftover husks gone. Behavior-preserving only.

## Settled decisions

- This plan **implements** the leftover-fork package from the 2026-08-22 codebase nuclear review. It is not a research plan.
- Structure only. Same play, radio, download, scan, browse, and exclusive behavior. Dead production symbols may be deleted; tests update. No new user-facing behavior. No new ADR.
- Failures: `failCurrentLoad` is the only fail host. Delete `failNotice`. Unavailable `loadResolved` and sink `onError` both call it. Exclusive toast (no title prefix) and Settings-on-`exclusive_needs_device` stay as today’s product rules, derived once from `reason`. `applyIntent` remains the only play-source writer. `setPlayNotice` is the only `playNotice` writer.
- Volume: `setOutputVolume` is the only writer (face + storage). `player.ts` watches `player.volume` and applies `activeSink.setVolume`. Radio already watches and keeps applying to radio audio. `player.setVolume` becomes a call to `setOutputVolume`. Do not apply volume as a special case on every `loadResolved`.
- Radio: finish the extract. Move `onFaceOrTrack`, change-detection, and `maybeReseek` into `radio/runtime.ts`. `stores/radio.ts` stays the reactive chrome face plus `applySnapshot` / `tuneIn` / `tuneOut` / `setTabOpen`. Delete `currentLoadKeys`, the duplicate `socketRequired`, and the reconnect face ladder (reconnect calls `onFaceOrTrack`). Shrink `RadioRuntimeHost` to what still breaks the `radio.ts` ↔ `runtime.ts` cycle. Do not add a third radio module. Radio still does not implement `PlaybackSink`.
- Downloads runtime: `queueRuntime.ts` owns `activeIds`, abort controllers, `abortJob` / `stopAll`, and the pump. `queue.ts` is IDB + events + live progress. Delete `abortAllJobs`, `commitTrackDownload`, and the `markDownloadBroken` pass-through (`player.ts` imports the catalog writer).
- Jobs: typed `PhaseCtx` dataclass + one `_begin_phase`. `PHASES` stays on `LibraryJobRunner`. No `jobs/kinds.py`. Control RPC names do not change.
- Exclusive: module-level typed `COMMANDS` + one `_with_live`. Heartbeat and `list_devices` (readonly-allowed) stay outside the table. Drop `MSG_PLAY` and unread `companionPlaying` / `companionPaused`. Delete `commitHogToken`. `ExclusiveAudioPanel` still pairs setters with `syncCompanionConnection` / `syncPreferredDevice`. Device wire fields stay `sample_rates` / `bit_depths`. Store still does not import the client.
- Husks in this plan: dual tree `TrackRow`, dead `downloadCurrentAlbum`, fold `libraryActions.addAll(loc)` into `onlineBrowse.addAll`, saved-playlist `trackCount` mapper, `artistFromDl` / `albumFromDl` in downloads list browse, delete `connectivity.getState`, `provider_json` for artist-image HTTP, radio serialize uses `position_seconds` without reclamping. Offline-unplayable predicate is one helper used by `playNext` / `playPrev` and `PlaylistView.rowUnavailable`.
- Living docs last. Patch existing systems/frontend/project-structure pages for shipped names only.
- `player.ts` is edited in stage 01 (fail / volume / skip predicate) and stage 03 (catalog import only). Stage 03 does not reopen `failCurrentLoad`. `PlaylistView.vue` is edited in stage 01 (`rowUnavailable`) and stage 06 (saved-playlist type).

## Design

The last nuclear plan added `PlayIntent`, `BrowseSource`, `become`, `PHASES`, `queueRuntime.ts`, and a one-way exclusive import graph. Those names are real. The machines they were supposed to delete are still in the hosts: `failNotice` sits next to `failCurrentLoad`, radio chrome still runs the face ladder, abort maps never left `queue.ts`, job phases still copy `set_state` + `_progress` through an untyped `ctx`, and exclusive `COMMANDS` is a lazy class dict with `_still_live` copied four times.

After this plan those leftover hosts are gone. A failed load is one function. Volume has one writer. Radio reconnect is not a second face machine. Finishing a download aborts through the runtime that pumps. A scan phase begins in one place. Companion commands are a table.

Do not split `player.ts` into five files. Do not merge `LibraryView` and `LibraryTreePane`. Do not split `transcode/worker.py` or `exclusive/coreaudio.py`.

## Stage map

1. **Player fail + volume** first — highest-impact leftover in `player.ts`. Independent of radio extract. Introduces the shared offline-unplayable helper the queue pane will keep using.
2. **Radio runtime face** — independent of 01. Needs the volume decision already settled so the store does not grow a second apply path. Deletes the host-bag extras (`currentLoadKeys`, reconnect ladder).
3. **Queue runtime abort** — independent of radio. Touches `player.ts` only to import `markTrackBroken` directly. After 01 so fail/volume is not reopened.
4. **Job PhaseCtx** — independent backend. No frontend coupling.
5. **Exclusive commands** — independent of playback/radio. After 01 so exclusive fail policy is already one function and this stage does not touch `player.ts`.
6. **Browse husks** — independent of 02–05. After 01 so `PlaylistView` only gains the saved-playlist mapper here.
7. **Backend husks** — independent of frontend. After 04 so runner edits are done before provider/serialize cleanup.
8. **Living docs** last so conventions, playback, radio, downloads, exclusive-audio, library-scan, and project-structure describe shipped names.

## Out of scope

- Merging `LibraryView` + `LibraryTreePane`
- Chrome-as-data on `LibraryPage` / stripping BrowseSource booleans
- Generic `EntityListHost`
- Exclusive radio; radio implementing `PlaybackSink`
- Client listening to exclusive pref mutations (panel invert)
- Reopening exclusive device casing (`sample_rates` / `bit_depths`)
- Splitting `transcode/worker.py` or `exclusive/coreaudio.py`
- Moving sheet / lyrics / expanded off `playerState`
- `fromApiTrack` refusing snake at the HTTP boundary
- Deleting `downloadAutoPauseReason` (it is the used name over `autoPauseReason`)
- A second encoder, a radio stream route, or a new ADR
- Changing radio picker, tune-in codec rules, exclusive refuse-lossy/downloads, or `stream_intent` product cases

## Assumptions

- Node vitest still has no real HTMLAudio / companion / IndexedDB. Fail, volume, radio face, and queue-runtime tests stay mocked or are assertion-on-exports.
- `stores/radio.ts` importing `runtime.ts` while `runtime.ts` is injected `tuneIn` / `tuneOut` / `applySnapshot` does not create a cycle. Do not add `radio/state.ts` unless the cycle is real at typecheck.
- `setOutputVolume` already writes `player.volume`. A `watch(() => player.volume)` in `initAudioListeners` applies the HTML/companion sink without radio importing `player.ts`.
- Control UDS RPC method names do not change when `PhaseCtx` lands.
- Companion inbound wire still accepts `deviceId` or `device_id`. Outbound device caps stay snake.
- Startup still migrates to Alembic head; this plan adds no revision.
