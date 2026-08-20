# Stage 02: Listens API

## Status
done

## Description

Expose single-object listen ingest and household rankings over HTTP. Range parse, timezone label, and body validation live in `routes/listens.py`. The repository stays SQL.

## Rationale

The outbox (stage 04) and Stats page (stage 05) need a stable `/api/listens` surface that does not collide with `GET /api/library/stats` (index counts). `routes/` owns HTTP parse and status codes; playlists and diag already put Pydantic bodies in the route module.

## Invariants

- `POST /api/listens` accepts one object `{ id, track_id, profile, play_source, counted_at }`. No `items` array. No empty-body 204. No max-100.
- Pydantic model on the route for shape/enums (`play_source` in `{streaming, downloaded}`, non-empty `id` ≤ 36, non-empty `track_id` / `profile`). Future check is a tiny `now`-injected function in the same module (`counted_at` parseable via `parse_iso_utc`; not more than 5 minutes in the future). Past dates are allowed (offline flush). Do not put this validator in the repository.
- Validation failure / future `counted_at` → 422, no insert. Name the future-check error `ListenValidationError` if it is not a Pydantic error. Do not use bare `ValueError`.
- Unknown `track_id` (`ListenUnknownTrack` from `insert_listen`) → 422 **in the route**, before return. `ListenBadCountedAt` → 422 the same way. Do not 500. The route never sees commit-time `IntegrityError` for these cases.
- Duplicate `id` → 204 (repository `"duplicate"`).
- Inserted → 204.
- `parse_range(raw, *, now, tz) -> { range: "all" | "7d" | "30d" | "YYYY-MM", since_utc, month_key }` lives in `routes/listens.py`. `now` is timezone-aware UTC. `None` / `""` / unknown / invalid month → `"all"`. Valid month is `^\d{4}-(0[1-9]|1[0-2])$`. `7d` / `30d` set `since_utc` to `now` minus that many 24h periods, formatted like `utc_now_iso`. `host_timezone_name(tz)`: `ZoneInfo` key if `tz` is `ZoneInfo`, else `"local"`.
- `GET /api/listens/rankings?range=…`
  - parse via `parse_range`; echo `range` from that return field (not a separate `kind`)
  - body includes `range`, `timezone` (`host_timezone_name`), `months` (from `available_months`, unfiltered by `range`), `artists` (top 100), `tracks` (top 100)
- Artist payload: `{**artist_dict(artist), "play_count": n, "last_counted_at": ts}` built in the route. Do not add those keys to `artist_dict`.
- Track payload: `{**track_dict(track), "play_count": n, "last_counted_at": ts}` built in the route. Do not add those keys to `track_dict`.
- Do not add TestClient or `create_app`. Call the POST/GET handler functions directly (same style as `tests/test_diag_ingest.py` calling `ingest_events`). The `db` fixture yields `Database`, not a Session; tests must `with db.session() as session` (same as `tests/db/test_fts.py`). Direct handler calls do **not** run `get_db`’s commit — use that session context manager, or the same session for insert + rank. Assert 204 / 422 / rankings shape (`range` echo, unfiltered `months`, ranking fields not on `track_dict`).

## Risks

- None once parse/validate live in the route. Stage 04 POSTs exactly this object.

## Implementation

### Files

- Create: `src/musicweb/routes/listens.py` (router, Pydantic body, `parse_range`, `host_timezone_name`, future-check, payload builder, handlers)
- Change: `src/musicweb/routes/api.py` (include the router)
- Create: `tests/routes/test_listens.py`

### Steps

1. Pydantic ingest model + `counted_at_not_in_future(counted_at, *, now)` in the route module.
2. `parse_range` / `host_timezone_name` in the same file. `now` must be timezone-aware UTC so `since_utc` string-compares with stored `utc_now_iso` values.
3. `APIRouter(prefix="/api", tags=["listens"])` with POST `/listens` and GET `/listens/rankings`.
4. POST: validate → `insert_listen`. Map `ListenUnknownTrack` / `ListenBadCountedAt` / `ListenValidationError` / Pydantic 422. Duplicates are 204.
5. GET: `parse_range` → `rank_artists` / `rank_tracks` / `available_months` → spread `track_dict` / `artist_dict` plus the two ranking fields. Echo `parsed.range`.
6. Tests: `with db.session() as session` and pass that session into the handlers (no `get_db` commit). Insert 204; duplicate 204; unknown track 422; future `counted_at` 422; rankings `range` echo for `all` / `7d` / `30d` / `2026-08`; invalid range echoes `all`; `months` unfiltered.

### Verify

```sh
uv run --group dev pytest tests/db/test_listen_events.py tests/routes/test_listens.py
```

## Acceptance

- [ ] `GET /api/library/stats` is unchanged and still means index counts.
- [ ] POST body is one object; handlers return 204 on insert and on duplicate; 422 on unknown track / validation; no `items[]`.
- [ ] `parse_range` returns the public `range` token; GET echoes that field. `7d` and `30d` are distinct tokens.
- [ ] Rankings honor `all` / `7d` / `30d` / `YYYY-MM`. `months` is the full distinct month list.
- [ ] `timezone` is a `ZoneInfo` key or `"local"`.
- [ ] Shared `track_dict` / `artist_dict` are not widened.
- [ ] Handler tests exist (no TestClient, no `create_app`). Tests open `db.session()`. No `src/musicweb/listens/` package. Parse/validate are not in the repository.
