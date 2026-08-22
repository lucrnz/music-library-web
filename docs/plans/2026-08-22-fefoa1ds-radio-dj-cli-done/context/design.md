**Archive.** Decisions in this file were current as of 2026-08-22 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Radio debug DJ CLI

## Goal

Give a developer on the library machine a documented `musicweb radio` CLI that inspects the live household station and performs debug DJ mutations (skip, inject, re-pick, reset, clear skip-ids), with upcoming/banlist ids hidden unless `--spoilers`. Tuned-in PWA clients follow skip/play/reset through the existing now-playing WebSocket snapshot. No HTTP or WebSocket DJ API.

## Settled decisions

- Command group is `musicweb radio`. Bare `musicweb radio` prints help.
- Live server only, via the existing Unix control socket (`$MUSICWEB_DATA_DIR/musicweb.sock`). No offline SQLite persist dump. Missing socket is a hard fail.
- Debug-only and documented (`commands.md`, carve-out in `radio.md`). Visible in `--help`. No env flag, no confirmation prompts.
- Human text on stdout (labeled lines). Errors on stderr with a non-zero exit. No `--json`.
- Verbs: `status`, `skip`, `play TRACK_ID`, `pick`, `reset`, `banlist`, `skip-ids`, `skip-ids clear`. No `queue` command.
- `--spoilers` is required before any verb prints upcoming ids or banlist ids. Without it, those are counts (and banlist batch sizes) only. `skip-ids` is not a spoiler and always lists ids.
- `status` without spoilers: face; current id/title/artist/album when `current`; `started_at`; position; duration; tuner count and profile union; catalog watermark; eligible-track count; `upcoming_count`; banlist batch count and sizes; `skip_ids` count.
- Operator `skip` does not add the old current to `skip_ids`. The next track starts now (`started_at = now`).
- `play` injects an eligible track as current and keeps the other remaining upcoming. The old current is not added to `skip_ids`. The forced id is added to the banlist if it is not already there. If the id is already current: success and do not reset the clock. If the id appears later in the queue: drop those later copies. Eligible means present, has an album, duration ≥ `RADIO_MIN_DURATION_MS`, and pick-time ffprobe succeeds; probe failure adds the id to `skip_ids` and rejects the play.
- `pick` keeps current playing, discards unplayed remainder, strips those discarded ids from the banlist, and installs one new batch.
- `reset` clears queue, banlist, and `skip_ids`, then picks a fresh batch and starts it now. No `--yes`.
- `skip-ids clear` empties the whole process-lifetime unplayable set. No per-id clear.
- `status` always works. Mutations fail while `face == catching_up`. `skip` on `idle` fails. `play` on `idle` starts that track now and picks upcoming. `pick` on `idle` installs a fresh batch as current. `skip_pending` allows skip/play/pick/reset.
- Listener catch-up reuses the existing now-playing WebSocket snapshot (same payload as a tick). No new WS message type and no frontend protocol change. Fan-out only after `skip`, `play` (when current actually changes), and `reset`. `pick` and `skip-ids` do not push. Untuned `/radio` still updates the store from the snapshot; only `chrome` `tuning` | `tuned` loads audio.
- Control RPC includes upcoming/banlist ids only when `spoilers=true`. Radio/server logs still never print next songs.
- HTTP `/api/radio/*` and the radio WebSocket client allowlist stay tune-in/tune-out/close only. Product “Remote DJ” remains out of scope.

## Design

The in-memory `RadioStation` is the source of truth while the server runs (clock, queue, banlist, `skip_ids`, catalog). The CLI cannot see that state from SQLite alone, so every verb is a control-plane RPC into the live process.

```text
musicweb radio <verb>
        │
        ▼
ControlClient  ──UDS──►  ControlServer._dispatch
                              │
                              ├─ station.operator_* / debug_*   (RLock)
                              └─ on skip/play/reset that changed
                                 current or started_at:
                                 loop.call_soon_threadsafe(station.notify_loop)
                                        │
                                        ▼
                                 existing tick listener:
                                 serialize(now_playing) → WS hub
                                 + RadioPrepare.refresh()
```

**Station API (process-local).** Add a `threading.RLock` covering tick, catch-up, persist, `now_playing`, `peek_upcoming_ids`, `retained_track_ids`, and the new debug/DJ methods so the control thread and the radio worker cannot interleave. Operator methods take an explicit `now` (tests inject it; control passes `datetime.now(timezone.utc)`). They persist on change the same way tick does. They do **not** call `notify_loop` themselves (the listener reads the station; calling notify while holding the lock would deadlock).

**Status assembly.** A helper next to the station builds the control result dict from the station plus `TunerRegistry` (`count()`, `profiles()`). Upcoming ids and banlist ids are omitted unless `spoilers=True`. Track rows resolve to `id`, `title`, `artist` (and `album` on current) when the index row exists; otherwise id only.

**Control methods.** One RPC per verb: `radio_status`, `radio_skip`, `radio_play`, `radio_pick`, `radio_reset`, `radio_banlist`, `radio_skip_ids`, `radio_skip_ids_clear`. Lifespan binds the live `RadioStation` and the running asyncio loop onto the existing `ControlServer` (still constructed with jobs in `cli/serve.py`). Unbound station → `ok=false`. Mutations that fail (`catching_up`, idle skip, ineligible play, empty catalog) → `ok=false` with a stable `error` string; no partial persist.

**Listener push.** After a successful `radio_skip` / `radio_play` / `radio_reset` whose result says current or `started_at` changed, schedule `station.notify_loop` on the bound loop. That is the same function the radio worker already calls after tick: `push_now_playing` + `prepare.refresh`. `NowPlayingHub.schedule` can stay `get_running_loop()`-based because notify runs on the loop. `radio_play` that is a no-op (already current) and `radio_pick` / `radio_skip_ids*` do not schedule notify.

**CLI.** New Typer group `musicweb.cli.radio` registered on the root app. Each verb checks `ControlClient.health()` first; if the socket is down, exit 1 and tell the operator to start `musicweb`. `--spoilers` is an option on `status`, `skip`, `play`, `pick`, `reset`, and `banlist`, and is passed through as the RPC param. The CLI formats the result dict as labeled lines and must not print upcoming/banlist ids unless the flag was set (even if the server payload is too chatty).

**Human text (normative).** One `key: value` line per field, in this order for a status-like result:

```
face: current
track: <id>  <title> — <artist>
album: <album>
started_at: <iso>
position: <seconds>
duration: <seconds>
tuners: <n> (<profile>, ...)
catalog_watermark: <iso or ->
eligible: <n>
upcoming: <n>
banlist_batches: <n> (<size>, ...)
skip_ids: <n>
```

Non-`current` faces omit `track` / `album` / `started_at` / `position` / `duration` when the snapshot has no current track. With `--spoilers`, append an `upcoming:` block of `  <id>  <title> — <artist>` lines (or id only). `radio banlist` prints only the `banlist_batches` line unless `--spoilers`, then one `batch <i>:` block of the same track lines. `radio skip-ids` prints `skip_ids: <n>` then one track line per id. Mutation verbs print the post-mutation status (same rules).

**Docs that outlive this plan.** `docs/development/commands.md` lists the group. `docs/systems/radio.md` carves this CLI out of “Remote DJ” out-of-scope and records the `--spoilers` exception. `docs/development/project-structure.md` updates the `cli/` and `control/` ownership lines. HTTP/WS/logs still never serialize upcoming ids.

## Stage map

1. **Station DJ API** — lock, debug view, and operator verbs with unit tests. Control and CLI have nothing to call until this exists.
2. **Control RPC + loop-safe notify** — expose those verbs on the existing UDS plane and schedule the existing tick listener after jumps. CLI cannot talk to a live station without this; listener catch-up is this stage’s notify hop.
3. **CLI group** — Typer + human text + health check. Depends on the client methods and result shape from stage 02.
4. **Docs** — write the durable command and radio-guardrail carve-out after the argv surface is real.

## Out of scope

- HTTP or WebSocket skip/play/reset/request (product Remote DJ)
- New radio WS message types or frontend protocol changes
- Offline persist dump when the server is down
- JSON CLI output
- Confirmation flags
- Per-id `skip-ids` clear
- Force-play of ineligible or missing tracks
- Exclusive-mode radio
- Radio listen stats
- Changing picker rules, tick period, or public `/api/radio/now` shape

## Assumptions

- The radio worker continues to call `notify_loop` after catch-up and each tick; this plan only adds the same notify after operator jumps.
- `RadioPrepare.refresh` remains safe to call on the asyncio loop (today’s tick path).
- Tests must not call `create_app` or start uvicorn; control tests may bind a temporary UDS or call `ControlServer._dispatch` directly.
