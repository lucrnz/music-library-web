# Stage 01: Classify once

## Status
done

## Description

Add `audio_kind(path)` as the single walk/batch eligibility classify. Predicates and sibling-gating go through it. Unreadable MP4 is `None`, not AAC. Type `should_skip_lossy` against `TrackMetadata`.

## Rationale

`is_indexable_audio` currently opens a non-ALAC `.m4a` twice (`_is_alac` in lossless, again in lossy). Probe failure is treated as AAC. One function deletes both problems.

## Invariants

- FLAC / `.alac` extension: lossless, never opens mutagen for kind.
- `.mp3`: lossy, never opens mutagen for kind.
- Opened `.m4a`/`.mp4` ALAC → lossless; opened non-ALAC → lossy (inverted ALAC probe).
- Unreadable `.m4a`/`.mp4` (mutagen except or missing info) → not lossless, not lossy, not indexable even when `index_lossy` is on.
- `is_indexable_audio` is still the walk/browse predicate; it must call `audio_kind` once.
- `metadata.py` still uses `mp4_kind(info)` only. No path-level classify from metadata.
- Sibling skip behavior for readable files is unchanged. Batch still reuses sibling `TrackMetadata` on the keep path.

## Risks

- Tests that `patch` `_is_alac` will miss the new probe helper. Update them to patch `_probe_mp4_kind` (or whatever the single open is named).
- Previously indexed corrupt `.m4a` rows drop out of `seen_paths` and finalize marks them missing. Accept (see design).

## Implementation

### Files

- Change `src/musicweb/scan/formats.py`
- Change `src/musicweb/scan/batch.py`
- Change `src/musicweb/scan/siblings.py`
- Change `tests/test_formats.py`
- Change `tests/test_lossy_siblings.py` only if the `meta` type change requires it

### Steps

1. In `formats.py`, add `_probe_mp4_kind(path) -> "alac" | "aac" | None`: open `MP4` once; on exception or missing info return `None`; else `mp4_kind(audio.info)`. Delete `_is_alac` or make it a one-line wrapper of the probe (do not leave two openers).
2. Add `audio_kind(path) -> Literal["lossless", "lossy"] | None`:
   - not a file → `None`
   - `ALWAYS_LOSSLESS` → `"lossless"` (no `or ext == ".flac"`)
   - `.mp3` → `"lossy"`
   - `.m4a`/`.mp4` → probe once; `alac` → lossless, `aac` → lossy, `None` → `None`
   - else → `None`
3. `is_lossless_audio` / `is_lossy_audio` become `audio_kind(path) == "…"`. `is_indexable_audio` calls `audio_kind` once: lossless always; lossy only when `index_lossy`.
4. In `batch.py`, replace `is_lossy_audio(path)` with `audio_kind(path) == "lossy"`. Keep one `read_metadata` on the keep path.
5. In `siblings.py`, type `should_skip_lossy` `meta` as `TrackMetadata` (import from `musicweb.metadata`). Stop using `getattr` if the dataclass fields are enough (`meta.disc`, `meta.track`).
6. Tests: retarget MP4 patches at `_probe_mp4_kind`. Add: empty/unreadable `.m4a` is not lossless, not lossy, not indexable with the flag on. Assert `is_indexable_audio` + the two predicates do not call the probe more than once per path (mock `side_effect` / `call_count`).

### Verify

- `uv run --group dev pytest tests/test_formats.py tests/test_lossy_siblings.py`
- `rg "_is_alac" src/musicweb` — no second opener; at most a wrapper.
- `rg "or ext == \".flac\"" src/musicweb/scan/formats.py` — no matches.
- `rg "is_lossy_audio" src/musicweb/scan/batch.py` — no matches.

## Acceptance

- [ ] One mutagen open per `audio_kind` / `is_indexable_audio` call on `.m4a`/`.mp4`.
- [ ] Unreadable MP4 is not indexed as AAC.
- [ ] Batch sibling-gating uses `audio_kind`, not a second predicate stack.
- [ ] `should_skip_lossy` is typed; lossless sibling behavior unchanged.
- [ ] Metadata still does not open files for classify.
