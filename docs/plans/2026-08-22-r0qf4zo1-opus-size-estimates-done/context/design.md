**Archive.** Decisions in this file were current as of 2026-08-22 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Opus 64/96 profiles and Settings size estimates

## Goal

Add first-class Opus 96 kbps and Opus 64 kbps stream profiles, and show a rough megabytes-per-hour size estimate on Settings quality dropdown rows only.

## Settled decisions

- New tags are first-class and `browser_listed`: `opus_96_48000` (`Opus 96k 48kHz`) and `opus_64_48000` (`Opus 64k 48kHz`). Same encode path as the existing Opus set: libopus VBR, 48 kHz, 16-bit intermediate. They appear on `GET /api/codecs`, Settings Streaming, Settings Downloads, and radio tuners.
- Browser-listed order stays descending Opus bitrate, then the three marketing FLACs: 192, 160, 128, **96, 64**, then `flac_16_44100`, `flac_16_48000`, `flac_24_96000`.
- Default remains `opus_192_48000`. Exclusive-FLAC matrix is unchanged.
- Estimates appear only on open rows of the Settings **Streaming** and **Downloads quality** dropdowns. The closed trigger stays label-only. Exclusive Audio, now-playing status/details, download queue, radio, and every other codec label stay estimate-free.
- Copy is secondary text `~29 MB/h` (tilde + integer + `MB/h`). Opus uses the given point values. 16-bit FLAC uses midpoints. `flac_24_96000` uses the derived midpoint **1230** (16-bit 48 kHz midpoint 410 × ~1.5 for 24-bit × 2 for 96 vs 48 kHz).
- `GET /api/codecs` owns the numbers as integer `approx_mb_per_hour`. Settings formats that integer. Other UIs ignore the field. `GET /api/exclusive-formats` does not gain it.
- Values (decimal MB; 1 MB = 1,000,000 bytes; stereo assumed):

  | Tag | `approx_mb_per_hour` |
  |---|---|
  | `opus_192_48000` | 86 |
  | `opus_160_48000` | 72 |
  | `opus_128_48000` | 58 |
  | `opus_96_48000` | 43 |
  | `opus_64_48000` | 29 |
  | `flac_16_44100` | 380 |
  | `flac_16_48000` | 410 |
  | `flac_24_96000` | 1230 |

- These are product constants, not live measurements. Opus is essentially `bitrate_kbps × 0.45`; FLAC is a typical-music midpoint and varies with content, compression, and bit depth.
- Lower Opus rates are intentional size/bandwidth options on the existing Opus encoder. They are not a new lossy format and not a lossy-source transcode path.

## Design

`StreamProfile` in `src/musicweb/transcode/profiles.py` stays the registry. The two new rows reuse `ffmpeg_codec_args()` (`-c:a libopus -b:a {n}k -vbr on`). Worker, passthrough, exclusive matrix, and default tag do not change. Radio already accepts any `browser_listed` tag.

Size estimates are catalog metadata for the marketing list, not encode policy. Add `approx_mb_per_hour: int | None` on `StreamProfile`. Every `browser_listed` profile has an integer; exclusive-only FLACs stay `None` and are never serialized on `/api/codecs`. `GET /api/codecs` adds the field next to `bitrate_kbps` / `bit_depth` / `sample_rate`. Build that body next to `exclusive_formats_payload()` so tests can lock shape without HTTP.

The client already maps `/api/codecs` to camelCase once in `frontend/src/stores/settings.ts`. Map `approx_mb_per_hour` → `approxMbPerHour` the same way. `musicweb.codecCatalog.v1` is not bumped: a stale cache shows labels without hints until the next live GET.

`SettingsSelect` grows an optional `hint` on options. List rows render it; the trigger still uses `label` only. `SettingsModal` attaches a formatted hint only when building Streaming and Downloads options. Playback-policy and Exclusive Audio selects pass no hint. `playbackStatus.ts`, `DownloadsModal.vue`, and radio keep using `label`.

```text
GET /api/codecs
  codecs[].approx_mb_per_hour   (int, browser-listed only)
        │
        ▼
settings.ts  mapCodecOption → approxMbPerHour
        │
        ▼
SettingsModal  quality rows only
  format: "~" + n + " MB/h"
        │
        ▼
SettingsSelect  option.hint on <li>, never on the trigger
```

## Stage map

1. **Server catalog** — registry and `/api/codecs` are the source of truth. New tags and the integer field must exist before Settings can show them, and before living docs can describe a shipped contract.
2. **Settings hints** — depends on the camelCase field and the two new catalog rows. Isolated to the Settings quality dropdowns so other codec surfaces cannot pick up the copy by accident.
3. **Living docs** — written last against the contract stages 01–02 actually ship (`profiles.py`, `/api/codecs`, Settings-only display).

## Out of scope

- Changing the default profile or encoder knobs (VBR, soxr, dither)
- New lossy formats or transcoding indexed MP3/AAC
- Estimates on Exclusive Audio, now-playing, downloads manager, or radio
- `GET /api/exclusive-formats` size fields
- Live size from track duration or actual cache bytes
- Bumping `musicweb.codecCatalog.v1`

## Assumptions

- Adding two `browser_listed` Opus tags is enough for stream, prepare, radio tune-in, quality rank (`opus_{bitrate}_{rate}`), and download MIME/ext; no worker or radio-protocol change.
- A missing `approxMbPerHour` on a synthetic or stale-cache option omits the hint rather than guessing.
- Decimal megabytes and stereo are the only conventions Settings will claim.
