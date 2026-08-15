# Stage 02: Schema and API fields

## Status
pending

## Description

Persist and expose lossy identity: `tracks.is_lossy`, `tracks.bitrate_kbps`, `albums.lossy_kind`, plus `source_codec` / bitrate on the JSON and client Track/Album types. Do not walk or stream lossy files yet.

## Rationale

Scan, stream, client play, downloads, and marks all need one shared shape. Landing the columns and serializers first keeps those stages from inventing parallel flags.

## Invariants

- `source_codec` remains the codec name (`flac` / `alac` / `mp3` / `aac`). `is_lossy` is the boolean product flag, not a string parse on the client.
- `albums.lossy_kind` is NULL | `mp3` | `aac` | `mixed`. NULL means no present lossy tracks.
- Existing lossless rows migrate with `is_lossy = 0` and `bitrate_kbps` NULL. `lossy_kind` NULL.
- Client `fromApiTrack` still works for payloads that omit the new keys (offline / older cache): `isLossy` defaults false.
- No scan walk change. No stream change.

## Risks

- Deriving `is_lossy` only from `source_codec` on the client will drift. Persist the boolean and send it.
- Mutagen bitrate is often bits/sec. Store **kbps** (integer, rounded). Do not store bps in `bitrate_kbps`.
- Album `lossy_kind` is a finalize roll-up (stage 03). This stage only adds the nullable column; do not compute it from a half-scan.

## Implementation

### Files

- Create `src/musicweb/db/migrations/versions/007_track_lossy_and_album_kind.py`
- Change `src/musicweb/db/models.py`
- Change `src/musicweb/metadata.py`
- Change `src/musicweb/scan/identity.py` (`apply_track_fields` writes `is_lossy` + `bitrate_kbps`)
- Change `src/musicweb/routes/serializers.py`
- Change `src/musicweb/static/js/models/track.js`
- Change whatever album mapper the SPA uses for `/api/albums` (keep camelCase at the boundary)
- Do **not** change `scan/walk.py` or `routes/media.py`

### Steps

1. Alembic `007`: `tracks.is_lossy` boolean not null default false; `tracks.bitrate_kbps` integer nullable; `albums.lossy_kind` string nullable. `down_revision = "006_scan_state_job_kind"`.
2. Models match. No check constraint required beyond the documented enum for `lossy_kind`.
3. `TrackMetadata` gains `bitrate_kbps: int | None`. Read mutagen `info.bitrate` (bits/s) → `int(round(bps / 1000))` when `bps > 0`. `.mp3` → `source_codec = "mp3"`. AAC-in-MP4 → `source_codec = "aac"` (not the raw mutagen token if it is a long description).
4. `apply_track_fields` sets `track.is_lossy` from a shared helper (`source_codec in {"mp3", "aac"}` or `is_lossy_audio(path)`). Sets `bitrate_kbps`.
5. `track_dict` adds `is_lossy`, `source_codec`, `bitrate_kbps`. `album_dict` adds `lossy_kind`.
6. Client Track: `isLossy`, `sourceCodec`, `bitrateKbps`. `fromApiTrack` / `fromCatalogRecord` map snake and camel. Catalog records that lack the keys stay `isLossy: false`.

### Verify

- `uv run --group dev pytest`
- Start the app once so Alembic applies: `uv run musicweb` then quit. Confirm `library.db` has the three columns (`is_lossy` false on existing tracks; `lossy_kind` null on albums).
- `GET /api/albums` (or one album) includes `lossy_kind`. A known lossless track payload includes `is_lossy: false`.

## Acceptance

- [ ] Revision 007 is the head and upgrades a current data dir without hand-editing history.
- [ ] Track JSON has `is_lossy`, `source_codec`, `bitrate_kbps`. Album JSON has `lossy_kind`.
- [ ] Client Track type carries `isLossy` / `sourceCodec` / `bitrateKbps` with safe defaults.
- [ ] No MP3 is indexed. Stream still requires a profile tag.
