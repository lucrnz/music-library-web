> **Archive.** Decisions in this file were current as of 2026-08-15 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Lossy index and source passthrough

## Goal

Let a lossless-first library also hold niche albums that only exist as MP3 or AAC, without turning the product into a lossy re-encoder. Lossy files are opt-in to index, marked on every album and track title, streamed and downloaded as stored, and never sent through the Opus/FLAC profile pipeline.

## Settled decisions

- **Stance:** lossless-first exception. Packed lossless remains the default story. Lossy is allowed, always marked, never the default product claim.
- **Formats:** MP3 and AAC in `.m4a` / `.mp4` only. AAC is the inverted existing ALAC probe. No Vorbis, WMA, or Opus-as-source.
- **Location:** same `MUSIC_LIBRARY_PATH`. No second root.
- **Activation:** `MUSICWEB_INDEX_LOSSY` (bool, default off). Flag off = today’s lossless-only walk and browse.
- **Siblings:** same parent folder + disc + track number; filename stem if track number is missing. Skip the lossy file when a lossless sibling exists on disk.
- **Lossless later:** skip the lossy path on the next scan so finalize marks the old lossy row missing (same as a deleted file). Playlists that pointed at it break that way. Do not re-point the old id at the FLAC.
- **Mixed albums:** allowed. Album is marked if any present track is lossy.
- **Album icon:** `mp3` if every lossy track is MP3, `aac` if every lossy track is AAC, otherwise generic `mixed`.
- **Track icon:** MP3 or AAC sprite. Not a text “lossy” chip.
- **Surfaces:** every album/track title surface (library list/grid/tree, search, queue, now playing / mini player, downloads, folder files).
- **Copy:** “Lossy source — played as stored. Not a lossless file.” Desktop hover tooltip, icon `aria-label`, mobile tap-to-toast, Playback details row. Tap is icon-only and does not play / expand.
- **Stream:** original bytes only. Reserved profile tag `source`. Requesting an Opus/FLAC tag on a lossy track is `409`. Requesting `source` on a lossless track is `409`.
- **Quality prefs / prepare:** lossless only. Wi‑Fi, cellular, and download profile pickers do not apply to lossy tracks.
- **Status line:** `Streaming · MP3 320` / `Downloaded · AAC 256` from source codec + stored bitrate, not from the unused stream profile.
- **Downloads:** always the original file (`source`). Offline + unplayable original → unavailable.
- **Cannot decode:** unavailable with an honest reason. Probe mp3/aac families the same way Opus/FLAC are probed. No transcode fallback. No Settings toggle for re-encoding lossy.
- **Exclusive + lossy:** unavailable this plan (`exclusive_lossy`). Do not send MP3/AAC through the companion FLAC encode. Exclusive remux / bit-depth match is a later plan.
- **Data-saver transcode of lossy:** out of scope. Cellular still plays `source`.
- **Identity:** lossy fingerprints are full-file SHA-256 (same as non-FLAC lossless). Content identity stays honest; FLAC and MP3 of the same song are different tracks.
- **Durable docs:** this directory is not living documentation. Stage 08 writes the new invariant into README, AGENTS.md, and the systems / product / architecture pages.

## Design

**Gate, then mark, then passthrough.** The scanner grows a second eligibility class behind a default-off flag. The stream and download paths fork on `is_lossy`: lossless still uses explicit profiles; lossy serves the file on disk. The UI never lets a lossy title look like a lossless one.

**Format gate.** `formats.py` keeps `is_lossless_audio` for FLAC/ALAC. New helpers classify MP3 and AAC-in-MP4. `is_indexable_audio(path, *, index_lossy)` is the single walk/browse predicate. Folder browse and `Library.is_audio` use that predicate so unindexed leftovers do not appear as playable files when the flag is off.

**Sibling skip is filesystem-first.** Before upserting a lossy path, list the parent directory, find lossless audio, and match disc+track (or stem). If a lossless sibling exists, do not upsert and do not add the lossy path to `seen_paths`. Finalize then marks any previously indexed lossy row missing. When a lossless file is upserted, the same skip on later walks keeps the MP3 out. No tag matching across folders.

**Album roll-up at finalize.** `albums.lossy_kind` is `mp3` | `aac` | `mixed` | NULL, computed from present (`is_missing = 0`) tracks. Tracks store `is_lossy` and `bitrate_kbps` next to the existing `source_codec`. The client does not infer album marks from a codec list.

**Passthrough is explicit.** `GET /api/stream?id=&codec=source` returns the original with `audio/mpeg` or `audio/mp4` and Range. Prepare skips lossy ids (`skipped`). The worker must not receive a lossy path + Opus/FLAC tag.

**Client delivery.** `getActiveStreamCodec()` stays the profile picker for lossless. Lossy loads pass `source`. mp3/aac decode probes run at startup beside Opus/FLAC. A failed family probe or a play `error` on a lossy original sets `unavailable` / `codec_unsupported`. Exclusive mode short-circuits lossy to `exclusive_lossy` before any companion load.

**Downloads.** Enqueue lossy with `codec=source`. Catalog records keep `isLossy`, `sourceCodec`, `bitrateKbps` so offline browse can mark and the status line can speak. `codecExt` maps `source`+mp3 → `.mp3`, `source`+aac → `.m4a`. Quality ranking does not compare `source` to Opus/FLAC; local original vs stream original is the same file.

**Marks.** Three 24×24 `currentColor` sprites in `index.html` (`i-fmt-mp3`, `i-fmt-aac`, `i-fmt-lossy`), same fill language as `i-source-*`. One `LossyMark` component: icon, tooltip/`title`, `aria-label`, click → `showToast` + `stopPropagation`. Album vs track only differ by which kind they pass.

## Stage map

1. **Format gate + env flag** — no scan behavior change. Makes eligibility and the operator switch testable before anything indexes an MP3.
2. **Schema + API fields** — tracks and albums can *say* they are lossy. Client Track/Album types grow the fields. Nothing walks lossy files yet.
3. **Scan + siblings + album roll-up** — depends on 01 and 02. This is the first stage that can put a lossy row in SQLite when the flag is on.
4. **Server passthrough** — depends on 02 (`is_lossy`). Lossless encode path stays untouched. Prepare and stream grow the `source` / `409` fork.
5. **Client play** — depends on 04. Status, probes, exclusive refuse, prepare skip. Without this, a lossy row is a 400/encode.
6. **Download original** — depends on 04 and 05 (`source` URL + enqueue rule). Offline catalog must not store an Opus encode of an MP3.
7. **Title marks** — depends on 02 (and 06 so downloaded/offline rows have the fields). Visual honesty on every title surface, plus details/toast copy.
8. **Living docs** — last. Rewrites the lossless-only claim to match what 01–07 actually shipped.

## Out of scope

- Exclusive remux / bit-depth matching of lossy sources (refuse with `exclusive_lossy` instead).
- Mobile-data / data-saver transcode of lossy (always `source`).
- Settings toggle to transcode lossy when the browser cannot decode.
- Opus-as-source, Vorbis, WMA, WAV, AIFF.
- A second library root.
- Cross-folder / tag-only sibling matching.
- Re-pointing a lossy track id onto a later FLAC.
- Client-side re-encode.

## Assumptions

- Operator will flip `MUSICWEB_INDEX_LOSSY` and run a scan after deploy; default-off means existing libraries do not ingest leftover MP3s by surprise.
- Real MP3/AAC files for manual verify live (or will be copied) under the library root. Pytest does not need real media: format helpers and sibling matching are tested with mocks / temp names.
- Starlette `FileResponse` already satisfies HTTP Range for passthrough.
- Frontend verification is manual (`uv run musicweb`); there is no JS test runner.
- Mutagen exposes bitrate for MP3 and AAC well enough to store `bitrate_kbps`; missing bitrate is allowed (status then says `MP3` / `AAC` without a number).
- AAC-in-`.mp4` is the same codec family as AAC-in-`.m4a`.
- Existing leftover MP3s sitting next to FLACs are skipped by the sibling rule once the flag is on.
