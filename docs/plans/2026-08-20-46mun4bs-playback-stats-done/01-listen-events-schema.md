# Stage 01: Listen-events schema

## Status
done

## Description

Add a durable `listen_events` table, ORM model, and repository for idempotent insert, month-key, and ranking / month-chip queries. No HTTP parse, no range token, no routes.

## Rationale

Later stages need one place that defines the event row and the `GROUP BY` rankings. Query-string parse and body validation belong in `routes/listens.py` (stage 02), not here.

## Invariants

- New Alembic revision `010_listen_events` revises `009_track_bitrate_mode`. Do not edit applied revisions.
- Table `listen_events`:
  - `id` `String(36)` PK (client UUID)
  - `track_id` `String(36)` `ForeignKey("tracks.id", ondelete="CASCADE")` indexed
  - `profile_tag` `String` not null (stream profile / `source` / exclusive `flac_*`)
  - `play_source` `String` not null (`streaming` or `downloaded`)
  - `counted_at` `String` not null (UTC ISO-8601, **normalized** to the same form as `utc_now_iso`: no microseconds, explicit offset)
  - `month_key` `String` not null (`YYYY-MM` in the server host timezone, derived from the parsed `counted_at` at insert)
- Indexes: `counted_at`, `month_key`, `(track_id, counted_at)`.
- `insert_listen` looks up `session.get(ListenEvent, id)` first. Existing id → `"duplicate"` with no write. Then `session.get(Track, track_id)`. Missing track → raise `ListenUnknownTrack` (route maps to 422 **before** return). Do not INSERT-and-catch `IntegrityError` (that poisons the Session). Do not rely on `get_db`’s post-route commit to classify poison.
- `counted_at` is parsed with `musicweb.timeutil.parse_iso_utc` (returns `None`; it does not raise). `None` → raise `ListenBadCountedAt`. Then store `astimezone(timezone.utc).replace(microsecond=0).isoformat()` (same shape as `utc_now_iso`). Do not store the client’s raw string. `month_key` comes from that datetime in `datetime.now().astimezone().tzinfo`, not from ingest wall-clock and not from the UTC calendar month. That `tzinfo` is often a **fixed current offset**, not a `ZoneInfo`. Do not add `tzlocal`, do not convert to `ZoneInfo`, do not rewrite stored keys.
- Rankings: `COUNT(*)` desc, then `MAX(counted_at)` desc, limit 100. Tie-break is well-defined because every stored `counted_at` uses one ISO form.
- `rank_tracks` returns `(Track, play_count, last_counted_at)` with `selectinload(Track.album)`.
- `rank_artists` returns `(Artist, play_count, last_counted_at)`.
- Artist rank joins `tracks.artist_id` and skips null `artist_id`.
- Missing tracks (`is_missing`) still join and count.
- This module does **not** export `parse_range`, `host_timezone_name`, or `validate_listen_body`.
- Export `listens` from `src/musicweb/db/repositories/__init__.py`.
- Repository functions take a `Session`. They do not import FastAPI. No `src/musicweb/listens/` package.

## Risks

- Storing `month_key` at insert freezes the host TZ mapping. A later TZ change does not rewrite old keys (accepted in [design.md](context/design.md) assumptions).
- CPython `datetime.now().astimezone().tzinfo` is usually a fixed offset. A winter instant ingested in summer can land in the adjacent calendar month near midnight. That is accepted; do not “upgrade” the mapping.

## Implementation

### Files

- Change: `src/musicweb/db/models.py` (add `ListenEvent`)
- Change: `src/musicweb/db/repositories/__init__.py` (export `listens`)
- Create: `src/musicweb/db/migrations/versions/010_listen_events.py`
- Create: `src/musicweb/db/repositories/listens.py`
- Create: `tests/db/test_listen_events.py`

### Steps

1. Add `ListenEvent` mapped to `listen_events` with the columns in Invariants.
2. Write `010_listen_events.py` in the same style as `009_track_bitrate_mode.py` (`revision = "010_listen_events"`, `down_revision = "009_track_bitrate_mode"`). Create the table and the three secondary indexes. Downgrade drops the table.
3. In `listens.py` export:
   - `ListenUnknownTrack`, `ListenBadCountedAt` (small exception types)
   - `month_key_for(counted_at: str, tz) -> str` (parse via `parse_iso_utc`)
   - `insert_listen(session, *, id, track_id, profile_tag, play_source, counted_at) -> Literal["inserted", "duplicate"]` (lookup event id, lookup track, normalize `counted_at`, compute `month_key` inside; do not accept a client `month_key`)
   - `available_months(session) -> list[str]` distinct `month_key` newest first
   - `rank_tracks(session, *, since_utc: str | None, month_key: str | None, limit: int = 100)`
   - `rank_artists(session, *, since_utc: str | None, month_key: str | None, limit: int = 100)`
   All-time: both filters `None`. Rolling window: `since_utc` set, `month_key` None. Calendar month: `month_key` set, `since_utc` None.
4. Pytest on the `db` fixture (`init_database` on tmp data dir):
   - migration/head includes `listen_events`
   - insert then same `id` → `"duplicate"` and still one row (no `IntegrityError`)
   - mixed client formats (`Z`, `+00:00`, microseconds) store one `utc_now_iso` shape; rank order by `counted_at` matches chronological order
   - `month_key_for` a known UTC instant against a fixed `ZoneInfo` (not the machine TZ) is the expected `YYYY-MM`
   - two listens on the same track increment count; rank order is count then latest `counted_at`
   - artist rank uses `artist_id` and omits a track with `artist_id is None`
   - `rank_tracks` can read `track.album.title` without a lazy load
   - `available_months` is unique, descending
   - `since_utc` excludes older rows; `month_key` includes only that month
   - unparseable `counted_at` raises `ListenBadCountedAt` before insert
   - unknown `track_id` raises `ListenUnknownTrack` (no add). A **separate** schema test: raw `session.add` + `commit` with a bad id raises under `PRAGMA foreign_keys=ON` (not the HTTP path)

### Verify

```sh
uv run --group dev pytest tests/db/test_listen_events.py
```

## Acceptance

- [ ] Head revision creates `listen_events` with the columns and indexes in Invariants.
- [ ] Duplicate event id is a lookup, not an `IntegrityError` path, and does not change counts.
- [ ] Unknown `track_id` raises `ListenUnknownTrack` before add; FK-at-commit is only a schema test.
- [ ] Stored `counted_at` matches `utc_now_iso` shape; rank/filter use that string.
- [ ] `month_key` comes from parsed `counted_at` + host TZ, never from the client.
- [ ] `rank_tracks` eager-loads `Track.album`.
- [ ] Repository does not export `parse_range`, `host_timezone_name`, or `validate_listen_body`.
- [ ] `listens` is exported from the repositories package. No `src/musicweb/listens/` package.
