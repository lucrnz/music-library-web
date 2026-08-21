**Archive.** Decisions in this file were current as of 2026-08-21 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Nuclear-review core deletes

## Goal

Finish the highest-impact nuclear-review deletes so the next feature has one play decision, one catalog writer module, one track JSON protocol, and no leftover checks beside the names the last extracts already added. Behavior-preserving only.

## Settled decisions

- This plan **implements** the core-delete package. It is not a research plan.
- In scope: one play decision; catalog split (three modules + barrel); radio `track_dict` Protocol; `preparedKeys` out of `api.ts`; artist-image HTTP out of `media.py`; parked leftovers (`is_file` after `present_audio`, dummy prepare `stream_intent(is_lossy=False)`, `ArtistImageStore` husk, coreaudio `ALLOWLIST_*`, `client_payload_action`, one `ScanMode`, `station._iso` → timeutil, SQL as album lossy-kind owner). Living docs last.
- `resolvePlaySource` returns `PlayIntent` with `sink: "htmlAudio"` on ready paths. Delete the `PlaySource` type. `resolvePlayIntent` keeps the exclusive prefix. Delete `exclusiveGate` and `ExclusiveGate`. `localBroken` stays an input; `loadResolved` still remints once after `markDownloadBroken`. `intentForTrack` I/O stays in `player.ts`. `failPlayback` / `showUnavailable` / `failLoad` / `hardStopCompanion` collapse to one `failCurrentLoad` whose side effects match today’s four call sites.
- `resolve.ts` must not value-import `playIntent.ts` (cycle). It uses `import type { PlayIntent }` and builds unavailable/ready objects locally. Do not add `playTypes.ts`.
- `track_dict` takes a Protocol that `Track` and `SnapshotTrack` both satisfy. `serialize` keeps calling `track_dict`. One field list. Radio still imports `routes.serializers` because serialize is the HTTP/WS adapter.
- Catalog split: add `downloads/projection.ts`, `downloads/art.ts`, `downloads/writer.ts`. `catalog.ts` becomes a re-export barrel. `withCatalogLock` lives in `writer.ts`. No art-key scheme migration (`a:` vs `artist:`).
- Album lossy-kind: the `UPDATE` in `finalize.recount_entities` is the owner. Delete `scan/lossy_kind.py`. Port remaining cases onto `tests/scan/test_finalize.py`. Delete `tests/test_album_lossy_kind.py`.
- Prepare HTTP tag check: `get_profile` for unknown tags → 400. `SOURCE_TAG` stays a valid request (200, enqueue skips all). Do not probe `stream_intent(is_lossy=False)`.
- `ArtistImageStore` dies. Bootstrap constructs `WebpAssetStore(data_dir / "covers" / "artists")`. Fetcher, deps, and jobs type against `WebpAssetStore` (`has` / `get_path` / `write_from_bytes`). Delete `artist_image.py`.
- `ScanMode` has one `Literal`, defined in `scan/batch.py` (jobs already imports batch). `jobs.runner` and `jobs/__init__` re-export it. No `jobs/kinds.py`.
- `station._iso` becomes `format_iso_utc` on `timeutil` (same body: timezone-aware ISO, keep microseconds). Do not replace persist stamps with `utc_now_iso` (that helper strips microseconds).
- Artist-image HTTP moves to `routes/artist_images.py` included from `api.py`. Paths stay `/api/artist-image`. Cover lazy-fill stays in `media.py`.
- `preparedKeys`, `requestPrepare`, and `requestForget` move to `playback/prepare.ts`. `api.ts` keeps `apiFetch` / `apiPost` only.

## Design

The last three plans added `present_audio`, `stream_intent`, `PlayIntent`, `BrowseSource`, `become`, station `_step`, and a catalog write mutex. Those names are real. The leftovers they parked are still in the tree: dummy lossless prepare, `is_file()` after `present_audio`, `PlaySource` beside `PlayIntent`, `catalog.ts` as three modules glued at comments, `track_dict(snapshot.track)` with `# type: ignore`, prepare bookkeeping in `api.ts`, and preferred-image CRUD in the media router.

After this plan those leftovers are gone. HTML delivery returns the same union exclusive already returns. Catalog callers keep importing `@/downloads/catalog` (barrel). Radio serialization is typed. Husks do not sit next to the new owners.

`failCurrentLoad` is not a policy object. It is one function so the next exclusive/offline failure does not add a fifth copy. Toast vs no-toast, title prefix, and Settings-open stay as they are today.

## Stage map

1. **Leftover checks and husks** first so later stages do not import `ArtistImageStore`, `ALLOWLIST_*`, `album_lossy_kind`, or `client_payload_action`, and so prepare/media are honest before the route split.
2. **Play decision** next — highest-impact independent frontend delete. Does not need the catalog barrel or prepare-keys move.
3. **Catalog split** — next frontend impact. Barrel keeps `@/downloads/catalog` stable for the play stage already landed.
4. **Radio track Protocol** — independent backend type leak. After husks so `now_playing` tests are not also absorbing leftover edits.
5. **Artist-image routes** — depends on husks so `deps.artist_image_store` is already `WebpAssetStore`.
6. **Prepare keys** — independent frontend layer fix. After play so `player.ts` is not in two stages at once.
7. **Living docs** last so conventions, playback, downloads, transcoding, library-scan, and project-structure describe shipped names.

## Out of scope

- Browse list/tree unification, stripping `BrowseSource` booleans, stats out of `LibraryView.load()`
- Exclusive client/store invert and the `import()` cycle
- Job-runner enrichment/`PHASES` table
- Status-line rewrite / deleting `RADIO_EXCLUSIVE_SNAP`
- Exclusive radio; merging radio HTML audio into `htmlAudioSink`
- Art-url key unification (`a:` vs `artist:`)
- `fromApiArtist` / camel `Artist` / snake-alias purge on `CatalogTrackRecord`
- Splitting `transcode/worker.py` or the Core Audio HAL
- New ADR

## Assumptions

- `import type { PlayIntent }` from `playIntent.ts` into `resolve.ts` typechecks (Vite/vue-tsc elide type imports). If it does not, build the HTML `PlayIntent` objects structurally in `resolve.ts` without importing the type — still no third types file.
- Node vitest still has no real HTMLAudio / IndexedDB. Play-intent and resolve tests stay mocked. Catalog split is a move; existing download unit tests keep importing the barrel.
- `GET /api/artist-image` and POST/DELETE paths and bodies do not change when the router module moves.
- `WebpAssetStore.has` / `get_path` / `write_from_bytes` are the `ArtistImageStore` methods under the old names `has_image` / `image_path` / `ensure_from_bytes`.
- `tests/scan/test_finalize.py` already covers mp3, mixed, and missing→None; the deleted Python tests add aac-only, unknown→lossy, and unknown+mp3→mixed onto that file.
- `format_iso_utc` matching today’s `_iso` does not change persisted radio timestamps.
