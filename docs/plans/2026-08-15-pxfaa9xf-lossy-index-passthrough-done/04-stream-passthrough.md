# Stage 04: Stream original bytes

## Status
done

## Description

Serve lossy tracks as the file on disk via `codec=source`. Reject profile tags on lossy tracks and `source` on lossless tracks. Prepare skips lossy ids. The ffmpeg worker never sees a lossy path.

## Rationale

Once the index can hold MP3/AAC, the current stream handler would re-encode them into Opus/FLAC. That is the product failure this plan exists to prevent. Passthrough has to land before any client play path.

## Invariants

- Lossless `GET /api/stream?id=&codec=opus_*|flac_*` is unchanged (same worker, soxr policy, cache).
- Lossy + `codec=source` → `FileResponse` of `rel_path` with `audio/mpeg` (mp3) or `audio/mp4` (aac), `Accept-Ranges: bytes`.
- Lossy + any profile tag → `409` with a detail that says the track is a lossy source and must be requested as `source`.
- Lossless + `codec=source` → `409`.
- Unknown codec → still `400` (today’s `get_profile` error), including a typo of `source`.
- `source` is **not** added to `PROFILES` / `GET /api/codecs`.
- Prepare: missing/unreadable still `skipped`; lossy ids increment `skipped` and do not call `tc.prepare`.
- `_resolve_track_file` still requires `lib.is_audio` (now flag-aware from stage 03).

## Risks

- Adding `source` as a dummy `StreamProfile` would leak it into codec pickers. Keep it a reserved string outside `PROFILES`.
- Calling `warn_null_track_tech` + `ensure_stream` on lossy files would encode them. The fork must happen before the worker.
- Exclusive remux is out of scope; this stage does not add a FLAC encode of MP3 for the companion either.

## Implementation

### Files

- Change `src/musicweb/routes/media.py`
- Create `src/musicweb/transcode/passthrough.py` (pure plan: `passthrough` | `encode` | `conflict`, plus media type / extension)
- Create `tests/test_passthrough.py`
- Do **not** change `transcode/profiles.py` product catalog
- Do **not** change the JS player yet

### Steps

1. `SOURCE_TAG = "source"`. `plan_stream(is_lossy: bool, codec: str) -> Literal["passthrough", "encode"]` or raise a small `StreamConflict` with a public message.
2. `stream` handler: load track; resolve file; `plan_stream(track.is_lossy, codec)`; on passthrough return `FileResponse` of the original (filename keeps the real suffix); on encode keep today’s worker path; on conflict `HTTPException(409, detail=...)`.
3. `transcode_prepare`: if `payload.codec == SOURCE_TAG`, treat every id as `skipped` (prepare is encode-only). If codec is a profile and the track is lossy, `skipped`. Do not `get_profile("source")`.
4. Tests: lossless+opus → encode; lossless+source → conflict; lossy+source → passthrough; lossy+opus → conflict; lossy+source media type mp3 vs aac; unknown tag still invalid.

### Verify

- `uv run --group dev pytest tests/test_passthrough.py tests/test_profiles.py`
- With the flag on and a scanned MP3: `curl -I "/api/stream?id=<lossy>&codec=source"` is `200` and `audio/mpeg` (or `audio/mp4`). `curl -I "/api/stream?id=<lossy>&codec=opus_192_48000"` is `409`. A lossless track + `codec=source` is `409`. A lossless track + `opus_192_48000` still `200`.
- `POST /api/transcode/prepare` with a lossy id and a profile tag returns `skipped >= 1` and does not create a cache file.

## Acceptance

- [ ] Lossy audio is reachable only as `codec=source` and is the original file (Range works).
- [ ] Profile tags cannot encode a lossy track. `source` cannot be used on lossless.
- [ ] `/api/codecs` is unchanged.
- [ ] Prepare never queues ffmpeg for a lossy id.
- [ ] Client still does not request `source` (stage 05).
