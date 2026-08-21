**Archive.** Decisions in this file were current as of 2026-08-21 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Delete session, browse, and path-jail twins

## Goal

Delete the three highest-impact copies the nuclear review named, without changing product behavior: one on-demand teardown, one library browse host, one `Library.present_audio`. Artists stay snake_case. No file peels, no type campaign, no catalog split.

## Settled decisions

- **Scope is deletes only.** In: teardown, `useEntityMenu` on all three menu surfaces, one `LibraryView` (delete `DownloadsLibraryView`), cover-getter contract, `Library.present_audio`, living docs. Out: catalog split, `CatalogTrackRecord` / `asTrack` / `normalizeTrack`, `fromApiArtist`, player/radio peels, `RADIO_EXCLUSIVE_SNAP`, Settings stream restart, job `_begin` / phase table, `EXCLUSIVE_*` import into `coreaudio.py`, Transcoder / `RadioStation` / `routes/media.py` splits, husk deletions, exclusive radio, `playSource: "radio"`, merging radio audio into `htmlAudioSink`.
- **Do not change the product.** Same routes, chrome visibility, photo-menu rules, tree, empty copy, and online cover URLs. Architecture only — except the two existing defects this plan exists to remove (exclusive keeps playing after an unavailable intent; downloads list hits `/api/cover` when local art is missing).
- **Teardown:** `beginLoad` always stops the HTML sink, bumps generation, and clears play-source state. Companion stops only when the new intent is `unavailable` or the sink changes. Exclusive track-to-track stays `selectSink` no-op + `load`. Unavailable and radio tune-in revoke `localPlayUrl`. Delete the idle exclusive branch in `onError` (`playSource === "none"` + `isExclusiveEnabled()`). `stopOnDemandSinks` is the full leave-on-demand teardown (both sinks + blob).
- **Browse host:** `App.vue` mounts one `LibraryView`. Downloads stays `meta.mode === "downloads"` with today’s routes. `loadDownloadsView` returns `LibraryPage`. A `BrowseSource` (`online` | `downloads`) owns load, chrome flags, navigation, covers, and menu `run`s so `LibraryView` does not absorb `DownloadsLibraryView`. `ArtistListItem` stays snake_case (`album_count`, `track_count`).
- **`useEntityMenu`:** Extract the open/key/context/header-menu block. Switch library list, downloads list (then the surviving host), and `LibraryTreePane`. Menu builders stay. Do not collapse tree sources or change `asTrack` / `dl-*` kinds.
- **Cover contract:** Omitted or `null` `coverSrc` keeps the row’s remote fallback (online albums/tracks unchanged). `""` means placeholder — downloads must not invent `/api/cover` or `/api/artist-image`.
- **`present_audio`:** `Library.present_audio(rel: str | None) -> Path | None`. Empty rel, jail escape, `OSError`, not a file, or not `is_audio` → `None`. `is_audio` follows `Library.index_lossy`. Stream maps `None` to 404. Radio, enqueue, lyrics, covers, local artist-image folder, and cover lazy-fill use it. Catch `PathEscapeError` and `OSError` inside `present_audio`, not `Exception` at call sites.

## Design

Today three twins survive last plan’s decision-layer work.

**Teardown.** `playIndex` → `beginLoad` stops HTML only. `intentForTrack` can await the exclusive device gate while companion keeps the previous track. An `exclusive_lossy` / gate-fail intent then returns from `loadIntent` without `selectSink` / `stop`. That is why `onError` special-cases idle exclusive. Radio `stopOnDemandSinks` is a second, partial stop (no blob revoke). One pair of helpers: stop HTML (every new load), stop companion (unavailable or sink change, and whenever we leave on-demand). Exclusive same-sink loads do not release the hog.

**Browse.** `LibraryView` and `DownloadsLibraryView` are the same machine (chrome, `renderSeq`, tree-vs-list, hierarchical Back, `useBrowseLayout`, entity menu, `LibraryChrome` + `EntityListHost` + `LibraryTreePane`). `App.vue` swaps SFCs for a mode. `loadDownloadsView` already has the page; it returns a parallel DTO the view remaps into `LibraryBody`. `loaders.ts` already returns `LibraryPage`. After this plan the downloads loader returns `LibraryPage`, a `BrowseSource` supplies the mode-specific pieces, and `DownloadsLibraryView.vue` is gone. `LibraryView` must shrink or stay near today’s size — merging by dumping downloads branches into the SFC fails the file-size bar.

**Path jail.** `Library.resolve` is the jail. Presence + audio-ness is re-decided in `_resolve_track_file`, enqueue, `RadioStation._resolve_path`, radio catalog, `scan/lyrics._resolve_audio_path`, plus covers / local artist images / cover GET. One `present_audio` returns `None`; routes map that to 404; everyone else branches on `None`.

## Stage map

1. **Teardown** — independent, highest user-visible defect. No browse or Library API dependency.
2. **`present_audio`** — independent backend. Unrelated to the Vue host. Lands before the larger frontend merge so the two deletes do not share a ship.
3. **`useEntityMenu`** — prerequisite for the host merge. All three copies switch while both list SFCs still exist, so the extract is observable without a product-shaped App.vue change.
4. **Browse host + covers** — depends on 03 (menu is already a composable). Deletes `DownloadsLibraryView`, returns `LibraryPage` from the downloads loader, introduces `BrowseSource`, applies the cover contract.
5. **Living docs** — last, so conventions / playback / project-structure describe shipped names (`present_audio`, one `LibraryView`, teardown rules).

## Out of scope

- Splitting `catalog.ts`; using IDB `albumId` / `primaryArtistId` indexes; one hierarchy+art load
- Strict `CatalogTrackRecord`, deleting `normalizeTrack`, stopping `asTrack` on online tree tracks
- `fromApiArtist` / camel `Artist` / camel `ListenArtist`
- Peeling `onDemandLoad.ts`, `radio/socket.ts`, `radio/session.ts`
- Deleting `RADIO_EXCLUSIVE_SNAP`; rewriting the status line as sink ⊕ source
- Moving stream-codec restart out of `SettingsModal`
- Job-runner `_begin` / phase table; `EXCLUSIVE_*` import in `coreaudio.py`
- Splitting `Transcoder`, collapsing `RadioStation` catch-up/tick, splitting `routes/media.py`
- Deleting `ArtistImageStore`, `album_lossy_kind.py`, `client_payload_action`
- Exclusive radio; `playSource: "radio"`; sharing radio’s element with `htmlAudioSink`
- Tree source adapters; changing `dl-artist` / `dl-album` / `dl-track` kinds
- Volume-writer unification (`radio.setVolume`)

## Assumptions

- Radio-eligible rows and stream/enqueue tracks are already indexable; adding `is_audio` to those paths does not skip a file the product currently serves.
- Cover extract and local artist-image folder lookup only need an indexable audio file; `present_audio` then `.parent` is enough for the folder case.
- `test_diag_media.py` patches `_resolve_track_file`; that patch target moves when the helper dies.
- Node vitest still does not boot the real player sinks. Teardown is covered by a small pure helper (`needsCompanionStop` or equivalent) plus existing handoff tests, not a new HTMLAudio/mpv harness.
- `LibraryView` after the merge stays under ~1k because `BrowseSource` holds mode-specific load/nav/covers — not because we add a second list SFC back.
