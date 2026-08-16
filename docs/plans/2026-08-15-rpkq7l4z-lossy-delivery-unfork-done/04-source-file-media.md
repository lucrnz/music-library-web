# Stage 04: sourceFileMedia helper

## Status
done

## Description

One JS table for lossy original ext + MIME. `codecExt` / `codecMediaType` keep their two-arg signatures and call it when `codec === "source"`.

## Rationale

`passthrough_media` on the server and the two catalog helpers repeat mp3/aac → container. Call-site churn for a record type is not worth it; a single helper behind the existing functions is.

## Invariants

- `codecExt(codec, sourceCodec)` and `codecMediaType(codec, sourceCodec)` signatures unchanged.
- `source` + `mp3` → `.mp3` / `audio/mpeg`.
- `source` + `aac` → `.m4a` / `audio/mp4`.
- `source` + unknown → `.bin` / `application/octet-stream`.
- Non-`source` codecs unchanged (flac prefix → flac; else opus).
- No new download call-site argument shape.

## Risks

- A second table in `catalog.js` would recreate the copy this stage deletes. Catalog only imports `sourceFileMedia` / `SOURCE_TAG`.

## Implementation

### Files

- Change `src/musicweb/static/js/lossyKind.js`
- Change `src/musicweb/static/js/downloads/catalog.js`

### Steps

1. Add `sourceFileMedia(sourceCodec) -> { ext: string, mediaType: string }` in `lossyKind.js` with the three rows above.
2. In `catalog.js`, import `SOURCE_TAG` and `sourceFileMedia`. `codecExt` / `codecMediaType`: if `codec === SOURCE_TAG`, return `sourceFileMedia(sourceCodec).ext` / `.mediaType`.
3. Do not touch queue/worker/queuePolicy call sites.

### Verify

- `rg "audio/mpeg"|audio/mp4 src/musicweb/static/js/downloads/catalog.js` — no remaining source-file literals.
- `uv run --group dev pytest`

## Acceptance

- [x] One JS table for source-file ext/MIME.
- [x] Existing `codecExt(codec, sourceCodec)` callers compile unchanged.
- [x] Unknown source kind still `.bin` / `application/octet-stream`.
