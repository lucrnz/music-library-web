# Stage 02: Strict passthrough media

## Status
done

## Description

`passthrough_media` accepts only `mp3` and `aac`. Any other `source_codec` raises `ValueError`. The stream route maps that to HTTP 400. JS `sourceFileMedia` throws on the same set so download ext/mime cannot silently become `.bin`.

## Rationale

Unknown codec currently becomes `audio/mp4` on the server and `application/octet-stream` on the client. If the invariant is “lossy rows are mp3 or aac,” a guessed container is a lie.

## Invariants

- `passthrough_media("mp3")` → `("audio/mpeg", "mp3")`.
- `passthrough_media("aac")` → `("audio/mp4", "m4a")`. Case-insensitive; `None` and any other string raise.
- `plan_stream` is unchanged (tag vs `is_lossy` only).
- `codecExt` / `codecMediaType` still delegate to `sourceFileMedia` when `codec === SOURCE_TAG`. No new record type.
- Existing happy-path stream/download of mp3/aac is unchanged.

## Risks

- `passthrough_media` is called *after* the `plan_stream` try/except in `media.py`. A bare raise becomes a 500 unless this stage wraps it.
- A catalog row with `codec === "source"` and a missing `sourceCodec` will throw at download path build. Accept: those rows should not exist after 019.

## Implementation

### Files

- Change `src/musicweb/transcode/passthrough.py`
- Change `src/musicweb/routes/media.py`
- Change `src/musicweb/static/js/lossyKind.js`
- Change `tests/test_passthrough.py`
- Change `tests/test_diag_media.py` only if a passthrough success test needs a valid `source_codec` (it already uses a lossy track — confirm `source_codec` is `mp3` or `aac`)

### Steps

1. `passthrough_media`: after lowercasing, return the two known pairs; else `raise ValueError("lossy source_codec must be mp3 or aac")`.
2. In `stream`, put `passthrough_media(...)` inside the existing try that already maps `ValueError` → 400, **or** wrap that call the same way. Do not let it escape as 500.
3. `sourceFileMedia`: `mp3` / `aac` unchanged; else `throw new Error("lossy sourceCodec must be mp3 or aac")`. Delete the `{ ext: "bin", ... }` return.
4. Tests: keep the two happy assertions; add `pytest.raises(ValueError)` for `None`, `""`, `"flac"`, `"src"`.

### Verify

- `uv run --group dev pytest tests/test_passthrough.py tests/test_diag_media.py`
- `rg "application/octet-stream|\"bin\"" src/musicweb/static/js/lossyKind.js` — no matches.
- `rg "return \"audio/mp4\", \"m4a\"" src/musicweb/transcode/passthrough.py` — only on the `aac` branch.

## Acceptance

- [ ] Unknown source codec cannot be served as m4a or stored as `.bin`.
- [ ] Stream maps that failure to 400.
- [ ] mp3/aac passthrough bytes and headers unchanged.
