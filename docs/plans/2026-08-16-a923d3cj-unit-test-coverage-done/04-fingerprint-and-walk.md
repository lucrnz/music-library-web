# Stage 04: Fingerprint and walk

## Status
done

## Description

Unit-test content fingerprinting and indexable-file walk. No SQLite. No committed audio.

## Rationale

Stable track identity is a hard product rule. Walk is what the job runner feeds into batch. Both must be locked before identity/batch tests assume their contracts.

## Invariants

- FLAC uses STREAMINFO MD5 when mutagen returns a non-zero signature; otherwise SHA-256 of file bytes.
- Non-`.flac` always SHA-256.
- Walk never loads file contents; suffix / `is_indexable_audio` only.
- Do not call real ffmpeg. Do not commit binary fixtures.

## Risks

- Mocking `mutagen.flac.FLAC` at the wrong import path (`musicweb.scan.fingerprint.FLAC`) will silently miss.
- A too-clever “minimal FLAC header” is out of scope; mock the mutagen object.

## Implementation

### Files

- Create: `tests/scan/test_fingerprint.py`
- Create: `tests/scan/test_walk.py`

### Steps

1. **SHA-256:** write known bytes to `tmp_path / "a.alac"`, `compute_fingerprint` → `algo == "sha256"` and hex digest matches `hashlib.sha256`. Use `.alac` only (non-FLAC lossless suffix).
2. **FLAC MD5 int:** patch `musicweb.scan.fingerprint.FLAC` so `FLAC(path).info.md5_signature` is a non-zero int; result `algo == "flac-md5"` and fingerprint is 32-char hex (`f"{md5:032x}"`). `track_id` equals `track_id_for("flac-md5", fingerprint)`.
3. **FLAC MD5 bytes:** non-zero 16-byte signature → `.hex()`.
4. **FLAC fallbacks:** `md5_signature == 0`, all-zero bytes, `FLAC` raising, `info is None` → `algo == "sha256"` of the tmp file bytes.
5. **Walk:** tree with `ok.flac`, `skip.mp3`, `.dot.flac`, `dir/nested.flac`, `readme.txt`. `index_lossy=False` yields two flacs (not dotfile). `index_lossy=True` also yields mp3. A `cancel` that flips true after first yield stops further results.

### Verify

```sh
uv run --group dev pytest tests/scan/test_fingerprint.py tests/scan/test_walk.py
uv run --group dev pytest
```

## Acceptance

- [ ] SHA-256 path matches hashlib on tmp bytes.
- [ ] FLAC MD5 mocked int/bytes succeed; zero/error fall back to SHA-256.
- [ ] Walk respects index_lossy, dotfiles, and cancel.
- [ ] No files under `tests/fixtures/` and no committed audio.
