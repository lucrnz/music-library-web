# Stage 01: Persist album duration

## Status
done

## Description

Add nullable `albums.duration_ms`, recount it at scan finalize, backfill existing rows in the migration, and put `duration` / `duration_ms` on `album_dict`.

## Rationale

Cards, trees, and search never load tracks. Without a stored aggregate they cannot show length. Finalize is already the recount pass for `track_count` and `lossy_kind`.

## Invariants

- Present tracks only (`is_missing = 0`).
- `NULL` when the album has no present tracks, or any present track has `duration_ms IS NULL`.
- Otherwise `SUM(tracks.duration_ms)`.
- `album_dict["duration"]` is `duration_ms / 1000.0` or `None`, same as `track_dict`.
- Do not rewrite applied Alembic revisions.

## Risks

- A forgotten recount path would leave stale lengths after scan. Only `recount_entities` may write this column after migrate.
- SQLite `SUM` of integers is fine for household albums; do not cast to float in the UPDATE.

## Implementation

### Files

- `src/musicweb/db/models.py`
- `src/musicweb/db/migrations/versions/014_album_duration.py`
- `src/musicweb/scan/finalize.py`
- `src/musicweb/routes/serializers.py`
- `tests/scan/test_finalize.py`
- `tests/routes/test_serializers.py`

### Steps

1. On `Album` in `src/musicweb/db/models.py`, add `duration_ms: Mapped[Optional[int]]` (nullable Integer). Do not give it a server default.
2. Add `src/musicweb/db/migrations/versions/014_album_duration.py` revising `013_listen_origin`. `upgrade` adds the column, then runs the same `UPDATE albums SET duration_ms = (SELECT …)` SQL that finalize will use. `downgrade` drops the column.
3. In `src/musicweb/scan/finalize.py` `recount_entities`, after the `track_count` update, set `albums.duration_ms` with: `NULL` if `COUNT(*) = 0` or `SUM(CASE WHEN duration_ms IS NULL THEN 1 ELSE 0 END) > 0`, else `SUM(duration_ms)`, from present tracks of that album.
4. In `src/musicweb/routes/serializers.py` `album_dict`, add `"duration_ms": album.duration_ms` and `"duration": (album.duration_ms / 1000.0) if album.duration_ms is not None else None`.
5. Extend `tests/scan/test_finalize.py`: all present tracks have ms → sum; one present track `duration_ms is None` → album `NULL`; missing tracks are ignored; zero present tracks → `NULL`.
6. Extend `tests/routes/test_serializers.py` so `album_dict` exposes both fields (including the `None` case).

### Verify

```sh
uv run --group dev pytest tests/scan/test_finalize.py tests/routes/test_serializers.py
```

## Acceptance

- After migrate, an existing album whose present tracks all have `duration_ms` has `albums.duration_ms` equal to that sum without a rescan.
- An album with any present track missing `duration_ms` has `albums.duration_ms IS NULL` after migrate and after `recount_entities`.
- `GET /api/albums` (via `album_dict`) includes `duration` and `duration_ms` for every album.
- `uv run --group dev pytest tests/scan/test_finalize.py tests/routes/test_serializers.py` passes.
