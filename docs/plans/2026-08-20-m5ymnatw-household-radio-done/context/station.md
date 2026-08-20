# Radio station lifecycle

Clock, tuners, and complete-file prepare. Linked from [design.md](./design.md). Picking is [picking.md](./picking.md).

## Faces

Faces are **not** a SQLite column. `catching_up` is process-lifetime until the first catch-up returns. After that: missing/unresolvable current id → `skip_pending`; `current_track_id is None` → `idle`; else `current`. Persist clock + queue + banlist only, and only on advance / skip / pick / shutdown.

| Face | Now-playing HTTP | Tune-in | Prepare |
|---|---|---|---|
| `catching_up` | 200, no current track | reject, socket stays | no |
| `skip_pending` | 200, no current track | reject, socket stays | no |
| `idle` | 200, idle | reject, socket stays | no |
| `current` | 200, `track_dict` + position (seconds) | allowed | only if tuners ≥ 1 |

`catching_up` is not idle and not a stale persisted row. `skip_pending` is a deleted/missing current between ticks — never `track_dict(None)`. Reject frame:

```text
{ "ok": false, "error": "station_not_current", "face": "catching_up" | "skip_pending" | "idle" }
```

Do not register the tuner. Do not prepare. Do not close the socket (the Radio tab still needs the preview clock).

## Modes

| Tuners (`tune_in` sockets) | Mode | Transcoder |
|---|---|---|
| 0 | simulation | no **radio** prepares |
| ≥1 | streaming | urgent current + prewarm next 2, per active codec |

A tuner is one browser tab’s WS in the `tune_in` state, not a stream GET and not a browser profile. `/api/stream` stays the on-demand file route; it does not increment tuners.

## Clock

Source of truth is `track_started_at` (UTC) plus the current track’s `duration_ms`.

```
position = now - started_at
```

`asyncio.create_task(radio_worker)` **before** `yield` (same as `idle_sweep_loop`). Worker: `await to_thread(run_catchup)` then loop sleep `RADIO_TICK_SECONDS` + `to_thread(tick)`. Open a **new** `database.session()` inside each `to_thread` call. After the thread returns, one event-loop listener broadcasts and (stage 05) refreshes prepare. Persist only if the tick advanced, skipped, picked, or this is shutdown — not on a no-op tick.

When `position >= duration`, advance:

- Next `started_at` = previous `started_at + duration` (not `now`).
- If the track now starting is the last row of its batch, pick the next batch (unless it was already picked). Pass station `skip_ids` into `pick_batch`.
- Prune banlist on persist as in [picking.md](./picking.md).
- Persist. Broadcast now-playing (no upcoming).
- If tuners ≥ 1, refresh prepare (urgent new current, prewarm new next 2).
- Log current title/artist, mode, tuner count. Do not log the rest of the queue.

At each new current track, re-check the file exists (`Library.resolve`) and ffprobe still passes. Failure: add to `skip_ids`, skip immediately (same advance rule), log, do not count that duration in the clock.

Unknown, null duration, or missing persisted row: face is `skip_pending` until the next tick skips it into `skip_ids` and advances. Never throw from serialize.

Idle retry may run on the 1s tick. Never re-probe `skip_ids`. Rebuild the catalog snapshot only when `scan_state.finished_at` (kind `scan`) differs from the last rebuild.

## Catch-up

Lifespan **must not** block `yield` on catch-up.

1. After `check_dependencies()`, construct the station (`app.state.radio`, in-process face `catching_up`), `create_task(radio_worker)` **before** `yield`.
2. Worker first line: `to_thread` load singleton + queue + banlist. While current track’s end is in the past, advance as above (this may pick many batches and ffprobe). Do not await catch-up in startup.
3. Land at the track whose window contains `now`. Face becomes `current`, `skip_pending`, or `idle` if the queue is empty and a pick returns empty.
4. Tick continues on the same task. `run_catchup` / `tick` / probe / persist are synchronous; the lifespan task is their only caller.

Do not log the titles walked during catch-up. A single “catch-up advanced N tracks” line is enough.

If the process was down long enough to exhaust loosening into an empty pick, idle. Retry a pick on later ticks only after the index watermark changes, or when a pick is still possible without re-probing `skip_ids`.

## Tuners and prepare

Allowlisted WS messages (stage 05): `tune_in` `{ codec }` and `tune_out`. Each gets one reply (`{ "ok": true }` or an error frame). Anything else closes the socket. Disconnect = that tab is no longer a tuner.

`codec` is only a `browser_listed` profile tag. `source`, exclusive, and unknown: `{ "ok": false, "error": "codec_rejected", "face" }`, leave tuner count unchanged, socket stays open. Lossy ids are never encoded (`enqueue_prepare` skips them). The client chooses `SOURCE_TAG` vs the stored profile from the snapshot’s `is_lossy` at load time.

`tune_in` on an existing connection updates that tuner’s codec and does not double-count. Prepare only if the codec union grew or changed.

On 0→1 (or codec-union change): log simulation→streaming when crossing 0→1. `prepare_radio` calls `enqueue_prepare` in `transcode/enqueue.py` (never POST `/api/transcode/prepare`, never `drop_pending_prewarm`):

- current id: urgent, `log_label="radio current"`
- next 1 and next 2 ids, if they exist: prewarm, `log_label="radio prewarm"`

The helper owns `get_many` / skip missing-lossy / `Library.resolve` / `tech_from_track` / `Transcoder.prepare`. No second probe. No copied loop in `radio/prepare.py`.

Repeat that set for every distinct **profile** among tuners. Lossy ids are skipped inside the helper. Never store `source` on a tuner.

On 1→0: log streaming→simulation. Do not enqueue further radio prepares. In-flight jobs may finish. Do not `clear_cache`.

On track advance while tuners ≥ 1: enqueue the new current + new next 2 (same rules). The client is never sent those next ids. Next ids are an internal station method, never serialized.

Radio prepare logs: profile tag + `log_label` only. Never path, title, or `source.name` for those jobs. On-demand jobs stay as they are.

The 1-hour on-demand cache idle wipe is unchanged. After a wipe, the next Tune-in is a cold `ensure_stream`.

## Client clocks and loads

- Radio tab, not tuned / `tuning`: interpolate official position from the last snapshot + local elapsed. Spinner while waiting for the file.
- Tuned: after the instructed seek, display and lyrics use `audio.currentTime`. If `|heard − official| > 2s` (WS tick or tab becomes visible), seek again.
- Track change: re-read `is_lossy`; load `/api/stream` with `SOURCE_TAG` or the stored profile; seek to official (near 0). Do not send `tune_in` unless the profile changed.
- Station advance does **not** count toward the 3-failures / 10s cap. Hard load/seek failures do; at the cap, toast and stay `stopped`.

## Shutdown

Cancel the lifespan task, persist the last clock, drop tuner state. Do not wipe radio SQLite. Process-temp `streams/` wipe is unchanged.
