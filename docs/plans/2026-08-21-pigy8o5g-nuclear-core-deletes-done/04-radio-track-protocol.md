# Stage 04: Radio track Protocol

## Status
done

## Description

Give `track_dict` a Protocol that `Track` and `SnapshotTrack` both satisfy. Remove the `# type: ignore[arg-type]` in `now_playing.serialize`.

## Rationale

`SnapshotTrack` exists so the clock can drop the ORM session. Forcing it through `track_dict(Track)` is the type leak. One Protocol keeps a single field list.

## Invariants

- HTTP/WS track JSON keys and values from `track_dict` do not change (including `path` null when missing, `duration` seconds + `duration_ms`).
- `serialize` still returns face-only for non-current, and face + track fields + `position` for current.
- Radio still does not include upcoming/queue/batch in the payload.

## Risks

- Protocol that names `album.title` too tightly may fail on a detached ORM track with `album is None`. Match today’s `track.album.title if track.album else ""`.

## Implementation

### Files

- `src/musicweb/routes/serializers.py`
- `src/musicweb/radio/now_playing.py`
- `tests/radio/test_now_playing.py`

### Steps

1. In `src/musicweb/routes/serializers.py`, add a Protocol (e.g. `TrackPayload`) with the attributes `track_dict` reads: `id`, `rel_path`, `is_missing`, `title`, `artist_name`, `album` (optional object with `title`), `album_id`, `artist_id`, `album_artist_name`, `album_artist_id`, `track_no`, `disc_no`, `year`, `duration_ms`, `sample_rate_hz`, `bit_depth`, `is_lossy`, `source_codec`, `bitrate_kbps`, `bitrate_mode`. Change `track_dict` to accept that Protocol. Do not change the dict keys.
2. In `src/musicweb/radio/now_playing.py`, call `track_dict(snapshot.track)` with no `type: ignore`. Do not change `SnapshotTrack` / `SnapshotAlbum` — they already match the Protocol.
3. In `tests/radio/test_now_playing.py`, add or adjust a current-face case that serializes a `SnapshotTrack` (not an ORM `Track`) and asserts the same keys `track_dict` produces (at least `id`, `title`, `path`, `is_lossy`). Existing serializer tests stay on ORM tracks and need no edit.

### Verify

- `uv run pytest tests/routes/test_serializers.py tests/radio/test_now_playing.py tests/routes/test_listens.py`
- `rg -n "type: ignore\\[arg-type\\]" src/musicweb/radio/now_playing.py` is empty

## Acceptance

- `track_dict` is typed for both `Track` and `SnapshotTrack`.
- `now_playing.serialize` has no `type: ignore`.
- Serialized current-face JSON still matches today’s `track_dict` + `position`.
