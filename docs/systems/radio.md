# Household radio

One household-wide 24/7 station. With no tuners it only advances a clock. Listeners Tune in, load the current official track through the existing complete-file stream, and seek to the WebSocket clock.

## Source of truth

- Station clock, picker, prepare: `src/musicweb/radio/`
- Persist: `src/musicweb/db/repositories/radio.py` (models in `db/models.py`)
- HTTP + WebSocket: `src/musicweb/routes/radio.py` (`serialize` of the station snapshot)
- Snapshot track: `SnapshotTrack.from_track` in `src/musicweb/radio/types.py`
- Shared prepare enqueue: `src/musicweb/transcode/enqueue.py`
- Client chrome: `frontend/src/stores/radio.ts`
- Socket only: `frontend/src/radio/runtime.ts`
- Face/load (`onFaceOrTrack`, `loadCurrent`) and radio Media Session: `frontend/src/radio/session.ts`
- Radio-owned audio (`PlaybackSink` on its own element): `frontend/src/radio/audio.ts`
- Forget retain hook: `app.state.retain_stream_ids` (lifespan) + `routes/deps.retain_stream_ids`
- Radio wrapper + mini: `frontend/src/components/radio/`
- Shared now-playing surface: `frontend/src/components/player/NowPlayingView.vue`
- Related: `docs/systems/transcoding.md`, `docs/systems/playback.md`, `docs/systems/exclusive-audio.md`

## Station

The clock starts when the server process is up, including zero listeners. Restart **catches up** by wall-clock as if the process never died. HTTP accepts requests immediately; catch-up runs on a lifespan task started **before** `yield` (same pattern as the stream-cache idle sweep). Until catch-up lands, the public face is `catching_up` (not idle, not a stale track).

Faces are derived, not a column: `catching_up` (process-lifetime until first catch-up), then `skip_pending` (missing/unresolvable current), `idle` (no current), or `current`. Persist clock + queue + banlist only, and only on advance / skip / pick / shutdown. Catch-up and tick share `_step` (catch-up loops until the clock is current; tick takes one step). Rebuild the in-memory catalog when `radio_repo.scan_finished_at` (`ScanState.last_scan_finished_at`) changes — not when a regen job finishes.

Upcoming rows in `library.db` are an accepted spoiler. UI, HTTP, WebSocket, and logs must never show or print next songs.

## Picking

Uniform random **album artist** → **album** → eligible track. Eligible: present, duration ≥ 30s, has an album. Lossy tracks are eligible when indexed. Batch of 8; same track at most once per batch; at most 2 tracks per album artist. Banlist: persist at most four picked batches; when a fifth would be appended, keep `[previous, new]` only.

Small-library loosening (in order): drop oldest banlist batches → drop the per-artist cap → shrink the batch to the eligible-track count (no in-batch repeats). If nothing is ≥30s, the station is idle.

Pick-time **ffprobe** is required (`musicweb doctor` and startup fail without it). Bad files are skipped for the process lifetime and are not written to the banlist. Catalog paths go through `Library.resolve`. Encode policy at stream time uses `tech_from_track`, not a second pick-time tech snapshot.

Rules live in `src/musicweb/radio/`; constants are source constants in `config.py`.

## Delivery

Simulation (0 tuners): clock only. No radio prepare/encode.

First Tune-in starts complete-file work so `GET /api/stream?id=&codec=` + Range seek can join the official clock. There is no live stdout pipe, no concat demuxer, no `/api/radio/stream`, and no second encoder. Radio and `/transcode/prepare` share `enqueue_prepare`. Radio must not call `drop_pending_prewarm`. Radio jobs log `log_label` (`radio current` / `radio prewarm`) + profile tag — never path or title. On-demand `POST /api/transcode/forget` must not evict the station’s current track or any id still remaining on the live radio queue, including in simulation (0 tuners). Already-played rows in the current batch and banlist-only ids are not protected. Forget must not return or log those retained ids.

`tune_in.codec` is only a `browser_listed` profile. Reject `source`, exclusive, and unknown. Lossy ids are never encoded; the client loads `source` when the snapshot is lossy. Changing Streaming while radio chrome is on omits `playIndex` and re-sends `tune_in` with the new profile (`replace: true` may drop radio prewarm until that message or the next advance).

## Client

`/radio` is a third pane (not a ModeBar chip). Desktop shows the tab bar; Radio replaces both library panes (`v-if` unmount, not CSS hide). `#player` is hidden on `/radio` — the Radio pane is the only now-playing surface there. Opening Radio does not auto Tune in. Radio chrome starts at first Tune-in and stays until a library/queue play.

Off `/radio`, mobile shows `RadioMini` only; desktop shows a compact `NowPlayingView` in the player slot. Never both. Cover/title navigate to `/radio`. The room cover is the same album-artist flip peek as on-demand expanded now-playing (shared `NowPlayingView`: `GET /api/artists/{id}`, `canReachServer()` gate). Compact bar and `RadioMini` covers still only navigate to `/radio` — they do not flip. Tune in/out uses `#i-tune-in` / `#i-tune-out` (icon-only on mini; icon+label on room and compact). After Tune out, the stopped face stays until a library/queue play.

`radio/runtime.ts` owns the socket and reconnect. `radio/session.ts` owns `onFaceOrTrack` and `loadCurrent`. Connect on Radio tab enter; do not disconnect on leave. Socket stays up for the Radio tab or chrome `stopped` | `tuning` | `tuned` (one `socketRequired`). `connected` tracks socket open. Audio is a radio-owned `HTMLAudioElement` that implements `PlaybackSink` (`kind: "htmlAudio"`; shared `htmlElement` helper; not the on-demand queue sink). `radio.ts` and `NowPlayingView` do not import `player.ts`. Tune-in calls `become("radio")`; a library/queue play calls `become("queue")`. Radio watches `player.volume` from `playerState.ts`. Chrome is `inactive | stopped | tuning | tuned` (tab-open-without-tune-in is `inactive` + `tabOpen`). Load generation in `session.ts` guards overlapping loads; the station-face handler is the only `loadCurrent` driver. The room is `NowPlayingView` via a thin radio wrapper (`RadioNowPlaying`), not a parallel now-playing tree. Title, then `Artist — album`. Transport is Tune in/out only — no shuffle, prev, next, repeat, or play/pause. Seek is filled and not interactive. A `pause` while the element has `ended` is ignored; `ended` is never Tune-out (the station clock owns advance). Lyrics overlay + toggle, `seekable=false`; radio lyrics open state is local to the wrapper. The room injects `PlaybackStatusLine` only while chrome is `tuned` (`radioPlayState()`: `session: "radio"`, `playSource: "streaming"` + tuner profile, or lossy source fields). Exclusive snap is ignored because session is radio. When chrome is not `tuned`, the room keeps an empty `.np-status-wrap` so extras do not jump. Compact and mini still have no codec line. Radio does not write listen-stat events.

Media Session: radio-owned metadata; play/pause/stop only. `playback/session.ts` owns install/restore/suspend.

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
- Do not evict radio current + remaining via forget (simulation included). Do not `clear_cache` on 1→0 tuners.
- Do not add a radio FK from station/queue/banlist ids to `tracks.id`.
- Do not treat radio SQLite rows as a secret.
- Do not add a live pipe or a radio-only lossy re-encode without a new product decision.
- Do not import `player.ts` from radio tests or `radio.ts`.
