**Archive.** Decisions in this file were current as of 2026-08-20 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Household 24/7 radio

## Goal

Add one household-wide radio station that runs from process start. With no tuners it only advances a clock (simulation). Listeners Tune in to the current official track through the existing complete-file stream, seek to the WebSocket clock, and get the illusion of a station that was already on air. The UI is a Radio tab plus a radio now-playing face that never shows the upcoming queue.

## Settled decisions

- One household station: every tuner hears the same track at the same official clock.
- Clock starts when the server process is up, including zero listeners.
- Persist clock, current track, upcoming batch, and banlist in SQLite. Restart **catches up** by wall-clock as if the process never died.
- Upcoming rows in `library.db` are an accepted spoiler. UI, HTTP, WebSocket, and logs must never show or print next songs.
- Batch of 8. Pick path: uniform random **album artist** → uniform random **album** → uniform random eligible track.
- Eligible: present (`is_missing` is false), `duration_ms >= 30000`, has an album. Lossy tracks are eligible when indexed.
- Same track at most once per batch. Max **2 tracks per album artist** per batch. No artist cooldown across batches.
- Banlist: accumulate picked batches; the station persists at most four. When appending would make five, persist `[previous, new]` only. The picker is a pure function of the list it is given; `len >= 4` means “use last batch only.”
- Next batch is picked when the last track of the current batch **starts**.
- Small-library loosening, in order: drop oldest banlist batches → drop the per-artist cap → shrink the batch to the eligible-track count (no in-batch repeats). If nothing is ≥30s, the station is idle.
- Pick-time **ffprobe** validity check (`RADIO_PICK_ATTEMPTS = 32` per slot, timeout 15s — same as `transcode/probe.py`). `ffprobe` is a hard startup and `musicweb doctor` requirement.
- Bad file: skip, log, pick another. Do not put a failed probe on the persisted banlist; keep an in-memory skip set for the process lifetime.
- Simulation (0 tuners): clock only. No radio prepare/encode.
- Delivery is **encode + client seek**, not a live stdout pipe. The radio element loads existing `GET /api/stream?id=&codec=` for the **current** track and seeks to the official clock. No `GET /api/radio/stream`. No concat demuxer. No per-tuner ffmpeg.
- Encode only while someone is tuned in. `tune_in` / `tune_out` on the now-playing WebSocket (allowlisted; any other client payload closes the socket). `tune_in.codec` is only a `browser_listed` profile. Reject `source`, exclusive, and unknown (`codec_rejected`). Disconnect clears that tab’s tuner. Every allowlisted message gets one JSON reply: `{ ok: true }` or `{ ok: false, error, face }`. Snapshots are separate frames.
- 0→1 tuners: `radio/prepare.py` chooses current + next-2 ids and calls `transcode/enqueue.py` (`enqueue_prepare`) with `log_label`. Never POST `/api/transcode/prepare`. Never call `drop_pending_prewarm` for radio (`replace` exists only on the HTTP prepare body in `media.py`, which then calls the same helper).
- Tuner codec is the user’s Streaming profile. Lossy is never encoded — that is a property of the track (`is_lossy` / `tech_from_track`), not of the tuner. Client load is `streamUrl(current, snapshot.is_lossy ? SOURCE_TAG : profile)`. Track-change and reconnect re-read `is_lossy` for the URL; they do not send `tune_in` unless the profile changed.
- Changing Streaming while radio chrome is `stopped` / `tuning` / `tuned`: `SettingsModal.chooseStream` **omits** `playIndex` (not a no-op). `settings.ts` stays radio-free. Then `tune_in` with the new profile (idempotent). Reload `/api/stream` only if the current snapshot is lossless. `setStreamCodec` still `requestPrepare({ replace: true })`; dropped on-demand/radio prewarms are accepted until that `tune_in` / next advance.
- HTTP accepts requests immediately. After `check_dependencies()`, construct the station and `asyncio.create_task(radio_worker)` **before** `yield` (same pattern as `idle_sweep_loop`). The worker’s first line is `to_thread(run_catchup)` — do not await catch-up in startup. New `database.session()` inside each threaded call. After each threaded return, one event-loop listener broadcasts WS (stage 04) and refreshes prepare (stage 05). Until catch-up finishes, now-playing is `catching_up` (GET 200, not idle, not a stale track). `tune_in` is rejected with `{ ok: false, error: "station_not_current", face }` — the socket stays open, no tuner, no prepare.
- Idle station: now-playing 200 with idle. Same `station_not_current` reject.
- Faces are not a persisted column. `catching_up` is process-lifetime until the first catch-up returns. After that: missing/unresolvable current id → `skip_pending` (200, no track, no upcoming); `current_track_id is None` → `idle`; else `current`. Persist clock + queue + banlist only, and **only on advance / skip / pick / shutdown** (not every tick). Radio queue/banlist/current ids have no FK to `tracks.id`.
- `RadioStation` holds a process-lifetime `skip_ids` set and passes it into every `pick_batch`. Never re-probe those ids. Rebuild the catalog snapshot only when `scan_state.finished_at` (kind `scan`) changes.
- Wire `position` is a float in seconds, clamped to `[0, duration]`. Station math stays on `duration_ms`. Client runs `fromApiTrack` only when face is `current` and `id` is present.
- Track error at station start: skip, log, continue. Client follows the next WS current. Mid-file encode failure is a load error (3 failures / 10s → toast, stay `stopped`). Station advance and track-change reloads are not failures.
- OS pause / headphone unplug / lock-screen Pause = Tune out **only when no radio load or seek is in flight**. `ended` is never Tune-out (the station clock owns advance).
- Exclusive-mode radio is a TODO. Tune-in stops the hog. Radio audio is a **radio-owned** `HTMLAudioElement`, not the shared `htmlSink` in `player.ts`.
- Radio does not write listen-stat events and does not start a listen cycle. `radio.ts` watches the connectivity store (loss → `tuneOut` + toast). No radio branches in `connectivity.ts` or `maybeStartListenCycle`.
- Mobile: Library | Playlist | Radio. Desktop: tab bar becomes visible; Library and Playlist restore the dual-pane; Radio replaces both panes.
- `radio.ts` owns the socket. `RadioView` calls `connect()` on enter and does **not** disconnect on leave. Socket stays up for the Radio tab or chrome `stopped` | `tuning` | `tuned`. Disconnect only when chrome is `inactive` / `preview` **and** the Radio tab is not showing. `tuneIn()` connects if needed, waits for a snapshot, then sends.
- Opening the Radio tab does not steal the bar. Radio chrome starts at first Tune-in and stays until a library/queue play.
- Tune-in stops on-demand and exclusive without clearing `pl.index` and without `playNext`. A library/queue play tunes out and takes the player.
- While radio chrome is active: session queue is frozen (Playlist remounts it when that tab is open). `RadioNowPlaying` is one SFC with named layouts: `layout="room"` in `RadioView` (main-area, no `#player .player-full` compact grid); `layout="bar"` in PlayerBar’s full slot (existing compact/sheet hooks). Mini is a small third template (`RadioMini`), not a third full now-playing. `NowPlayingFull` stays on-demand.
- After Tune out: stopped radio face stays (bar + Media Session show what is on air). Play = Tune in again.
- On `/radio`, `v-if` **unmounts** library+playlist (`pane === "radio"`). Do not CSS-only hide. Library location stays radio-free (`effectiveLibraryMode` is not taught about radio).
- Now-playing chrome matches on-demand: **title** on its own line, subtitle `Artist — album` (same em-dash join as `PlayerBar` / `NowPlayingFull`). Not `title - artist [album]`.
- Not tuned / tuning: progress follows the official station clock (spinner until playing). Tuned: bar and synced lyrics follow what this device hears (`audio.currentTime` after the instructed seek). If `|heard − official| > 2s`, re-seek. No user seek, skip, or pause. Lyrics `seekable=false`.
- One stored `player.volume`. `setVolume` / `applyVolume` fan out to the radio element while chrome is on. Codec / lossy rows take explicit args; do not add `playSource: "radio"`.
- Media Session: radio-owned metadata writer. Play = Tune in, pause/stop = Tune out, no seek / next / previous. `onDemandControl.ts` owns install/restore **and** `suspendMediaSession` / `restoreMediaSession`. `playerSession` does not import `radio`.
- WS reconnect while `tuned` / `tuning`: `catching_up` / `skip_pending` → stay `tuning`, do not load `/api/stream`, re-send `tune_in` once face is `current`. `idle` → `tuneOut` to `stopped`. `current` → send `tune_in` once (idempotent).
- `tune_in` on an already-registered socket updates that tuner’s codec and is otherwise a no-op. Prepare only if the codec union grew or changed. Do not double-count.
- Next-2 ids never go to the client. Radio prepare logs profile tag + `log_label` (`"radio current"` / `"radio prewarm"`) only — never path, title, or `source.name`.
- Catalog paths go through `Library.resolve`. Encode policy / source tech at stream time uses `tech_from_track` (not a second probe, not pick-snapshot tech).
- CSS is `frontend/css/radio.css`. No `radio/constants.py`; source constants live in `config.py` (server) or next to the radio store (client).

## Design

Radio is a new server package (`src/musicweb/radio/`) plus thin HTTP/WS routes. It is not a client shuffle of the session queue, not Icecast/HLS, and not a second encode pipeline.

**Station.** A singleton clock owns the current track, `track_started_at` (UTC), the remainder of the current batch, the next batch (once the last track has started), and the banlist. A 1-second tick via `asyncio.to_thread` advances when `now >= started_at + duration`. The next track’s `started_at` is the previous end, not “now”. Logging may name the **current** title/artist, mode, and tuner count; it must never list upcoming tracks.

**Picking and persistence.** See [picking.md](./picking.md). `Library.resolve` → snapshot → pure picker (injected RNG, `RADIO_PICK_ATTEMPTS`, caller `skip_ids`) → ffprobe seam → `db/repositories/radio.py`. No `store.py`. Station tests use `init_database` on `tmp_path`.

**Catch-up and faces.** See [station.md](./station.md). `create_task` before `yield`. The worker loads SQLite off the loop, walks the queue by wall-clock, then the public face becomes `current`, `skip_pending`, or `idle`. `catching_up` / `skip_pending` / `idle` refuse `tune_in` (typed error frame) and do not prepare.

**Audio.** No live pipe. While tuner count ≥ 1, the station calls `enqueue_prepare` for the union of tuners’ **profiles**. Lossy ids are skipped inside the helper (`is_lossy`). The client loads `/api/stream` with `SOURCE_TAG` or the profile from the current snapshot’s `is_lossy`. Complete files already Range-seek; FLAC-as-a-file works. The 1-hour idle cache wipe is unchanged — the next Tune-in after a wipe may be cold.

**Now-playing.** In the tick thread (session open), stash a `StationSnapshot` (face, position inputs, current track display/tech fields or `None`). `radio/now_playing.py` is a pure serializer of that snapshot (may call `track_dict` when given a row). The event-loop listener never queries SQLite. `RadioStation` does not import `routes.serializers`. Vite `/api` proxy sets `ws: true`.

**Client.** `/radio` is a third pane. `stores/radio.ts` is chrome + façade and owns the socket. Audio, drift, and the 3/10s cap live under `frontend/src/radio/`. `player.ts` stays on-demand loaders. Stop-sinks and Media Session install/restore/suspend live in `playback/onDemandControl.ts`. Tests of radio logic do not import `player.ts`. Radio never uses OPFS.

## Stage map

1. **ffprobe requirement** — hard dependency before any picker or doctor claim can be honest.
2. **Batch picker** — pure pick/loosen/banlist + resolved catalog snapshot. No clock.
3. **Station clock** — repository persist, catch-up on a `to_thread` task started **before** `yield`, simulation tick, skip set, persist-on-change.
4. **Now-playing API** — snapshot + WS faces (including `skip_pending`), position in seconds, Vite `ws: true`. Tune messages land in stage 05; this stage is read-only WS.
5. **Tuner registry + prepare** — profile-only `tune_in`, typed acks, shared `enqueue_prepare`, 1→0 stop radio prepares. No live ffmpeg.
6. **Radio tab** — route, third tab, `v-if` unmount dual-pane, room layout, connect-on-enter (no unmount disconnect). Depends on stage 04.
7. **Player integration** — chrome × face × socket machine, radio-owned audio, `room`/`bar`/`RadioMini`. Depends on stages 05 and 06.
8. **Living docs** — last so setup, systems, product, and architecture describe encode+seek radio, exclusive-radio TODO, and unchanged on-demand lossy passthrough.

## Out of scope

- Remote DJ (skip, request, seek, operator queue view)
- Live stdout / Icecast / HLS / concat radio pipe
- Radio re-encode of lossy into a stream profile
- Exclusive-mode radio (companion hog / mpv). Document as TODO
- Radio listen stats / Stats rankings for radio
- Spoiling the queue via UI, HTTP, WebSocket, or logs
- Treating `library.db` radio rows as a secret
- Multi-tenant auth or a public-internet station
- Client-side radio (browser picks its own tracks)
- A second encode pipeline beside `Transcoder`
- New lossy formats

## Assumptions

- Complete-file encode plus instructed seek is a good enough “already on air” illusion. First Tune-in after a cold cache waits until `ensure_stream` finishes the current track.
- A LAN household has a handful of concurrent tuners; they share cache files per (track, profile).
- Opening `library.db` to read upcoming radio rows is operator cheating and is accepted.
- NTP steps on the host are rare; wall-clock `track_started_at` is good enough for live position and catch-up.
- First library scan may finish after the station starts; idle-then-pick on a later tick is enough.
- Tracks without an album or with unknown duration are not radio-eligible.
- `ffprobe` on PATH comes with a normal ffmpeg install; requiring it does not add a new vendor.
- Background tabs may stall JS; a 2s drift re-seek keeps the illusion without seeking every WS tick.
- `StreamCacheIdleMiddleware` ignores non-`http` scopes, so the radio WebSocket does not reset the on-demand cache idle timer.
