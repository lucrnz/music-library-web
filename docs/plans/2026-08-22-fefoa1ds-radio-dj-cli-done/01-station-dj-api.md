# Stage 01: Station debug DJ API

## Status
done

## Description

Add a station lock plus process-local debug/DJ methods on `RadioStation`: inspect status/banlist/skip-ids, operator skip, inject-play, replace-upcoming pick, reset, and clear skip-ids. Mutations persist the same way tick does. They do not notify WebSocket listeners (that is stage 02).

## Rationale

The control plane and CLI can only wrap a real station API. The lock must exist before a second thread (control) calls into the station that the radio worker already ticks.

## Invariants

- Operator `skip` never adds the old current to `skip_ids`.
- Operator `skip` / successful `play` (current actually changes) / `reset` set `started_at` to the injected `now`.
- `play` when the id is already current succeeds and does not change `started_at` or the queue.
- `play` drops later copies of the injected id from the remaining queue and adds the id to the banlist if it is missing from the banlist.
- `play` rejects tracks that are missing, have no album, are shorter than `RADIO_MIN_DURATION_MS`, or fail pick-time probe; probe failure adds the id to `skip_ids`.
- `pick` does not change current or `started_at`; discarded unplayed ids are stripped from the banlist before the new batch is picked.
- `reset` clears queue, banlist, and `skip_ids` before picking.
- Mutations other than the idle rules fail while `_catching_up` is true. `skip` on idle (no current) fails. `play` on idle installs that track as current and picks upcoming. `pick` on idle installs a fresh batch as current.
- `now_playing`, `peek_upcoming_ids`, `retained_track_ids`, `run_catchup`, `tick`, `persist_shutdown`, and the new debug/DJ methods all take the same `RLock`.
- Operator methods do not call `notify_loop`.
- Station and debug helpers never log upcoming ids or titles of upcoming tracks.

## Risks

- `notify_loop` / `RadioPrepare.refresh` re-enter the station. If a later stage called notify while still holding this lock, it would deadlock. Mitigation: operator methods release the lock before return; stage 02 schedules notify only after the RPC returns.
- Existing radio tests call tick/catch-up/now_playing; the lock must be re-entrant or those call chains will break. Use `RLock`.

## Implementation

### Files

- `src/musicweb/radio/station.py`
- `src/musicweb/radio/types.py`
- `src/musicweb/radio/debug.py`
- `tests/radio/test_station_dj.py`

### Steps

1. Add a `threading.RLock` on `RadioStation` and acquire it in `now_playing`, `peek_upcoming_ids`, `retained_track_ids`, `run_catchup`, `tick`, `persist_shutdown`, and every new public debug/DJ method.
2. In `src/musicweb/radio/types.py`, add a small mutation result type (ok / error code / whether current or `started_at` changed) used by the operator methods.
3. Add `src/musicweb/radio/debug.py` that, given the station, a tuners duck (`count()`, `profiles()`), `now`, and `spoilers`, returns the status dict described in [context/design.md](context/design.md) (no upcoming/banlist ids unless `spoilers`). Resolve titles from the index when the row exists.
4. Implement on `RadioStation` (names may be these or equivalent public names used by stage 02):
   - debug accessors for catalog watermark, eligible count, upcoming ids, banlist batches, and `skip_ids` (for the helper in `debug.py`)
   - `operator_skip(now)`
   - `operator_play(track_id, now)`
   - `operator_pick(now)`
   - `operator_reset(now)`
   - `clear_skip_ids()`
5. Persist on successful mutation the same way `_with_session` does for tick. Reuse `_advance` / `_pick` / `_install_batch` / `_maybe_pick_next` rather than a second clock.
6. Add `tests/radio/test_station_dj.py` using the existing radio tmp-library fixture and a mocked probe. Cover: skip does not populate `skip_ids` and starts the next track at `now`; play inject / already-current no-op / strips later copies / rejects ineligible and probe-fail; pick keeps current and replaces remainder; reset wipes skip-ids and restarts; catching_up rejects mutations; idle skip fails; idle play and idle pick start the station; debug helper omits upcoming ids when `spoilers=False`.

### Verify

```sh
uv run --group dev pytest tests/radio/test_station_dj.py tests/radio/test_station.py tests/radio/test_catchup.py tests/radio/test_prepare.py
```

Existing station/catch-up/prepare tests must still pass with the new lock.

## Acceptance

- Operator skip, play, pick, reset, and clear-skip-ids behave as in [context/design.md](context/design.md) Settled decisions, proven by `tests/radio/test_station_dj.py`.
- `debug.py` status with `spoilers=False` contains no upcoming track ids and no banlist track ids.
- `RadioStation` public clock and snapshot methods take the shared `RLock`.
- No control, CLI, HTTP, or frontend files change in this stage.
