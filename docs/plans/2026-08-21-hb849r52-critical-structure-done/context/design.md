**Archive.** Decisions in this file were current as of 2026-08-21 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Collapse play, stream, and catalog decision copies

## Goal

Stop the three P0 forks the nuclear review called out: exclusive vs HTML play is decided once, lossy/source is decided once on the server, and download catalog writes cannot lose refcounts or leave queue rows `ACTIVE`. Delete the dead aliases those forks left behind.

## Settled decisions

- In scope: husks, `downloads/media.ts`, `stream_intent`, catalog mutex + one finalize txn, `resolvePlayIntent`, session handoff. Living docs last.
- Out of scope: browse-host collapse, `fromApiArtist` / `TrackView` / strict catalog records, job-runner phase table, `Library.present_audio`, splitting `catalog.ts`, exclusive-radio, rewriting the status line as sink ⊕ source.
- `plan_stream` becomes a result-typed `stream_intent` in `passthrough.py`. No parallel module. No `plan_stream` alias. HTTP maps `reject` to 409/400. Enqueue and radio prepare skip when the kind is not `encode`.
- Radio tune-in codec stays a `browser_listed` profile, never `source`. Lossy radio still *plays* as `source` on the client.
- Exclusive still refuses downloads and lossy. Exclusive is an output (`sink: companion` + `source: streaming`), not a second play source.
- Catalog: module-level async mutex around commit and delete. `done` writes the catalog row, bumps refs, and deletes the queue row in one IDB transaction. Art network I/O runs after that txn. Delete is IDB first, OPFS unlink second. `catalog.ts` stays one file.
- File shape next to that: extract `codecExt` / `codecMediaType` to `downloads/media.ts`. Drop the unused `blobs` store (IDB v3). Do not split projection/art/records.
- Play intent lives in `frontend/src/playback/playIntent.ts` and calls existing `resolvePlaySource` for the HTML path. Do not fold exclusive into `downloads/`. Do not file-split `playHtml` / `playExclusive` as an intermediate.
- Prepare grouping (exclusive-by-tag and download-skip) moves to `frontend/src/playback/prepare.ts`. Playlist add-to-queue, settings codec change, and near-end prepare all call it. Settings keeps prefs only.
- Session handoff extends `onDemandControl.ts` with `claimOnDemand` / `claimRadio`. `player.ts` loses radio imports. Radio watches `player.volume` from `playerState.ts`. Status line stays exclusive-first (`RADIO_EXCLUSIVE_SNAP` stays).
- No new ADR. Ownership changes land in the existing systems/frontend docs in the last stage.

## Design

Today four independent axes are re-decided at every play/prepare call site: output (html vs companion), delivery (stream vs OPFS), profile tag, and station (radio vs on-demand). `playIndex` still forks `playExclusive` / `playHtml`. Prepare is cloned in `playlist.ts`, `player.ts`, and `settings.ts` with three different skip policies. That is what will push `player.ts` (875) through 1k on the next policy feature.

After this plan, `resolvePlayIntent(track, ctx)` returns sink + source + profile + url + block + prepare tag in one shot. Exclusive is encoded as companion + streaming (or `exclusive_lossy` / device-not-ready). HTML goes through `resolvePlaySource`. A broken local blob is a second `resolvePlayIntent({ localBroken: true })`, not a 40-line tail on `playHtml`. `playIndex` is: claim on-demand → beginLoad → apply intent → `sink.load(url)`.

On the server, lossy/source is the same rule in six places (`plan_stream` exceptions, enqueue skip, HTTP `SOURCE_TAG` short-circuit, forget skip, radio protocol, client `deliveryCodec`). `stream_intent(is_lossy, codec)` returns `passthrough | encode | reject`. Stream HTTP uses it. `enqueue_prepare` skips anything that is not `encode`, which also deletes the route’s `SOURCE_TAG` special case. Radio prepare already goes through enqueue. Tune-in still rejects `source` and non-browser tags.

Download commit is not atomic: two workers can both read `firstPin` before either writes, and `done` is commit-then-delete-queue. A thrown commit leaves `ACTIVE` with no pump pickup. A mutex serializes commit/delete. `firstPin` is computed inside the txn. Finalize is one txn over `tracks` / `albums` / `artists` / `queue`. Art fetches run after. Delete drops IDB (and projection) first, then unlinks OPFS.

Husks and `media.ts` come first so later catalog/player stages do not keep importing dead names or treating catalog as a codec façade.

## Stage map

1. **Delete husks** — no behavior change. Unblocks later imports (`scanner` alias, unused catalog APIs, `blobs` store).
2. **Extract `downloads/media.ts`** — depends on 01 only in that unused catalog exports are already gone. Queue/worker/policy stop importing catalog for filenames.
3. **`stream_intent`** — independent of the frontend stages. Server contract for stream/prepare/forget. Do this before play-intent so the client is not the only honest decision.
4. **Catalog writer** — depends on 02 so codec helpers are not still living in the file we are making the write mutex owner of.
5. **Play intent + unified prepare** — depends on nothing server-side, but sits after 03 so product rules (lossy/source, exclusive refuse) are already one server function. `player.ts` may still import radio.
6. **Session handoff** — depends on 05 so `playIndex` / `tuneIn` are the claim points, not two loaders plus volume fan-out.
7. **Living docs** — last so playback, transcoding, downloads, and frontend conventions describe shipped ownership.

## Out of scope

- Browse-host collapse (`useEntityMenu`, `BrowseSource`, merging `DownloadsLibraryView`)
- Type-boundary work (`fromApiArtist`, camel listen artists, strict `CatalogTrackRecord`, `TrackView` / `SnapshotTrack`)
- Job-runner phase table and double `ScanState` write
- `Library.present_audio` and the five path-jail wrappers
- Splitting `catalog.ts` into projection/art/records
- Exclusive radio
- Status-line rewrite (`RADIO_EXCLUSIVE_SNAP` stays)
- Renaming `playerSession.ts` to `playerCovers`
- Importing `EXCLUSIVE_*` into `coreaudio.py`
- A second encoder, a radio stream route, or an IDB blobs fallback
- Changing radio picker, tune-in codec rules, or exclusive refuse-lossy/downloads

## Assumptions

- Node vitest has no IndexedDB. Catalog-writer tests cover the pure pin/refCount helper and the “commit throw must not leave ACTIVE” control flow with mocks, not a real IDB.
- `onDemandControl.ts` can grow claim helpers without importing `radio.ts` or `player.ts` (same cycle break as today).
- Radio watching `player.volume` from `playerState.ts` does not create a cycle once `player.ts` stops importing `radio.ts`.
- Existing `resolvePlaySource` stays under `downloads/` and stays the HTML delivery owner.
- IDB v3 upgrade only deletes `blobs` if present; existing user catalogs on v2 keep tracks/queue/lyrics.
