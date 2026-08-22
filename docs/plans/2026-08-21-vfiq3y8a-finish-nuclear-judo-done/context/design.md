**Archive.** Decisions in this file were current as of 2026-08-21 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Finish the nuclear-review judo

## Goal

Delete the leftover host forks the last nuclear extracts parked. After this plan: one play-delivery type, one radio runtime module, one downloads snapshot, one queue runtime, one job phase loop, and a one-way exclusive import graph. Behavior-preserving only.

## Settled decisions

- This plan **implements** the full nuclear-review package. It is not a research plan.
- Structure only. Same play, browse, radio, scan, download, and exclusive behavior. Unused production APIs (`exitToQueue`, `normalizeTrack`, `setHealthContext`) and dead CSS may be deleted; tests update. No new user-facing behavior. No new ADR.
- Browse: `BrowseSource` owns chrome titles, album-download action, empty-tree copy, focus-path, and tree reload keys. One `loadDownloadsCatalogView()` snapshot (`hierarchy` + `artUrls` + pre-primed `roots`). Keep today’s BrowseSource booleans. Do **not** merge `LibraryView` and `LibraryTreePane`. Do **not** move chrome onto `LibraryPage`.
- Play decision: `resolvePlaySource` returns delivery only (`source` / `url` / `profile` / `block`). No `sink`. `resolvePlayIntent` is the only place that attaches `htmlAudio` | `companion`. No `playTypes.ts`. Drop `absoluteStream` (exclusive URLs are always absolute).
- Failures: `applyIntent` is the only play-source writer. `failCurrentLoad` loses `setUnavailable` and the toast/settings/stop flag bag. Exclusive prefix/settings derive from `reason.startsWith("exclusive")`.
- Playback session: extract socket / load-gen / media-session to `frontend/src/radio/runtime.ts`. Thin `stores/radio.ts` is the reactive face. One private HTML-element helper; radio does **not** use the on-demand `PlaybackSink`. Rename `onDemandControl.ts` → `playback/session.ts`. Settings only persists + `prepareTracks`. Player watches stream codec while `activeSession() === "queue"` and restarts. Radio watches while chrome is active and re-sends `tune_in`. Lyrics emit `seek-fraction`. `playlist.removeIndices` returns `{ removedCurrent, nextIndex }`; callers invoke player. Map `/api/codecs` to camelCase once in settings. Exclusive status rows run only when `session === "queue"`.
- Downloads runtime: new `queueRuntime.ts` owns `activeIds`, abort controllers, pump, and policy hooks. `queue.ts` stays IDB row CRUD. `worker.ts` is `executeDownloadJob` and uses `streamUrl`. `index.ts` stops recomputing `queueSummary`. `CatalogTrackRecord` is storage-only (no `id` / `track` / snake aliases). Queue snapshot is a `Track` (or `Pick<Track, …>`). Delete `TreeNode.downloadMeta`; manager leaf is `Track` + `{ codec, bytes, status }` on `data`.
- Types fold into owners. No dedicated type-purge stage. `fromApiTrack` still accepts snake at the HTTP/WS boundary only. Exclusive devices are `sample_rates` / `bit_depths` only (exclusive stage).
- Exclusive invert is its own stage: store = persisted prefs + snapshot setter; `companionClient` owns the socket; store does not import the client; Settings / `main.ts` call the client. Companion `session.py` gets `_with_live` + a `COMMANDS` dict.
- Job PHASES live in `jobs/runner.py`. No `jobs/kinds.py`. Control client keeps today’s RPC methods. One `iter_enrichment` in `scan/enrichment.py` for the lyrics/artist-image commit loop. Stage 01 also does backend husks: `radio/now_playing.py` → `routes/radio.py`, `SnapshotTrack.from_track`, CoverStore has/path aliases, metadata triple-blank, Phase-2 copy, finalize comment.
- Living docs last. Patch existing systems/frontend/project-structure pages for shipped names only.

## Design

The last four nuclear plans added `present_audio`, `stream_intent`, `PlayIntent`, `BrowseSource`, `become`, station `_step`, and a catalog write mutex. Those names are real. The forks they were supposed to delete are still in the hosts: `LibraryView` still switches on mode, `resolvePlaySource` still builds `PlayIntent`, `radio.ts` is still a second player, `jobs/runner.py` still copies phase sandwiches, and exclusive still hides a cycle behind `import()`.

After this plan those leftover machines are gone. HTML delivery is a delivery result. Radio chrome is a face over `radio/runtime.ts`. Browse hosts ask the source for tree extras. Finishing a download is one runtime. A scan job is a phase table. Exclusive prefs do not import the socket.

`player.ts` is edited in stage 02 (load/fail) and stage 04 (import path + codec watch only). Stage 04 does not reopen `failCurrentLoad` or `intentForTrack`. `downloadsSource.ts` is edited in stage 03 (snapshot) and stage 05 (`downloadMeta` delete).

## Stage map

1. **Leftover husks** first so later stages do not import `normalizeTrack`, `setHealthContext`, `radio.now_playing`, or CoverStore aliases, and so serialize lives on the route.
2. **PlayIntent contract** next — highest-impact independent frontend delete. Does not need radio extract or browse.
3. **BrowseSource finish** — independent of playback. Snapshot must exist before the downloads runtime stage consumes tree leaves.
4. **Playback session** — depends on 02 so the load path is already one function. Radio extract, session rename, settings watch, lyrics emit, playlist return value, codec camel, status helper.
5. **Downloads runtime** — depends on 03 so list/tree/manager already share one snapshot. Collapses the queue triangle and storage-only catalog records.
6. **Job PHASES** — independent backend. After husks so runner edits are the phase table, not also CoverStore types.
7. **Exclusive invert** — after 04 so `exclusiveAudio.ts` is not in the playback stage. Device casing and the companion command ladder land together.
8. **Living docs** last so conventions, playback, radio, downloads, library-scan, exclusive-audio, connectivity, and project-structure describe shipped names.

## Out of scope

- Merging `LibraryView` + `LibraryTreePane`
- Chrome-as-data on `LibraryPage` / stripping BrowseSource booleans
- Exclusive radio; radio using the on-demand `PlaybackSink`
- Splitting `transcode/worker.py` or `exclusive/coreaudio.py`
- Rewriting `EntityListHost` as a generic entity renderer
- Moving `playerState` sheet/lyrics/expanded into a now-playing UI store
- `fromApiTrack` refusing snake at the HTTP boundary
- A second encoder, a radio stream route, or a new ADR
- Changing radio picker, tune-in codec rules, exclusive refuse-lossy/downloads, or `stream_intent` product cases

## Assumptions

- Node vitest still has no real HTMLAudio / companion / IndexedDB. Play-intent, resolve, browse, session, and queue-runtime tests stay mocked. Catalog and snapshot tests cover pure projection, not a real OPFS.
- `import type` of a delivery result from `resolve.ts` into `playIntent.ts` typechecks. If a name is needed, it lives in `resolve.ts` — still no third types file.
- Renaming `onDemandControl.ts` → `playback/session.ts` is a move; existing handoff tests update the import.
- `WebpAssetStore.has` / `get_path` / `delete` remain the disk verbs CoverStore extract already wraps.
- Control UDS RPC method names do not change when the runner gains a PHASES table.
- Companion wire still accepts `deviceId` or `device_id` on the way in; the client type is `sample_rates` only.
- Startup still migrates to Alembic head; this plan adds no revision.
