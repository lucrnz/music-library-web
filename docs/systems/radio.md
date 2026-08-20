# Household radio

One household-wide 24/7 station. With no tuners it only advances a clock. Listeners Tune in, load the current official track through the existing complete-file stream, and seek to the WebSocket clock.

## Source of truth

- Station clock, picker, prepare: `src/musicweb/radio/`
- Persist: `src/musicweb/db/repositories/radio.py` (models in `db/models.py`)
- HTTP + WebSocket: `src/musicweb/routes/radio.py`
- Shared prepare enqueue: `src/musicweb/transcode/enqueue.py`
- Client chrome + socket: `frontend/src/stores/radio.ts`
- Radio-owned audio: `frontend/src/radio/`
- Room / bar / mini: `frontend/src/components/radio/`
- Related: `docs/systems/transcoding.md`, `docs/systems/playback.md`, `docs/systems/exclusive-audio.md`

## Station

The clock starts when the server process is up, including zero listeners. Restart **catches up** by wall-clock as if the process never died. HTTP accepts requests immediately; catch-up runs on a lifespan task started **before** `yield` (same pattern as the stream-cache idle sweep). Until catch-up lands, the public face is `catching_up` (not idle, not a stale track).

Faces are derived, not a column: `catching_up` (process-lifetime until first catch-up), then `skip_pending` (missing/unresolvable current), `idle` (no current), or `current`. Persist clock + queue + banlist only, and only on advance / skip / pick / shutdown.

Upcoming rows in `library.db` are an accepted spoiler. UI, HTTP, WebSocket, and logs must never show or print next songs.

## Picking

Uniform random **album artist** → **album** → eligible track. Eligible: present, duration ≥ 30s, has an album. Lossy tracks are eligible when indexed. Batch of 8; same track at most once per batch; at most 2 tracks per album artist. Banlist: persist at most four picked batches; when a fifth would be appended, keep `[previous, new]` only.

Small-library loosening (in order): drop oldest banlist batches → drop the per-artist cap → shrink the batch to the eligible-track count (no in-batch repeats). If nothing is ≥30s, the station is idle.

Pick-time **ffprobe** is required (`musicweb doctor` and startup fail without it). Bad files are skipped for the process lifetime and are not written to the banlist. Catalog paths go through `Library.resolve`. Encode policy at stream time uses `tech_from_track`, not a second pick-time tech snapshot.

Rules live in `src/musicweb/radio/`; constants are source constants in `config.py`.

## Delivery

Simulation (0 tuners): clock only. No radio prepare/encode.

First Tune-in starts complete-file work so `GET /api/stream?id=&codec=` + Range seek can join the official clock. There is no live stdout pipe, no concat demuxer, no `/api/radio/stream`, and no second encoder. Radio and `/transcode/prepare` share `enqueue_prepare`. Radio must not call `drop_pending_prewarm`. Radio jobs log `log_label` (`radio current` / `radio prewarm`) + profile tag — never path or title.

`tune_in.codec` is only a `browser_listed` profile. Reject `source`, exclusive, and unknown. Lossy ids are never encoded; the client loads `source` when the snapshot is lossy. Changing Streaming while radio chrome is on omits `playIndex` and re-sends `tune_in` with the new profile (`replace: true` may drop radio prewarm until that message or the next advance).

## Client

`/radio` is a third pane (not a ModeBar chip). Desktop shows the tab bar; Radio replaces both library panes (`v-if` unmount, not CSS hide). Opening Radio does not steal the bar. Radio chrome starts at first Tune-in and stays until a library/queue play.

`radio.ts` owns the socket. Connect on Radio tab enter; do not disconnect on leave. Socket stays up for the Radio tab or chrome `stopped` | `tuning` | `tuned`. Audio is a radio-owned `HTMLAudioElement`, not the shared on-demand sink. Now-playing layout matches on-demand: title, then `Artist — album`. No user seek, skip, or pause-in-place. Play = Tune in, pause/stop = Tune out. Lyrics `seekable=false`. Radio does not write listen-stat events.

Media Session: radio-owned metadata; play/pause/stop only. `onDemandControl.ts` owns install/restore/suspend.

## Out of scope

- Remote DJ (skip, request, seek, operator queue view)
- Live stdout / Icecast / HLS / concat radio pipe
- Radio re-encode of lossy into a stream profile
- **Exclusive-mode radio** (companion hog / mpv) — **TODO**. Tune-in stops the hog; radio stays HTML-only until a future design
- Radio listen stats / Stats rankings for radio
- Multi-tenant auth or a public-internet station
- Client-side radio (browser picks its own tracks)

## Guardrails

- Do not log or serialize upcoming ids.
- Do not add a radio FK from station/queue/banlist ids to `tracks.id`.
- Do not treat radio SQLite rows as a secret.
- Do not add a live pipe or a radio-only lossy re-encode without a new product decision.
- Do not import `player.ts` from radio tests or `radio.ts`.
