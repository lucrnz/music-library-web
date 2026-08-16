> **Archive.** Decisions in this file were current as of 2026-08-15 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Lossy delivery judo

## Goal

Clear the thermo-nuclear findings on the lossy playback story without changing the product: one walk classify, one client delivery tag, exclusive/prepare/download/status as consequences of that tag, album kind at the album boundary, honest source-media types.

## Settled decisions

- **Walk classify:** add `audio_kind(path) -> "lossless" | "lossy" | None`. `is_lossless_audio` / `is_lossy_audio` / `is_indexable_audio` and batch sibling-gating call it. One mutagen open per classify. Metadata still uses `mp4_kind(info)` on an already-open file — no path-level `classify_source` that re-opens for tags.
- **Unreadable MP4:** `_probe_mp4_kind` exception / missing info → `None`, not “therefore AAC”. Empty or corrupt `.m4a`/`.mp4` is not indexable. Opened non-ALAC MP4 stays AAC (inverted ALAC probe).
- **Dead branch:** delete `or ext == ".flac"`; `.flac` is already in `ALWAYS_LOSSLESS`.
- **`should_skip_lossy` meta:** type as `TrackMetadata`, not `Any`.
- **One delivery owner:** `deliveryCodec` is the only tag decision. `resolvePlaySource` trusts `ctx.activeStreamCodec` and does **not** re-test `isLossy`. Plan 021’s second one-liner is revoked. Callers that stream or enqueue must pass `deliveryCodec(...)`.
- **Prepare:** skip lossy / `source` **before** the exclusive early-return. `getExclusiveProfileTag(lossy)` returns `null`. Settings and exclusive prepare stop sending lossy ids at FLAC/Opus tags. Server `is_lossy` skip stays as the safety gate.
- **Exclusive refuse:** `playExclusive` maps `isLossy` → `exclusive_lossy`; null tag on lossless → `exclusive_no_format`. Do not invent an `exclusiveDelivery` record type.
- **`playHtml` fail reasons:** probe the **source family** when the delivery tag is `source` (`mp3`/`aac` only; empty or other → unsupported). `attemptPlay` failure is always `play_failed`. Delete the `isLossy ? codec_unsupported : play_failed` ternaries. Do not extract `playLoad.js`.
- **Album boundary:** add `fromApiAlbum` / `mapAlbums`. Leaf `kindForAlbum` reads `lossyKind` only (no `lossy_kind`). Fetch helpers normalize; loaders and tree sources do not parse snake_case.
- **Album kind union:** `mp3 | aac | mixed | lossy | null`. Reduce like `kindForTracks`: no lossy tracks → `null`; one distinct track-kind → that kind (`lossy` if the only kind is unknown codec); several → `mixed`. Finalize SQL is a cache of that reduction — a single unknown codec is `lossy`, not `mixed`.
- **Source media:** `passthrough_media` and `sourceFileMedia` accept only `mp3` and `aac`. Anything else raises (`ValueError` / thrown error). No `audio/mp4` default, no `.bin` fallback.
- **Living docs last:** playback, scan, transcoding, frontend conventions, and the packed-lossless technical decision get the durable invariants. This directory is not living documentation.

## Design

Lossy is a **delivery mode**, not a boolean sprinkled through load, prepare, exclusive, queue, and status.

**Server.** Eligibility is `audio_kind`. The walk predicate opens an MP4 once. Batch asks `audio_kind == "lossy"` for sibling skip (extension-only for `.mp3`; one probe for `.m4a`/`.mp4`). Unreadable containers drop out of the walk. Stream passthrough looks up mime/ext only for `mp3`/`aac`; unknown stored codec is 400, not a guessed m4a.

**Client tag.** `deliveryCodec(track, active)` is the input to resolve, `streamUrl`, enqueue, and HTML load. Resolve is one tree keyed on that tag. Catalog UI treats `SOURCE_TAG` as ready. Quality ranking is unchanged (`source` vs `source` still ties).

**Client consequences.** Prepare eligibility is “has id and is not lossy,” then exclusive vs download policy. Exclusive profile selection returns no tag for lossy, so exclusive prepare buckets are empty for those ids. HTML play probes decode only when the tag is `source`. Status/details already use `lossySourceParts` when `track.isLossy` — leave that; it is presentation of the source file, not a second tag decision.

**Album marks.** Tracks already normalize at `fromApiTrack`. Albums do the same. Kind helpers stay in `lossyKind.js`. SQL roll-up matches the JS reduce so offline `kindForTracks` and online `kindForAlbum` speak the same union.

## Stage map

1. **Classify once** — scan foundation. Unreadable-MP4 behavior and the double-open live here; nothing else should re-probe for eligibility.
2. **Strict passthrough media** — independent of the walk, but same server honesty. Stream route must map the new `ValueError` to 400 before the client relies on it.
3. **Album kind + boundary** — independent of 01–02. Normalize albums and align SQL before more client surfaces read `lossyKind`.
4. **Delivery-tag owner** — the client judo. Independent of 01–03. After this, prepare/exclusive/queue/resolve share one tag; `playHtml` still has the fail-reason special case.
5. **Play-load unfork** — depends on 04 (`getExclusiveProfileTag` null + `deliveryCodec` at the load seam). Deletes the remaining `isLossy` control flow in `playHtml` / near-end prepare.
6. **Living docs** — last so the pages describe what 01–05 actually shipped.

## Out of scope

- Extracting `player.js` play loaders into `playLoad.js`.
- Redrawing `i-fmt-lossy` or changing toast copy.
- Exclusive remux, data-saver transcode of lossy, or new source formats.
- A path-level `classify_source` shared with `metadata.py`.
- A `{ codec, sourceCodec }` record type on download call sites.
- Re-pointing a lossy track id onto a later FLAC.
- A JS test runner.

## Assumptions

- The thermo-nuclear review of plans 019/021 is the accepted issue list; this plan implements those remediations.
- Corrupt `.m4a` rows already indexed as AAC (probe-failure → lossy) may be marked missing on the next scan. Accept.
- `playHtml` is the only `resolvePlaySource` caller; enqueue is the only other place that must force `source`.
- No JS test runner: client stages verify with `rg`, inspection, and `uv run --group dev pytest`.
- `localAtLeastAsGood("source", "source")` remains true.
- Server prepare already skips `is_lossy`; client skip is correctness of the client, not a new server gate.
