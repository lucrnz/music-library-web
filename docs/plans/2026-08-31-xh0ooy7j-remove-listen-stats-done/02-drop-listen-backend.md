# Stage 02: Drop listen API, model, and table

## Status
done

## Description

Remove the listen HTTP surface, repository, and `ListenEvent` ORM class. Add Alembic revision `017_drop_listen_events` (revises `016_cd_unripped`) that drops `listen_events`. Existing listen rows are discarded. Index-count `GET /api/library/stats` and `musicweb stats` stay.

## Rationale

After stage 01 the client no longer posts or fetches rankings. This stage is the server half of full excision: routes, SQL, and the table must leave together so Alembic head matches `models.py` and leftover events cannot be read.

## Invariants

- Do not rewrite or delete `src/musicweb/db/migrations/versions/010_listen_events.py` or `src/musicweb/db/migrations/versions/013_listen_origin.py`.
- Do not touch `src/musicweb/cli/stats.py`, `src/musicweb/routes/library_scan.py` (`GET /api/library/stats`), or `LibraryScanPanel.vue`.
- Do not add `httpx` / `TestClient` / `create_app` tests to prove the listen routes are gone.
- `listen_events.track_id` is the only FK into this table; dropping it must not change `tracks`.
- New revision `down_revision` is Alembic head at implementation time (`016_cd_unripped` when this plan was written).

## Risks

- `011_radio_station` revises `010_listen_events` and `014_album_duration` revises `013_listen_origin`. Deleting those old files would break the chain.
- A downgrade that omits `origin` or the current indexes would not recreate the table the rest of history expects.

## Implementation

### Files

- `src/musicweb/routes/listens.py`
- `src/musicweb/db/repositories/listens.py`
- `tests/routes/test_listens.py`
- `src/musicweb/routes/api.py`
- `src/musicweb/db/repositories/__init__.py`
- `src/musicweb/db/models.py`
- `src/musicweb/db/migrations/versions/017_drop_listen_events.py`
- `tests/db/test_listen_events.py`

### Steps

1. Delete `src/musicweb/routes/listens.py` and `src/musicweb/db/repositories/listens.py`.
2. Delete `tests/routes/test_listens.py`.
3. In `src/musicweb/routes/api.py`, remove the `listens` import and `router.include_router(listens.router)`.
4. In `src/musicweb/db/repositories/__init__.py`, remove `listens` from the import and from `__all__`.
5. In `src/musicweb/db/models.py`, delete the entire `ListenEvent` class (`__tablename__ = "listen_events"` and its columns/indexes).
6. Add `src/musicweb/db/migrations/versions/017_drop_listen_events.py` in the same style as sibling revisions:
   - `revision = "017_drop_listen_events"`
   - `down_revision = "016_cd_unripped"` (or the real head if another revision landed first)
   - `upgrade`: `op.drop_table("listen_events")` (indexes on that table go with it)
   - `downgrade`: recreate `listen_events` with the **current** schema (010 columns plus `origin` from 013, same PK/FK `ON DELETE CASCADE`, and the same indexes including `ix_listen_events_track_id_counted_at`), so a downgrade is the inverse of today’s table, not of 010 alone
7. Rewrite `tests/db/test_listen_events.py` to a single test that uses the existing `db` fixture (Alembic head) and asserts `inspect(engine).has_table("listen_events")` is false. Delete the insert/rank/origin/month cases.

### Verify

- `uv run --group dev pytest` exits 0.
- `rg -n "ListenEvent|musicweb.routes.listens|repositories.listens|/api/listens" src/musicweb tests` is empty except the new drop revision’s table name and the inverted head test.
- `src/musicweb/routes/library_scan.py` still defines `GET /library/stats`.
- `src/musicweb/cli/app.py` still registers `musicweb stats`.
- `010_listen_events.py` and `013_listen_origin.py` are unchanged.
- `alembic heads` reports a single head that includes `017_drop_listen_events`.

## Acceptance

- `POST /api/listens` and `GET /api/listens/rankings` are not registered.
- `ListenEvent` is gone from `models.py`. There is no `db/repositories/listens.py`.
- A database migrated to head has no `listen_events` table. Existing listen rows are gone.
- `GET /api/library/stats` and `musicweb stats` still report index counts.
- Applied history `010` and `013` remain on disk and in the revision chain.
- The backend pytest suite passes, including the inverted head test.
