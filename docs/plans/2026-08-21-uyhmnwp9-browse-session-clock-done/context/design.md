**Archive.** Decisions in this file were current as of 2026-08-21 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Delete leftover browse, session, and clock twins

## Goal

Finish the four nuclear-review deletes the last plans named and then parked: a real `BrowseSource` (hosts stop forking), downloads project to client types at the source (`dl-*` dies), one `loadResolved` loop with the exclusive gate in the companion sink, `become(session)` plus one volume writer and a radio load generation, an honest job begin plus `last_scan_finished_at`, and one station `_step`. Living docs last.

## Settled decisions

- This plan is the four deletes plus living docs. Catalog.ts split, radio DTO / `stream_intent` dummy-lossy, leftover `present_audio` `is_file()` checks, enrichment-driver merge, `fromApiArtist`, merging the two Vue hosts, exclusive radio, and a job `PHASES` table are out.
- Architecture plus the latent defects those stages naturally fix: radio overlapping `tuneIn` / `onFaceOrTrack` loads get a generation; regen no longer blanks the radio catalog watermark. No chrome or product-rule changes (exclusive refuse, browse visibility, picker, `stream_intent` cases).
- Browse is two stages: host first (`BrowseSource` object + `entityActionsFor(source)`), types second (project at the source; delete `dl-*` and `asTrack`). No downloads snapshot cache.
- Exclusive device gate (`ensurePreferredDevice`) moves into `companionSink.load`. `resolvePlayIntent` stays a pure decision. `loadResolved` lives in `player.ts` (no `onDemandLoad.ts`).
- Session stage rewrites `onDemandControl.ts` in place as `become("none" | "queue" | "radio")` — do not add `playback/session.ts`. One `setOutputVolume` on the face + storage. Delete `radio.setVolume`. Radio gets `radioGen`; only the station face advances audio. `preview` is `tabOpen && chrome === "inactive"`, not a stored chrome value.
- Radio catalog watermark is `scan_state.last_scan_finished_at` (Alembic 012), written only when a **scan** job reaches idle. `scan_finished_at()` reads that column and stops inspecting `kind`. Job `_begin` + the column are one stage; catch-up/tick → `_step` is the next.
- `needsCompanionStop` stays next to `PlayIntent`; `teardown.ts` dies in the session stage. No `claimOnDemand` alias after `become`.
- `_progress` becomes log-only. No phase table.
- Artists stay snake_case (`album_count`, `preferred_rev`). `RADIO_EXCLUSIVE_SNAP` stays.

## Design

Today the last extracts left the forks in the hosts. `onlineBrowse.ts` / `downloadsBrowse.ts` are identity wrappers. `LibraryView.vue` and `LibraryTreePane.vue` each rebuild `itemsFor` with `isDownloads`. Tree kinds are a second type world (`dl-artist` / `dl-album` / `dl-track`) that the pane maps back to `OpenMenu`. `loadIntent` re-implements apply / companion-stop / unavailable / attempt on the local-broken path. Exclusive I/O sits in `intentForTrack`, then `onError` re-decides exclusive with `isExclusiveEnabled()`. Session handoff is a `let fn` hook bag. Radio has no load generation and stores `preview` as a fifth chrome. `start()` and `_execute()` both write the running `ScanState` row; radio treats that multiplexed row as an index watermark (`kind != "scan"` → `None`). Catch-up and tick are the same clock written twice.

After this plan:

- `BrowseSource` is a typed object (load, navigate, covers, chrome flags, add-all, menu `run`s). `LibraryView` binds `source` from mode once. Both list and tree call `entityActionsFor(source)`.
- Downloads tree/list emit `artist` / `album` / `track` with `ArtistListItem` / `LibraryAlbum` / `Track` on `data`. Catalog extras the manager modal needs (`codec`, `bytes`, `status`, `trackNum`) live on an optional `downloadMeta` bag on the node — not a second kind. `asTrack` / `downloadsMenuMap` projectors die.
- `playIndex` is `become("queue")` → `loadResolved`. `loadResolved` remints and recurses on local-broken. `companionSink.load` runs the device gate and fails before hogging.
- `become(next)` tears down the other session. Volume writes go through `setOutputVolume` (face + `localStorage`); radio’s existing watch applies it to radio audio.
- Radio chrome is `inactive | stopped | tuning | tuned`. Opening `/radio` leaves chrome `inactive` and sets `tabOpen`. `loadCurrent` is generation-guarded and is not also called from `tuneIn` after `sendTuneIn` — the face handler is the only audio driver.
- One `_begin` writes the running job row. Finish of `kind == "scan"` also sets `last_scan_finished_at`. `_step(session, now) -> dirty` is catch-up (`while`) and tick (once).

## Stage map

1. **BrowseSource + entityActionsFor** — independent of player/jobs; highest frontend leverage. Tree may still map `dl-*` → `OpenMenu`.
2. **Project downloads types** — depends on 01 so both hosts already consume one `itemsFor`. Deletes `dl-*` / `asTrack`.
3. **loadResolved + companion gate** — independent of browse. Makes `player.ts` one loop before the session rewrite touches it.
4. **become + volume + radioGen** — depends on 03 so the load path is already one function. Handoff, volume, and radio session land together.
5. **Job `_begin` + `last_scan_finished_at`** — independent backend. Honest lifecycle + watermark before the clock collapse edits `station.py` again.
6. **Station `_step`** — depends on nothing from 05 except avoiding a `station.py` pile-up; clock delete after the watermark API is stable.
7. **Living docs** — last, so conventions / playback / radio / library-scan describe shipped names.

## Out of scope

- Splitting `catalog.ts`; `commitTrackDownload` delete; downloads snapshot cache; IDB index-backed album/artist delete
- `fromApiArtist` / camel `Artist` / camel `ListenArtist`; strict `CatalogTrackRecord` snake-alias purge
- Radio `SnapshotTrack` / `track_dict` protocol; HTTP prepare dummy `is_lossy=False`; leftover `present_audio` `.is_file()`
- Enrichment-driver merge; `album_lossy_kind` SQL owner; `ArtistImageStore` husk; `EXCLUSIVE_*` import into `coreaudio.py`
- Job `PHASES` table
- Merging `LibraryView` + `LibraryTreePane`; merging radio audio into `htmlAudioSink`; exclusive radio
- Status-line rewrite / deleting `RADIO_EXCLUSIVE_SNAP`
- Extracting `onDemandLoad.ts` or `playback/session.ts`

## Assumptions

- Node vitest still has no real HTMLAudio / companion / IndexedDB. Browse and session stages cover new objects with unit tests; load/gate use mocks. Radio `radioGen` is asserted in `radio.test.ts`.
- `DownloadsModal` can keep showing codec/bytes/status from `node.downloadMeta` after `data` becomes a `Track`. Delete actions use `data.id`.
- Existing radio tests that expect stored `preview` become `inactive` + `tabOpen`.
- `test_empty_then_scan_watermark_picks` must set `last_scan_finished_at` (today it only sets `kind` + `finished_at`).
- Startup still migrates to Alembic head; 012 is safe to add after `011_radio_station`.
- Backfill: existing `scan_state` row with `kind == "scan"` and a `finished_at` copies that timestamp into `last_scan_finished_at`.
