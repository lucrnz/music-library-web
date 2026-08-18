# Stage 04: Living docs

## Status
done

## Description

Record lossy Playback details (bitrate, sample rate, encoding) and the scan-time source of those fields on the existing playback and library-scan pages. A full scan backfills existing indexes.

## Rationale

The plan directory is not living documentation. The next change to the details modal or scan tech should read `docs/systems/playback.md` and `docs/systems/library-scan.md`, not this folder.

## Invariants

- Edit `docs/systems/playback.md` and `docs/systems/library-scan.md` only.
- Do not add an ADR or a new system page.
- Do not treat this plan directory as the source of truth after this stage.
- Do not document encoder argv, mutagen class names, `esds` byte offsets, or test file lists.

## Risks

- None

## Implementation

### Files

- Change: `docs/systems/playback.md`
- Change: `docs/systems/library-scan.md`
- Do not change: `docs/README.md`, `docs/product/core-guidelines.md`, `docs/database/overview.md`

### Steps

1. On the playback page, in the lossy / status sentence: keep the compact face (`Streaming · MP3 320`). Add that Playback details for a lossy original (stream or downloaded) also lists Bitrate, Encoding (`CBR` / `VBR` / `ABR` when known), and the **file** sample rate; omit any unknown row. Exclusive still refuses lossy.
2. Note that downloaded originals use the same track fields (catalog keeps sample rate and bitrate mode). Older catalog rows omit the new rows until that track is downloaded again.
3. On the library-scan page: scan stores average/nominal `bitrate_kbps` and, for MP3/AAC, `bitrate_mode` when it can tell. MP3 uses the file header; AAC-in-m4a compares MP4 `esds` max vs average bitrate (equal → CBR, max higher → VBR; otherwise leave empty). A **full** scan fills existing libraries; quick scan does not re-read unchanged files.
4. Do not copy column names into `docs/database/overview.md` (that page already points at the ORM).

### Verify

```sh
# docs only
```

Read both pages and confirm they match shipped stages 01–03, not this plan’s file names.

## Acceptance

- [ ] `docs/systems/playback.md` states which lossy details rows exist, that the status line stays short, and that unknown values are omitted.
- [ ] `docs/systems/library-scan.md` states how mode is decided and that a full scan backfills.
- [ ] This plan is not cited as the source of truth.
