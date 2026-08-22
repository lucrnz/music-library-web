# Stage 01: Origin column and ingest

## Status
done

## Description

Add `origin` (`queue` | `radio`) to `listen_events` and `POST /api/listens`. Existing rows and an omitted POST field store `queue`. Rankings stay unfiltered.

## Rationale

The client cannot send a radio listen until ingest accepts `origin`. Shipping the column and default first keeps in-flight outbox rows and older tabs valid.

## Invariants

- `play_source` remains `streaming` | `downloaded` (delivery). `origin` is the session (`queue` | `radio`).
- Duplicate event ids stay 204 and do not rewrite the stored row.
- Unknown track ids and future `counted_at` stay 422.
- Rankings SQL does not filter or group by `origin`. Ranking JSON does not gain an origin field.
- Do not hand-edit applied Alembic revisions. New revision only, revises `012_scan_last_finished`.

## Risks

- Making `origin` required on POST would 422 pending outbox rows that lack the field. Default `queue` on the model, the insert helper, and Pydantic.

## Implementation

### Files

- `src/musicweb/db/migrations/versions/013_listen_origin.py`
- `src/musicweb/db/models.py`
- `src/musicweb/db/repositories/listens.py`
- `src/musicweb/routes/listens.py`
- `tests/db/test_listen_events.py`
- `tests/routes/test_listens.py`

### Steps

1. Add Alembic revision `013_listen_origin` (revises `012_scan_last_finished`). `batch_alter_table("listen_events")`: add non-null `origin` string with server default `"queue"`. Downgrade drops the column. No extra index.
2. On `ListenEvent` in `src/musicweb/db/models.py`, add `origin: Mapped[str]`. Keep the existing indexes. Docstring may say track × profile × play source × origin.
3. `insert_listen` in `src/musicweb/db/repositories/listens.py` takes `origin: str = "queue"` and writes it. Do not validate the token here (same as `play_source`). Existing call sites stay valid via the default.
4. `ListenIn` in `src/musicweb/routes/listens.py`: `origin: Literal["queue", "radio"] = "queue"`. Pass `origin=payload.origin` into `insert_listen`. Reject any other string with the existing Pydantic 422 path.
5. Tests: `test_head_includes_listen_events` column set includes `origin`. Add a repo test that an explicit `origin="radio"` persists and that the default insert is `queue`. Add route tests: omitted origin stores `queue`; `origin="radio"` stores `radio`; `origin="exclusive"` (or any other string) is a Pydantic `ValidationError`. Rankings still mix a queue event and a radio event for the same track into one play count.

### Verify

```sh
uv run --group dev pytest tests/db/test_listen_events.py tests/routes/test_listens.py
```

Inspect `listen_events.origin` on a migrated tmp DB (`test_head_includes_listen_events`). Confirm a POST body without `origin` is still 204.

## Acceptance

- Head schema has `listen_events.origin` (non-null, default `queue`).
- `POST /api/listens` accepts `origin` `queue` | `radio`, defaults omitted to `queue`, rejects other values.
- Rankings are unchanged in shape and still count both origins together.
- Existing listen tests pass without rewriting every `insert_listen` call.
