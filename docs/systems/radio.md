# Household radio

One household-wide 24/7 station. With no tuners it only advances a clock. Listeners Tune in, load the current official track (local download or `/api/stream`, same **When a download exists** policy as queue play), and seek to the WebSocket clock.

## Source of truth

- Station clock, picker, prepare: `src/musicweb/radio/`
- Persist: `src/musicweb/db/repositories/radio.py` (models in `db/models.py`)
- HTTP + WebSocket: `src/musicweb/routes/radio.py` (`serialize` of the station snapshot)
- Snapshot track: `SnapshotTrack.from_track` in `src/musicweb/radio/types.py`
- Shared prepare enqueue: `src/musicweb/transcode/enqueue.py`
- Client chrome: `frontend/src/stores/radio.ts`
- Socket only: `frontend/src/radio/runtime.ts`
- Face/load (`onFaceOrTrack`, `loadCurrent`) and radio Media Session: `frontend/src/radio/session.ts`
- Radio-owned audio (`PlaybackSink`, HTML or companion): `frontend/src/radio/audio.ts`
- Exclusive delivery (no sink): `frontend/src/playback/exclusiveDelivery.ts`
- Forget retain hook: `app.state.retain_stream_ids` (lifespan) + `routes/deps.retain_stream_ids`
- Radio wrapper + mini: `frontend/src/components/radio/`
- Shared now-playing surface: `frontend/src/components/player/NowPlayingView.vue`
- Related: `docs/systems/transcoding.md`, `docs/systems/playback.md`, `docs/systems/exclusive-audio.md`

## Station

The clock starts when the server process is up, including zero listeners. Restart **catches up** by wall-clock as if the process never died. HTTP accepts requests immediately; catch-up runs on a lifespan task started **before** `yield` (same pattern as the stream-cache idle sweep). Until catch-up lands, the public face is `catching_up` (not idle, not a stale track).

Faces are derived, not a column: `catching_up` (process-lifetime until first catch-up), then `skip_pending` (missing/unresolvable current), `idle` (no current), or `current`. Persist clock + queue + banlist only, and only on advance / skip / pick / shutdown. Catch-up and tick share `_step` (catch-up loops until the clock is current; tick takes one step). Rebuild the in-memory catalog when `radio_repo.scan_finished_at` (`ScanState.last_scan_finished_at`) changes — not when a regen job finishes.

Upcoming rows in `library.db` are an accepted spoiler. UI, HTTP, WebSocket, and logs must never show or print next songs. The local debug CLI `musicweb radio` may print upcoming and banlist ids only with `--spoilers`.

## Picking

Uniform random **album artist** → **album** → eligible track. Eligible: present, duration ≥ 30s, has an album. Lossy tracks are eligible when indexed. Batch of 8; same track at most once per batch; at most 2 tracks per album artist. Banlist: persist at most four picked batches; when a fifth would be appended, keep `[previous, new]` only.

Small-library loosening (in order): drop oldest banlist batches → drop the per-artist cap → shrink the batch to the eligible-track count (no in-batch repeats). If nothing is ≥30s, the station is idle.

Pick-time **ffprobe** is required (`musicweb doctor` and startup fail without it). Bad files are skipped for the process lifetime and are not written to the banlist. Catalog paths go through `Library.resolve`. Encode policy at stream time uses `tech_from_track`, not a second pick-time tech snapshot.

Rules live in `src/musicweb/radio/`; constants are source constants in `config.py`.

## Delivery

Simulation (0 tuners): clock only. No radio prepare/encode.

First Tune-in starts complete-file work so other tuners can `GET /api/stream?id=&codec=` + Range seek to join the official clock. This tuner’s element may instead load an OPFS blob when `resolvePlaySource` + `playbackPolicy` prefer the local file — household prepare does not change. There is no live stdout pipe, no concat demuxer, no `/api/radio/stream`, and no second encoder. Radio and `/transcode/prepare` share `enqueue_prepare`. Radio must not call `drop_pending_prewarm`. Radio jobs log `log_label` (`radio current` / `radio prewarm`) + profile tag — never path or title. On-demand `POST /api/transcode/forget` must not evict the station’s current track or any id still remaining on the live radio queue, including in simulation (0 tuners). Already-played rows in the current batch and banlist-only ids are not protected. Forget must not return or log those retained ids.

`tune_in.codec` is only a `browser_listed` profile. Reject `source`, exclusive, and unknown. Household prepare is unchanged. Lossy ids are never encoded; when this client streams a lossy snapshot it loads `source`. When exclusive is enabled, this tuner still sends that browser codec, then `loadCurrent` uses `exclusiveDelivery` (locker / exclusive FLAC tag / lossy `source`) on the companion `radioAudio` backend and may `requestPrepare` the current exclusive tag only. Changing Streaming while radio chrome is on omits `playIndex` and re-sends `tune_in` with the new profile (`replace: true` may drop radio prewarm until that message or the next advance), then `loadCurrent` re-resolves. Exclusive enabled / format mode / device preference changes also re-resolve while `tuning` / `tuned`.

## Client

Mobile `/radio` is a third pane (not a ModeBar chip): `App.vue` **`v-if` unmounts** library+playlist and hides `#player`. Desktop hides `#tab-bar` and never unmounts the dual-pane. Radio is chrome: `RadioNowPlaying` `layout="room"` occupies the same expanded `#player` right rail as queue now-playing. `player.railFace` (`queue` | `radio`) is the explicit occupant — a library/queue play does not steal the rail. The Queue header Radio icon toggles the rail (`toggleRadioRail`); open/closed and face persist. Desktop `/radio` opens the rail and `replace`s to `ui.lastLibrary`. Crossing 900px keeps the radio surface (mobile `/radio` ↔ desktop rail). `setTabOpen` is owned by `App.vue` (desktop rail or mobile `/radio`). Opening Radio does not auto Tune in. Radio chrome starts at first Tune-in and stays until a library/queue play.

Off the radio room, mobile shows `RadioMini` only; desktop shows a compact `NowPlayingView` in the player slot. Never both. Compact cover/title open the radio rail on desktop and navigate to `/radio` on mobile. The room cover is the same album-artist flip peek as on-demand expanded now-playing (shared `NowPlayingView`: `GET /api/artists/{id}`, `canReachServer()` gate). Compact bar and `RadioMini` covers do not flip. Tune in/out uses `#i-tune-in` / `#i-tune-out` (icon-only on mini; icon+label on room and compact). After Tune out, the stopped face stays until a library/queue play.

`radio/runtime.ts` owns the socket and reconnect. `radio/session.ts` owns `onFaceOrTrack` and `loadCurrent`. `radio/rejoin.ts` is the backoff clock; `radio/hold.ts` is the 8 s join-hold clock; `stores/radio.ts` owns the singleton (`sendTuneIn`, connectivity, reconnect). Exclusive off: `loadCurrent` calls `resolvePlaySource` (not `resolvePlayIntent`) with `offline: false` while the tuner socket is up, `enabled: downloads.enabled`, and `activeStreamCodec` = `source` when the official track is lossy, else the tuner Streaming profile. Exclusive on: `exclusiveDelivery` + `radioAudio.setBackend("companion")` (locker, exclusive FLAC tag, or lossy `source`); unarmed exclusive hard-fails and stays `tuning` (toast + Settings on `exclusive_needs_device`). A failed local file is `markTrackBroken` then reminted on the same generation (HTML: `/api/stream`; exclusive: `exclusiveDelivery` with no locker). Connect when the radio surface opens (`tabOpen`); do not disconnect on leave. Socket stays up for the radio surface or chrome `stopped` | `tuning` | `tuned` (one `socketRequired`). `connected` tracks socket open. Audio is radio-owned `createRadioAudio()` (`htmlAudio` or `companion`; not the on-demand queue sink). `radio.ts` and `NowPlayingView` do not import `player.ts`. Tune-in calls `become("radio")`; a library/queue play calls `become("queue")`. `playerPrefs` owns the one volume `watch` (`initOutputVolume` from `main.ts` before `createApp`); radio subscribes `radioAudio.setVolume` from `initRadioListeners()` (same boot, no component). StreamCodec, playbackPolicy, exclusive enabled/format/device, and connectivity watches live in that same init, not in `connect()` (policy and exclusive still re-resolve while `tuning` / `tuned`). Chrome is `inactive | stopped | tuning | tuned` (tab-open-without-tune-in is `inactive` + `tabOpen`). Load generation in `session.ts` guards overlapping loads; the station-face handler is the snapshot `loadCurrent` driver. The room is `NowPlayingView` via a thin radio wrapper (`RadioNowPlaying`), not a parallel now-playing tree. Title, then `Artist — album`. Transport is Tune in/out only — no shuffle, prev, next, repeat, or play/pause. Seek is filled and not interactive. A `pause` while the element has `ended` is ignored; `ended` is never Tune-out (the station clock owns advance). Chrome becomes `tuning` as soon as the official current id (or delivery) must reload, and stays `tuning` until load → seek → play succeeds. Chrome becomes `tuned` on that `play()`; an 8 s hold then runs. HTML and Media Session `pause` during the hold stay in session (`tuning` + the existing 1 s → 8 s `schedule`); they Tune out only after the hold completes (element not `ended`; load/seek in flight still ignored). Official `ended` during the hold cancels the hold and does not retry that load. Media Session `stop` and the Tune-out tap still leave immediately. Station idle Tunes out. Load, play, socket, `tune_in`, and connectivity failures do not Tune out — they stay `tuning` and retry (`sendTuneIn` when the socket is open, then `loadCurrent`) on a 1 s backoff doubling to 8 s, with an immediate kick on a new current snapshot, reconnect, and connectivity `online`. Radio `load` waits at most 8 s for `canplay` (companion: first duration). Retryable failures are silent. Lyrics overlay + toggle, `seekable=false`; radio lyrics open state is local to the wrapper. The room injects `PlaybackStatusLine` only while chrome is `tuned` (`radioPlayState()`: `session: "radio"`, real `playSource` + local catalog profile when downloaded, or tuner profile when streaming; exclusive on: exclusive tag, no tuner fallback; lossy `playProfileId` stays null so the line uses source-format fields). Exclusive snap is passed when exclusive is enabled. When chrome is not `tuned`, the room keeps an empty `.np-status-wrap` so extras do not jump. Compact and mini still have no codec line.

Media Session: radio-owned metadata; play/pause/stop only. `playback/session.ts` owns install/restore/suspend.

## Debug CLI

`musicweb radio` is a local, live-server debug tool on the control socket (not HTTP, not the radio WebSocket). It can skip, inject-play, re-pick upcoming, reset, and clear process `skip_ids`. `--spoilers` is required to print upcoming or banlist ids. Skip, play (when current changes), and reset push the same now-playing snapshot a tick already sends so tuned-in clients follow; there are no new WebSocket action types.

## Out of scope

- Remote DJ over HTTP/WebSocket/UI (skip, request, seek, operator queue view). Local `musicweb radio` on the control socket is the debug exception — see Debug CLI.
- Live stdout / Icecast / HLS / concat radio pipe
- Radio re-encode of lossy into a stream profile
- Multi-tenant auth or a public-internet station
- Client-side radio (browser picks its own tracks)

## Guardrails

- Do not log or serialize upcoming ids (HTTP, WebSocket, UI, diagnostic logs). The only allowed printer is `musicweb radio` with `--spoilers`.
- Do not evict radio current + remaining via forget (simulation included). Do not `clear_cache` on 1→0 tuners.
- Do not add a radio FK from station/queue/banlist ids to `tracks.id`.
- Do not treat radio SQLite rows as a secret.
- Do not add a live pipe or a radio-only lossy re-encode without a new product decision.
- Do not import `player.ts` from radio tests or `radio.ts`.
- Do not call `resolvePlayIntent` from radio. Exclusive off: `resolvePlaySource` in `session.ts`. Exclusive on: `exclusiveDelivery` (no sink) then the radio companion backend.
- `maybeReseek` uses `radioAudio.duration` / `currentTime`, not `radioAudio.el`.
- Radio is not offline: Tune-in still requires the WebSocket clock even when a download exists.
- Do not skip `enqueue_prepare` because this tuner has a download. Prepare is household-wide.
- `createRadioAudio` returns one object with live getters (`currentTime`, `paused`, `ended`, `loadInFlight`, `seekInFlight`, `duration`) and `sink`. Do not object-spread that object to attach `PlaybackSink` — spread copies getter values at construction (`currentTime` stays `0`), so tuned `heardPosition` / `maybeReseek` see `0` and every tick reseeks.
- Do not Tune out on official advance, skip-pending, catch-up, load/play error, or connectivity loss. Do not Tune out on a `pause` or `error` while the join hold is pending. Do not treat `play()` success as the end of the join. The rejoin clock must not call `tuneOut()`. Do not resurrect a failure-cap Tune-out.
- Do not register a Vue `watch` from `connect()` or RadioView `onMounted`. Do not attach the volume apply watch to a component effect scope.
