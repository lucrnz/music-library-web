# Stage 06: Download the original lossy file

## Status
pending

## Description

Offline downloads of lossy tracks fetch `codec=source` and store the original bytes. Catalog records keep `isLossy`, `sourceCodec`, and `bitrateKbps`. Download quality prefs apply only to lossless tracks.

## Rationale

A downloaded Opus encode of an MP3 would be a second generation of loss and would lie about what “downloaded quality” means. Passthrough downloads keep the offline catalog identical to the file on disk.

## Invariants

- Lossless enqueue / OPFS layout / Wi‑Fi-only policy unchanged.
- Lossy enqueue always uses codec `source`, ignoring `settings.download`.
- Worker `GET`s the same `/api/stream?id=&codec=source` as play.
- Catalog `codec` field for these rows is `source`. `codecExt` / `codecMediaType` map via `sourceCodec` (`mp3` → `.mp3` / `audio/mpeg`; `aac` → `.m4a` / `audio/mp4`).
- `fromCatalogRecord` restores `isLossy`, `sourceCodec`, `bitrateKbps` so offline browse and status work without the server.
- `prefer_better` / `prefer_offline` / `prefer_stream`: a ready `source` download is the same quality as a `source` stream. Do not rank `source` as 0 against Opus and discard the local file.
- Offline + missing/unplayable original → existing unavailable reasons (`missing`, `broken`, `codec_unsupported`). No transcode-on-download.

## Risks

- `codecExt("source")` without the track’s `sourceCodec` will write the wrong suffix. Persist `sourceCodec` on the queue item or catalog record before the worker runs.
- Re-downloading a track that was already stored under an Opus tag must not collide. Key remains `trackId|codec`; lossy keys are `id|source` only.
- Album download actions that pass `settings.download` into `enqueueMany` will encode lossy tracks unless the enqueue core overrides per track.

## Implementation

### Files

- Change `src/musicweb/static/js/downloads/queue.js`
- Change `src/musicweb/static/js/downloads/catalog.js`
- Change `src/musicweb/static/js/downloads/worker.js` (only if URL/ext is chosen there rather than in catalog)
- Change `src/musicweb/static/js/downloads/resolve.js`
- Change `src/musicweb/static/js/downloads/ui.js` if user download passes a single codec into a mixed selection
- Change `src/musicweb/static/js/models/track.js` if `fromCatalogRecord` still drops the new fields
- Change `src/musicweb/static/js/qualityRank.js` only if needed so `source` vs `source` is equal and `localAtLeastAsGood` does not treat `source` as worse than Opus when the **track** is lossy. Prefer a resolve-level branch (`if (track.isLossy) local wins when rec.codec === "source"`) over teaching the ranker that `source` beats FLAC.

### Steps

1. `enqueueTrackCore`: if `normalizeTrack(track).isLossy`, force `codec = "source"` and copy `sourceCodec` / `bitrateKbps` onto the queue item / catalog stub.
2. `codecExt` / `codecMediaType`: handle `source` via the stored `sourceCodec`. Unknown sourceCodec defaults to `.bin` / `application/octet-stream` only as a last resort — should not happen for mp3/aac.
3. `commitTrackDownload` writes `isLossy: true`, `sourceCodec`, `bitrateKbps`, `codec: "source"`.
4. `resolvePlaySource`: if `track.isLossy` and a ready `source` record exists, apply playback policy as “local equals stream.” Never compare `source` to the active Opus/FLAC tag for that track.
5. Mixed album “download all”: lossless items use `settings.download`; lossy items use `source` in the same batch.

### Verify

- `uv run musicweb`, downloads enabled, flag on:
  - Download a lossy track while download quality is FLAC 24/96. OPFS file is the original size/type (mp3/m4a), not FLAC. Network shows `codec=source`.
  - Play it online with `prefer_better` → `Downloaded · MP3 320` (or AAC).
  - Airplane mode / server stop → still plays from OPFS.
  - Download a lossless track in the same session → still uses the chosen download profile.
  - Album action on a mixed album: lossless encodes, lossy originals, no `409`.

## Acceptance

- [ ] Lossy downloads are original bytes keyed as `source`, never a stream profile encode.
- [ ] Offline catalog can project `isLossy` / format / bitrate without the server.
- [ ] Playback policy does not prefer a live Opus stream over a downloaded original of the same lossy track.
- [ ] Lossless download behavior is unchanged.
