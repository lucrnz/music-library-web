**Archive.** Decisions in this file were current as of 2026-08-18 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Lossy source codec details

## Goal

When the current track is a lossy original (MP3 or AAC-in-m4a), Playback details shows source bitrate, sample rate, and encoding mode (CBR / VBR / ABR). The compact status line stays short. Missing values stay off the list.

## Settled decisions

- Extra rows apply to **any lossy original**: streaming `source` delivery or a downloaded original. Exclusive still refuses lossy and is unchanged.
- Status line stays `{Source} · {MP3|AAC} {N}k`. Sample rate and encoding appear only in Playback details (mobile modal / desktop popover).
- Details fields for lossy: existing Source, Codec, Bitrate, and “played as stored” note, plus **Encoding** and **Sample rate**. No channels, no AAC-LC / HE-AAC, no MP3 layer.
- Omit a row when the value is missing or unknown. Never invent CBR/VBR.
- Bitrate row is always `N kbps` (mutagen’s figure; average when the file is VBR/ABR). Encoding is a separate row.
- MP3 mode comes from mutagen `MPEGInfo.bitrate_mode`: `CBR` / `VBR` / `ABR`. `UNKNOWN` or a missing attribute omits Encoding.
- AAC-in-m4a mode comes from the MP4 `esds` DecoderConfigDescriptor: both max and average bitrates `> 0` and max `>` avg → `vbr`; both `> 0` and equal → `cbr`; otherwise omit. AAC has no ABR label.
- Existing libraries fill on a **full** scan. Quick scan keeps today’s size+mtime skip. No regen job and no “retry while NULL” quick path.
- Persist `tracks.bitrate_mode` as `cbr` | `vbr` | `abr` | NULL. Fix the existing scan bug that extracts `bitrate_kbps` and then drops it on `TrackMetadata`.
- Parse `esds` with an original ISO 14496-1 helper. Do not import mutagen’s private `mp4._as_entry` modules. The walk is not a generic MP4 parser: only `moov/trak/mdia/minf/stbl/stsd` → first `mp4a` → `esds`, and only when `source_codec == "aac"`. Skip the `stsd` FullBox + `entry_count`, skip the 28-byte AudioSampleEntry header before child boxes, then read `esds` as a FullBox whose payload is ES_Descriptor (`0x03`) wrapping DecoderConfigDescriptor (`0x04`) with MPEG-4 expandable size. Crafted fixtures must include that header and wrapping so a toy “`esds` immediately after `mp4a`” walker fails the test.

## Design

Playback details is the deep dive on the expanded now-playing status line (`PlaybackStatusLine` + `buildPlaybackDetailsRows`). The lossy branch returns early with Codec + Bitrate + the canned source-file sentence. `Track.sampleRateHz` is already on the API and the client type; that branch never reads it. There is no `bitrate_mode` anywhere. `read_metadata` computes `bitrate_kbps` from mutagen `info.bitrate` and never passes it into `TrackMetadata`, so the column stays NULL and the status line never shows `MP3 320k` from a real scan.

**Scan.** Keep mutagen as the scan probe (no ffprobe, no mediainfo). After tags/tech are read:

1. Always put `bitrate_kbps` on `TrackMetadata` (every return path).
2. If `source_codec == "mp3"`, map mutagen `bitrate_mode` to `cbr` / `vbr` / `abr` or NULL.
3. If `source_codec == "aac"`, open the same path and walk only `moov/trak/mdia/minf/stbl/stsd` → first `mp4a` (skip 28-byte AudioSampleEntry header) → `esds` FullBox → ES_Descriptor `0x03` → DecoderConfigDescriptor `0x04` (expandable size) → `bufferSizeDB` + 32-bit max + avg. Classify as above. Any structural error is NULL. ALAC and other codecs stay NULL. Do not walk FLAC or MP3.

Identity already assigns `track.bitrate_kbps = meta.bitrate_kbps`. After the return fix, a re-read (full scan, or any quick-scan size/mtime change) fills bitrate. Mode needs a new nullable string column and the same assign.

**API / client.** `track_dict` already emits `bitrate_kbps` and `sample_rate_hz`. Add `bitrate_mode`. Client `Track.bitrateMode` maps both casings. Type `PlayStatusState.track` as `Pick<Track, "isLossy" | "sourceCodec" | "bitrateKbps" | "sampleRateHz" | "bitrateMode">`. Do not grow an anonymous optional-field object.

**Details rows** (lossy, after Source):

| Order | Key | Label | When |
|-------|-----|-------|------|
| 1 | `codec` | Codec | MP3 / AAC (existing) |
| 2 | `bitrate` | Bitrate | `N kbps` when `bitrateKbps > 0` (existing) |
| 3 | `encoding` | Encoding | `CBR` / `VBR` / `ABR` when mode is known |
| 4 | `sample_rate` | Sample rate | existing `formatSampleRate` on `track.sampleRateHz` |
| 5 | `lossy` | Source file | existing copy |

`PlaybackDetailsBody` already renders whatever rows it is given. No new chrome.

**Offline catalog.** Downloaded originals play from a catalog-projected `Track`. `fromCatalogRecord` currently drops `sampleRateHz`. Catalog write and `QueueTrackSnapshot` must keep `sampleRateHz` and `bitrateMode` so a downloaded original still has the new rows when the server is gone. Older catalog rows stay omitted until that track is committed again.

**Backfill.** Operators run a full scan. Until then, omit empty rows. NULL `bitrate_mode` after a full scan means “unknown,” not “not yet probed.”

## Stage map

Detection is a pure scan helper and can be tested with crafted bytes and duck-typed mutagen info — it does not need a migration. Persist and the API come next so the client has a real field, not a second probe. The SPA stage consumes that field plus the sample rate that already exists. Living docs last so `playback.md` / `library-scan.md` describe shipped behavior.

1. **Extract lossy tech** — bitrate return + MP3/AAC mode classification.
2. **Persist bitrate mode** — Alembic column, identity write, `track_dict`.
3. **Playback details rows** — client types, catalog snapshot, details formatter.
4. **Living docs** — playback and scan contracts.

## Out of scope

- Status-line copy changes (except it will start showing `Nk` once bitrate actually persists)
- Exclusive playback of lossy, exclusive remux, lossy transcode
- Other lossy formats (ADTS `.aac`, Vorbis, Opus-as-source, WMA)
- Channels, AAC profile (LC / HE-AAC), MP3 layer / version
- Stream HTTP headers carrying tech
- Quick-scan or regen backfill of existing rows
- Guessing AAC mode from file size vs declared bitrate
- Changing encode-time `transcode/probe.py`

## Assumptions

- Mutagen `File(..., easy=True)` still exposes `MPEGInfo.bitrate_mode` on MP3 and a readable path for AAC-in-m4a.
- A full scan re-reads every present file (today’s `mode != "quick"` skip is the only size+mtime short-circuit).
- Queue restore after this ships will pick up `bitrate_mode` on the next track fetch / new download; stale in-memory tracks omit Encoding until then.
- `esds` max==avg is good enough to label CBR, accepting that some VBR encoders write equal values (those files omit or show CBR rather than invent VBR).
