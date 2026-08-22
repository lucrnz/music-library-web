# Stage 01: Server profiles and size estimates

## Status
done

## Description

Register `opus_96_48000` and `opus_64_48000` as browser-listed stream profiles, attach integer `approx_mb_per_hour` to every browser-listed profile, and expose that field on `GET /api/codecs`.

## Rationale

The server catalog is what Settings, radio tuners, and prepare already consume. Shipping tags and estimates together keeps `/api/codecs` the single source of truth before any UI work.

## Invariants

- Tag grammar stays `opus_{bitrate}_{rate}`. Labels are `Opus 96k 48kHz` and `Opus 64k 48kHz`.
- Encoder argv is still `-c:a libopus -b:a {bitrate_kbps}k -vbr on`. No worker, soxr, or dither change.
- `DEFAULT_PROFILE_TAG` remains `opus_192_48000`. Exclusive FLAC matrix stays 12 cells; `exclusive_formats_payload()` keys stay `{tag, sample_rate, bit_depth, label}`.
- `PROFILES` has 17 tags (5 Opus + 12 FLAC). `browser_profiles()` is those five Opus tags plus `flac_16_44100`, `flac_16_48000`, `flac_24_96000`, in that order.
- Every `browser_listed` profile has a non-`None` `approx_mb_per_hour`. Exclusive-only FLACs are `None` and are not serialized on `/api/codecs`.
- Integers match [context/design.md](context/design.md): 86, 72, 58, 43, 29, 380, 410, 1230.

## Risks

- Cached client catalogs without the new field show no hint until the next live `GET /api/codecs`. Do not bump the cache key in this stage.
- Mixed radio tuners at 64/96 kbps add more encode keys the same way 128/160 already do. No special-case.

## Implementation

### Files

- `src/musicweb/transcode/profiles.py`
- `src/musicweb/routes/media.py`
- `tests/test_profiles.py`

### Steps

1. In `src/musicweb/transcode/profiles.py`, add `approx_mb_per_hour: int | None = None` to `StreamProfile`. Set the eight browser-listed values from [context/design.md](context/design.md). Leave exclusive-only FLACs `None` in `_make_flac_profile`.
2. Insert `opus_96_48000` and `opus_64_48000` after `opus_128_48000` in `_build_profiles()`, same fields as the other Opus rows (`sample_rate=48000`, `bit_depth=16`, `extension="opus"`, `media_type="audio/ogg"`, `kind="opus"`, `can_play=_CAN_PLAY_OPUS`, `browser_listed=True`).
3. Add `browser_codecs_payload()` next to `exclusive_formats_payload()` that returns `{ "codecs": […], "default": DEFAULT_PROFILE_TAG }` with the existing codec keys plus `approx_mb_per_hour`. Each codec row is `id`, `label`, `kind`, `media_type`, `can_play`, `bitrate_kbps`, `bit_depth`, `sample_rate`, `approx_mb_per_hour`.
4. In `src/musicweb/routes/media.py`, make `GET /api/codecs` return `browser_codecs_payload()`.
5. In `tests/test_profiles.py`, assert `len(PROFILES) == 17`; `browser_profiles()` includes `opus_96_48000` and `opus_64_48000` and still excludes exclusive-only tags; every listed profile has `approx_mb_per_hour is not None`; `browser_codecs_payload()` rows match the table in [context/design.md](context/design.md); `exclusive_formats_payload()` is unchanged.

### Verify

```sh
uv run pytest tests/test_profiles.py tests/radio/test_protocol.py tests/test_passthrough.py
```

Confirm `GET /api/codecs` lists eight codecs, includes the two new tags, and every row has integer `approx_mb_per_hour`.

## Acceptance

- `get_profile("opus_96_48000")` and `get_profile("opus_64_48000")` succeed; both are `browser_listed`.
- `is_browser_listed_profile` is true for both new tags.
- `GET /api/codecs` (or `browser_codecs_payload()`) includes `approx_mb_per_hour` with the eight settled integers and does not include exclusive-only FLAC tags.
- Existing Opus 192/160/128 encode args and the exclusive 12-cell matrix are unchanged.
- `uv run pytest tests/test_profiles.py` passes.
