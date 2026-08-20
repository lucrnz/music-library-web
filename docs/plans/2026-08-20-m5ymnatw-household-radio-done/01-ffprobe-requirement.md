# Stage 01: ffprobe requirement

## Status
done

## Description

Treat `ffprobe` as a hard process dependency next to ffmpeg. Startup and `musicweb doctor` fail if `ffprobe` is missing or does not run. Do not implement picking or radio yet.

## Rationale

Radio’s pick-time validity check is a product requirement. Today ffprobe is only an optional mutagen fallback in `transcode/probe.py`. If doctor still passes without it, later stages cannot claim the tool is required.

## Invariants

- ffmpeg + libsoxr + libopus + flac checks stay fatal and unchanged.
- `probe_source_audio_tech` still uses mutagen first and ffprobe as fallback; this stage does not change probe policy.
- Tests still must not spawn a real ffprobe (`docs/development/testing.md`).

## Risks

- A PATH that has ffmpeg but not ffprobe (unusual, custom builds) will start failing doctor/serve. That is intended.

## Implementation

### Files

- `src/musicweb/transcode/deps.py`
- `tests/transcode/test_deps.py` (create if missing; otherwise extend)

### Steps

1. In `check_dependencies`, after `_require_tool("ffmpeg", ...)`, call `_require_tool("ffprobe", ["-version"], hint="Install ffmpeg (includes ffprobe) with libsoxr, libopus, and flac.")`.
2. Put the first version line on `DependencyReport.tools` as `"ffprobe"`.
3. Add unit tests that patch `subprocess.run`: missing ffprobe raises `RuntimeError`; a successful version line appears in `report.tools`. Keep ffmpeg/libsoxr/encoder mocks as needed so the test never touches the real binaries.

### Verify

- `uv run --group dev pytest tests/transcode/test_deps.py`
- Confirm `check_dependencies` docstring lists ffprobe.

## Acceptance

- `check_dependencies()` raises if ffprobe is not on PATH or exits non-zero.
- A successful report includes an ffprobe version string.
- Existing ffmpeg encoder / libsoxr failures still raise.
- No radio package, routes, or docs pages in this stage (living docs are stage 08).
