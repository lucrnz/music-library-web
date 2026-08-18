# Stage 02: Persist bitrate mode

## Status
done

## Description

Add `tracks.bitrate_mode`, write it from `TrackMetadata` in `apply_track_fields`, and emit it on `track_dict`. Existing `bitrate_kbps` assignment stays; after stage 01 it will actually store a number on the next re-read.

## Rationale

The SPA and the offline catalog can only show Encoding if the index and JSON already carry the mode. A column plus serializer is the whole contract; no new route.

## Invariants

- Column is nullable `String`. Allowed stored values: `cbr`, `vbr`, `abr`, or SQL NULL. No check constraint required if writers only use the stage 01 constants.
- Revision is `009_track_bitrate_mode`, revises `008_preferred_artist_image`. Do not edit applied revisions. Upgrade is plain `op.add_column`; downgrade is `op.drop_column`. No `batch_alter_table`.
- `apply_track_fields` sets `track.bitrate_mode = meta.bitrate_mode` for every upsert (lossless stays NULL).
- `track_dict` includes `"bitrate_mode": track.bitrate_mode` next to `bitrate_kbps`.
- Quick scan still skips unchanged size+mtime. Full scan re-reads and backfills. No extra regen kind.
- Do not put `channels` or `bitrate_mode` into encode-time `transcode/probe.py`.

## Risks

- Operators who only run quick scan after upgrade will keep NULL mode and NULL bitrate on unchanged files. That is the settled backfill rule, not a bug.

## Implementation

### Files

- Create: `src/musicweb/db/migrations/versions/009_track_bitrate_mode.py`
- Change: `src/musicweb/db/models.py`
- Change: `src/musicweb/scan/identity.py`
- Change: `src/musicweb/routes/serializers.py`
- Change: `tests/scan/test_identity.py`
- Change: `tests/routes/test_serializers.py`
- Change: `tests/db/test_engine_fixture.py`

### Steps

1. Alembic upgrade is exactly `op.add_column("tracks", sa.Column("bitrate_mode", sa.String(), nullable=True))`. Downgrade is `op.drop_column("tracks", "bitrate_mode")`. No `batch_alter_table`.
2. `Track.bitrate_mode: Mapped[Optional[str]]` after `bitrate_kbps`.
3. In `apply_track_fields`, assign `track.bitrate_mode = meta.bitrate_mode`.
4. Add `"bitrate_mode": track.bitrate_mode` to `track_dict`.
5. Identity test: `apply_track_fields` with `_meta(source_codec="mp3", bitrate_kbps=320, bitrate_mode="cbr")` persists both; a FLAC `_meta()` leaves `bitrate_mode` NULL.
6. Serializer test: `track_dict` includes `bitrate_mode` (`"vbr"` and `None` cases).
7. In `test_init_database_creates_tracks_fts_and_idle_scan_state`, after `insp.has_table("tracks")`, assert `"bitrate_mode"` is in `{c["name"] for c in insp.get_columns("tracks")}`.

### Verify

```sh
uv run --group dev pytest tests/scan/test_identity.py tests/routes/test_serializers.py tests/db/test_engine_fixture.py
```

`test_init_database_creates_tracks_fts_and_idle_scan_state` must open a tmp DB at head after `009` and see the column.

## Acceptance

- [ ] `inspect(db.engine).get_columns("tracks")` includes `bitrate_mode` after `init_database` on a tmp data dir.
- [ ] `apply_track_fields` writes `cbr`/`vbr`/`abr` and NULL through to the ORM row.
- [ ] `track_dict` exposes `bitrate_mode` beside `bitrate_kbps`.
- [ ] No frontend changes. No scan-mode / job-kind changes.
