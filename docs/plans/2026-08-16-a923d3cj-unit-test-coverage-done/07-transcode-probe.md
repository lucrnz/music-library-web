# Stage 07: Transcode probe

## Status
done

## Description

Unit-test `transcode.probe` with mocked mutagen and ffprobe. Do not add media/handler tests.

## Rationale

Probe fills encode planning when DB tech is missing; a wrong parse would change dither/resample. Missing-track 404 is already `test_stream_missing_track_writes_reject`. Exclusive-only tags are already `test_browser_codecs_exclude_exclusive_only_tags`. `routes.media.codecs` only lists `browser_profiles()`.

## Invariants

- `probe_source_audio_tech` never invokes a real `ffprobe` binary in tests (`subprocess.run` patched).
- When `known` already has rate and bit depth, probe returns it without opening the file.
- Do not call `create_app`. Do not add `tests/routes/test_media_policy.py`. Do not extract `http_helpers.py`.

## Risks

- ffprobe stdout parse is line-oriented (`key=value`). The test should feed that exact shape, not JSON.
- `read_metadata` is imported inside `probe_source_audio_tech`; patch `musicweb.metadata.read_metadata`.

## Implementation

### Files

- Create: `tests/transcode/test_probe.py`

### Steps

1. **tech_from_track:** object with `sample_rate_hz` / `bit_depth` / `channels` / `source_codec` maps into `SourceAudioTech`.
2. **probe complete known:** `known=SourceAudioTech(44100, 16)` → same values, `read_metadata` not called (patch and assert).
3. **probe mutagen fill:** patch `musicweb.metadata.read_metadata` to return rate/bits; incomplete `known` is filled; `subprocess.run` not called.
4. **probe ffprobe fallback:** mutagen raises; `subprocess.run` returns stdout `sample_rate=48000\nbits_per_raw_sample=24\nchannels=2\ncodec_name=flac\n`; result matches. Bits prefer `bits_per_raw_sample` over `bits_per_sample`.

### Verify

```sh
uv run --group dev pytest tests/transcode/test_probe.py tests/test_profiles.py tests/test_diag_media.py
uv run --group dev pytest
```

## Acceptance

- [ ] Probe short-circuits on complete `known`, fills from mocked metadata, parses mocked ffprobe, never runs a real binary.
- [ ] No new media/handler test file.
- [ ] Existing profiles and media diag tests still pass.
