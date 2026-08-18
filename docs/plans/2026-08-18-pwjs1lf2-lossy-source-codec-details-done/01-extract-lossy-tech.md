# Stage 01: Extract lossy tech

## Status
done

## Description

Classify lossy source encoding at scan-read time: persistable `bitrate_kbps` on every `TrackMetadata` return, plus `bitrate_mode` (`cbr` / `vbr` / `abr` / `None`) for MP3 (mutagen) and AAC-in-m4a (`esds` max vs avg). No schema or UI.

## Rationale

Identity already writes `meta.bitrate_kbps`, but `read_metadata` never puts the extracted value on the dataclass, so every real scan stores NULL. Mode has no helper at all. Both must be pure and tested before a migration or the SPA can trust them.

## Invariants

- `bitrate_mode` values are only `cbr`, `vbr`, `abr`, or `None`. Never empty string, never `unknown`.
- MP3: map `mutagen.mp3.BitrateMode.CBR/VBR/ABR` only. `UNKNOWN`, missing attribute, or non-MP3 codec → `None`.
- AAC: first `esds` under the first `mp4a` sample entry. Both bitrates `> 0` and max `>` avg → `vbr`; both `> 0` and equal → `cbr`; anything else (missing atom, zero, max `<` avg, parse error) → `None`.
- AAC has no ABR. ALAC, FLAC, and unreadable MP4 stay `None`. Do not call ffprobe.
- `read_mp4_esds_bitrates` runs only when `source_codec == "aac"`. Walk only `moov/trak/mdia/minf/stbl/stsd` → first `mp4a` → `esds`. Skip `stsd` version/flags + `entry_count`. Skip the 28-byte AudioSampleEntry header (6 reserved + `data_reference_index` + 20-byte audio header) before child boxes. `esds` is a FullBox; descriptors use MPEG-4 expandable size; find ES_Descriptor `0x03` then DecoderConfigDescriptor `0x04`; then `bufferSizeDB` + 32-bit max + avg. Any structural error → `(None, None)`.
- `esds` parsing is an original ISO 14496-1 walk. Do not import `mutagen.mp4._as_entry` or copy mutagen source.
- Every `TrackMetadata(...)` construction in `read_metadata` passes `bitrate_kbps` (and `bitrate_mode`), including the `tags is None` return after tech is already extracted. The extracted numbers, not the dataclass default.
- Tests use crafted MP4/esds bytes and duck-typed `info` objects. The positive-`esds` fixture **includes** the AudioSampleEntry header and `0x03` wrapping `0x04` with expandable size. A parser that assumes `esds` starts immediately after the `mp4a` type must fail that test. Also keep a no-`esds` file → `(None, None)`.
- No committed audio binaries, no real `ffprobe`.
- This stage does not change `db/models.py`, Alembic, or the frontend.

## Risks

- Some AAC encoders write `maxBitrate == avgBitrate` for VBR. Those files omit Encoding or show CBR — accepted in [design.md](context/design.md).
- A too-loose box walk can mis-read a non-audio `esds`. Limit the walk to `moov/trak/mdia/minf/stbl/stsd` → `mp4a` → `esds`.

## Implementation

### Files

- Create: `src/musicweb/scan/bitrate_mode.py`
- Create: `tests/scan/test_bitrate_mode.py`
- Create: `tests/scan/test_metadata_bitrate.py`
- Change: `src/musicweb/metadata.py`

### Steps

1. Add `bitrate_mode: str | None = None` to `TrackMetadata` (default keeps `tests/scan/test_identity.py` `_meta()` working).
2. In `bitrate_mode.py` export:
   - `CBR`, `VBR`, `ABR` string constants
   - `mode_from_mp3_info(info) -> str | None`
   - `mode_from_esds_bitrates(max_bps: int | None, avg_bps: int | None) -> str | None`
   - `read_mp4_esds_bitrates(path: Path) -> tuple[int | None, int | None]`
   - `lossy_bitrate_mode(*, source_codec: str | None, info: object, path: Path) -> str | None`
3. `read_mp4_esds_bitrates`: 32/64-bit box sizes. Walk only the path in Invariants. On any structural error return `(None, None)`.
4. Wire `read_metadata`: after `_audio_tech_from_info`, set `bitrate_mode = lossy_bitrate_mode(...)`. Pass `bitrate_kbps` and `bitrate_mode` on **every** `return TrackMetadata(...)`, including the `tags is None` branch.
5. Tests for `mode_from_mp3_info` (CBR/VBR/ABR/UNKNOWN/missing).
6. Tests for `mode_from_esds_bitrates` (max>avg, equal, zeros, None, max<avg).
7. Tests for `read_mp4_esds_bitrates` with a `tmp_path` MP4 that is ISO-shaped: `stsd` FullBox + `entry_count`, `mp4a` with the 28-byte AudioSampleEntry header, then `esds` FullBox whose payload is ES_Descriptor `0x03` wrapping DecoderConfigDescriptor `0x04` (expandable size) with known max/avg. A second fixture with no `esds` → `(None, None)`. A third fixture that places `esds` immediately after the `mp4a` type (no 28-byte header) must **not** be accepted as the positive case — the headered fixture is the one that must yield the bitrates.
8. In `tests/scan/test_metadata_bitrate.py`: `read_metadata` returns extracted `bitrate_kbps` when mutagen `info.bitrate` is set (patch `MutagenFile` / info) on the success path **and** when `tags is None` after tech is extracted. Same file: `bitrate_mode` on an MP3-shaped info.

### Verify

```sh
uv run --group dev pytest tests/scan/test_bitrate_mode.py tests/scan/test_metadata_bitrate.py tests/scan/test_identity.py
```

Identity tests must still construct `TrackMetadata` without `bitrate_mode`.

## Acceptance

- [ ] `read_metadata` returns the extracted `bitrate_kbps`, not `None`, when mutagen exposes a positive bitrate, on both the tagged success path and the `tags is None` path.
- [ ] MP3 CBR/VBR/ABR map to the three strings; UNKNOWN/missing is `None`.
- [ ] AAC crafted **headered** `esds` classifies max>avg as `vbr` and equal positive as `cbr`. A walker that skips the AudioSampleEntry header cannot pass that test.
- [ ] No mutagen private imports. No audio fixtures. No DB/API/UI changes.
