# Stage 03: Shared MP4 kind + LOSSY_EXTENSIONS

## Status
done

## Description

Put ALAC-vs-AAC in one function on mutagen `info`. Use `LOSSY_EXTENSIONS` in `is_lossy_audio`. Do not add a path-level classifier that re-opens files during walk.

## Rationale

`formats._is_alac` and `metadata._audio_tech_from_info` both sniff `codec` / `codec_description`. A `classify_source(path)` used by both would double mutagen I/O on scan. `_mp4_kind(info)` deletes the copy without a second open.

## Invariants

- Walk / `is_lossless_audio` / `is_lossy_audio` still one `_is_alac(path)` open for `.m4a`/`.mp4`.
- `_is_alac(path)` is `mp4_kind(info) == "alac"` after a successful MP4 open; open failure → not ALAC (same as today).
- `.mp3` → `source_codec = "mp3"`. Non-ALAC `.m4a`/`.mp4` → `"aac"`. `.alac` / ALAC info → `"alac"`.
- `is_lossy_audio` uses `LOSSY_EXTENSIONS` (plus the existing ALAC exclusion).
- Bitrate kbps policy unchanged (bits/s ÷ 1000, ignore ≤ 0).

## Risks

- Feeding `classify_source(path)` from `is_lossy_audio` would parse every MP3/M4A twice (walk + metadata). Do not.
- Changing `_is_alac` false-on-open-failure would start indexing corrupt M4As as AAC. Keep today’s false.

## Implementation

### Files

- Change `src/musicweb/scan/formats.py`
- Change `src/musicweb/metadata.py`
- Change `tests/test_formats.py`

### Steps

1. Add `mp4_kind(info) -> Literal["alac", "aac"] | None` in `formats.py` (public so tests import it; not a path classifier). `info is None` → `None`. `codec == "alac"` or description contains `alac`/`lossless` → `"alac"`. Else → `"aac"`. Callers only pass MP4-family `info` (never FLAC).
2. `_is_alac(path)`: open MP4 as today; return `mp4_kind(audio.info) == "alac"`. Open failure still `False`.
3. `is_lossy_audio`: `ext not in LOSSY_EXTENSIONS` → `False`. `.mp3` → `True`. `.m4a`/`.mp4` → `not _is_alac(path)`.
4. `metadata._audio_tech_from_info`: for `.m4a`/`.mp4`/`.alac`, `source_codec = mp4_kind(info)` or `"alac"` when the extension is `.alac` and kind is `None`. Delete the local `codec`/`desc` ALAC scan.
5. Tests: existing ALAC/AAC/MP3 cases still pass; add `mp4_kind` cases with stub `info` objects (`codec="alac"`, description-only lossless, AAC-ish codec, `None`).

### Verify

- `uv run --group dev pytest tests/test_formats.py tests/test_passthrough.py`
- `rg "codec_description" src/musicweb/metadata.py` — no matches.
- `rg "LOSSY_EXTENSIONS" src/musicweb/scan/formats.py` — used by `is_lossy_audio`.

## Acceptance

- [x] One ALAC/AAC decision function on MP4 `info` (`mp4_kind`).
- [x] Walk does not gain a second mutagen open.
- [x] `LOSSY_EXTENSIONS` is not dead.
- [x] Source codec strings for mp3/alac/aac unchanged.
