# Stage 01: Format gate and env flag

## Status
done

## Description

Add `MUSICWEB_INDEX_LOSSY` (default off) and rewrite `formats.py` so lossless, lossy, and indexable are three explicit predicates. Do not change the scanner walk, `Library.is_audio`, or folder browse yet.

## Rationale

Eligibility and the operator switch have to be testable before a scan can ingest an MP3. Keeping walk/browse lossless-only in this stage means turning the flag on cannot surprise an existing library.

## Invariants

- `is_lossless_audio` still means packed FLAC or ALAC-in-MP4 only. WAV/AIFF stay out.
- `.m4a` / `.mp4` without an ALAC probe still fail `is_lossless_audio`.
- `is_indexable_audio(path, index_lossy=False)` equals `is_lossless_audio(path)`.
- Settings default `index_lossy` is `False`. Unknown env values must not silently become true.
- No Alembic revision. No scan, stream, or UI change.

## Risks

- Reusing `.m4a` for both ALAC and AAC makes a sloppy probe index AAC as lossless or reject AAC as lossy. AAC detection must be the inverse of the existing ALAC probe, not “has an audio track.”
- Wiring `Library.is_audio` in this stage would list MP3s in folder browse that the index still ignores. Leave browse/walk for stage 03.

## Implementation

### Files

- Change `src/musicweb/scan/formats.py`
- Change `src/musicweb/config.py`
- Change `.env.example`
- Create `tests/test_formats.py`
- Do **not** change `src/musicweb/scan/walk.py`, `src/musicweb/library.py`, or `src/musicweb/jobs/runner.py`

### Steps

1. `Settings.index_lossy: bool = False` with env name `MUSICWEB_INDEX_LOSSY`. Document in `.env.example` as default-off; flipping it does nothing until stage 03.
2. In `formats.py`:
   - Keep `CANDIDATE_EXTENSIONS` for lossless (`.flac`, `.m4a`, `.mp4`, `.alac`).
   - Add `LOSSY_EXTENSIONS = {".mp3", ".m4a", ".mp4"}`.
   - Add `is_lossy_audio(path)`: `.mp3` is lossy; `.m4a`/`.mp4` is lossy when it is not ALAC (reuse `_is_alac`). `.alac` is never lossy.
   - Add `is_indexable_audio(path, *, index_lossy: bool)`: lossless always; lossy only when `index_lossy` is true. A file must not be both lossless and lossy.
3. Normalize nothing here — no bitrate, no `source_codec` changes (stage 02).
4. Tests: lossless FLAC/ALAC still true; AAC-in-m4a is not lossless and is lossy; `.mp3` is lossy; `index_lossy=False` rejects both; `index_lossy=True` accepts both; a path cannot satisfy both `is_lossless_audio` and `is_lossy_audio`. Use tiny temp files only where the probe needs a container; mock `_is_alac` when a real ALAC/AAC fixture is not available.

### Verify

- `uv run --group dev pytest tests/test_formats.py tests/test_smoke.py`
- `uv run musicweb doctor` (or a one-liner that loads `Settings`) — `index_lossy` is false unless the env is set.

## Acceptance

- [ ] `MUSICWEB_INDEX_LOSSY` exists, defaults false, and is documented in `.env.example`.
- [ ] `is_lossless_audio` / `is_lossy_audio` / `is_indexable_audio` are the only eligibility API; AAC is never lossless; ALAC is never lossy.
- [ ] With the flag off, `is_indexable_audio` matches today’s lossless set.
- [ ] Scanner walk and folder browse still ignore MP3/AAC.
