# Stage 03: Station clock

## Status
done

## Description

Persist the household station, catch up on a lifespan `to_thread` task started **before** `yield`, and run the simulation tick (advance, skip, pick-next-on-last-track-start). Do not block startup on catch-up. No WebSocket and no prepare yet.

## Rationale

The 24/7 illusion is the clock, not the encoder. Catch-up, banlist prune, and idle must be correct — and must not stall every request — before any client hears audio.

## Invariants

- Next `started_at` is previous end, not wall `now` at the moment of the tick (see [station.md](context/station.md)).
- Public face is `catching_up` (in-process) until the first catch-up returns, then derived: missing/unresolvable current → `skip_pending`; `current_track_id is None` → `idle`; else `current`. No face column.
- `run_catchup` / `tick` / probe / persist are synchronous. The lifespan task is their only caller; it runs them via `asyncio.to_thread`.
- Persist only on advance / skip / pick / shutdown. A no-op tick does not write SQLite.
- `RadioStation` holds process-lifetime `skip_ids` and passes them into every `pick_batch`. Failed probes are not persisted on the banlist.
- Rebuild the catalog snapshot only when `scan_state.finished_at` (kind `scan`) changes. Never re-probe `skip_ids`.
- Logs may name the current title/artist, mode (still simulation), and skip reasons. They must not print upcoming ids or titles, including during catch-up (one “advanced N tracks” line is enough).
- Radio tables are not exposed by discovery or any GET in this stage.
- Tests do not call `create_app` or uvicorn.

## Risks

- First scan may still be empty at lifespan start. Idle + retry after the scan watermark changes is required or the station never starts after a fresh DB.
- Catch-up on a long downtime can pick many batches and ffprobe each new current; that is why it cannot be `await`ed before `yield`.
- A persist port (`store.py`) is extra. This tree already tests persistence with `init_database` on `tmp_path`.

## Implementation

### Files

- `src/musicweb/config.py` (`RADIO_TICK_SECONDS = 1`)
- `src/musicweb/db/models.py`
- `src/musicweb/db/migrations/versions/011_radio_station.py`
- `src/musicweb/db/repositories/radio.py`
- `src/musicweb/radio/station.py`
- `src/musicweb/main.py`
- `tests/radio/test_station.py`
- `tests/radio/test_catchup.py`

### Steps

1. Alembic revision `011` after `010_listen_events`. Tables for: singleton station (current track id nullable, `track_started_at`, current batch seq — **no face column**), queue rows (batch seq, index, track id), banlist batches (seq + track ids). Track ids are plain strings: **no FK** to `tracks.id`. Exact columns live in the revision and models — do not document them elsewhere.
2. Persist through `db/repositories/radio.py` only. **No `store.py`.** Station tests use `init_database(tmp_path)` like the rest of the suite.
3. Banlist persist: if appending a picked batch would make five, save `[previous, new]` only.
4. `RadioStation`:
   - In-process face starts `catching_up`. Holds `skip_ids`.
   - `run_catchup(now)` / `tick(now)`: load, catch up; persist **only if** something advanced/skipped/picked. If empty, try one pick when the catalog watermark changed or a pick is still possible without re-probing `skip_ids`; if still empty, `idle`.
   - `advance`: skip-loop on unresolved path / failed probe / null duration / missing row (add to `skip_ids`); when the new current row is the last in its batch, `pick_batch(..., skip_ids)` and append; persist + prune.
   - Inject `now`, catalog builder, probe, RNG, repository/session factory.
   - After each catch-up/tick (session still open), load the current `Track` row if any and stash a `StationSnapshot` dataclass: face, `started_at`, `duration_ms`, and the current track’s display/tech fields **or `None`**. Missing/unresolvable current → face `skip_pending`, track `None`. Never throw. Internal math stays on `duration_ms`.
   - `now_playing()` returns that in-memory snapshot (id + position seconds derived at read time). It is **not** a route DTO and must not import `routes.serializers`. Stage 04 serializes it.
5. Lifespan, same pattern as `idle_sweep_loop` in `main.py`:
   1. After `check_dependencies()`, construct the station, `app.state.radio = station`.
   2. `radio_task = asyncio.create_task(radio_worker(), name="radio-station")` **before** `yield`.
   3. Worker: `await to_thread(run_catchup, now)` then loop sleep + `to_thread(tick, now)`. New `database.session()` inside each threaded call.
   4. After each threaded return, invoke the event-loop listener (empty in this stage; stage 04 broadcasts, stage 05 adds prepare on **that same** listener).
   5. `finally`: cancel task, persist once, join.
   Do not put FastAPI types in `station.py`. Do not construct the station inside `bootstrap_services` unless a later stage needs it on `RuntimeServices`.
6. Log at INFO: worker started, catch-up count, each advance’s current title/artist, skips. No queue dump. Mode is still simulation (no tuners).
7. Tests with a fake clock and `init_database(tmp_path)`:
   - tick at duration boundary advances once
   - two-track skip in one catch-up lands mid-third track
   - last-track start picks the next batch; persist has at most four banlist batches; fifth pick leaves `[previous, new]`
   - empty catalog → idle; later tick after a new `scan_state.finished_at` picks
   - probe fail at track start skips without adding duration and is not re-probed
   - persist + reload resumes the same current id and `started_at`
   - face is `catching_up` until catch-up returns
   - missing current row → `skip_pending`, next tick skips
   - no-op tick does not write

### Verify

- `uv run --group dev pytest tests/radio/`

## Acceptance

- Process start serves HTTP while catch-up may still be running; public face is `catching_up` until the worker lands. The task is created **before** `yield`.
- Simulation advances without ffmpeg or `Transcoder`.
- Last-track start picks the next batch using stage 02; banlist prune is the station’s job.
- Upcoming tracks never appear in log messages.
- Persist does not write on a no-op tick.
- `run_catchup` / `tick` / probe / persist are synchronous; the lifespan task is their only caller (they run inside `to_thread`). Do not add a `create_app` test.
- No `/api/radio` routes yet.
