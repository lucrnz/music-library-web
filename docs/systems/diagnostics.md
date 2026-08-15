# Diagnostics

Structured client and server events stored on the library host so an operator can reproduce a phone playback failure and read the timeline later. This is a capture system, not a playback fix.

## Source of truth

- Store, emit, join keys: `src/musicweb/diag/`
- Ingest route: `src/musicweb/routes/diag.py`
- Stream / prepare callsites: `src/musicweb/routes/media.py`
- Client logger + outbox: `src/musicweb/static/js/diag/`
- Settings cutoff: `src/musicweb/static/js/components/settings/SettingsModal.js`
- CLI: `src/musicweb/cli/logs.py`
- Size cap constant: `src/musicweb/config.py`
- Related: `docs/systems/playback.md`, `docs/systems/connectivity.md`, `docs/systems/pwa.md`

## Purpose

The installed Android PWA cannot be remote-debugged reliably. Events from the player, HTML sink, reachability, service-worker registration, and stream/prepare routes are written as daily JSONL under the data directory. The operator reads them with `musicweb logs` on the server machine.

## Cutoff (not an off switch)

Settings → **Diagnostics** is **Errors only** (default) vs **Everything**.

- Callsites always emit. The dropdown only decides whether a line is stored or written.
- Errors only transmits failure events (playback errors include a self-contained technical context).
- Everything transmits the full diagnostic catalog (transitions and stream/prepare decisions — still not high-frequency clocks) and mints a session id so `musicweb logs show --session …` isolates a repro. Switching back to Errors only clears that session.

There is no master off switch and no second instrumentation path.

## Storage

Daily UTC files `$MUSICWEB_DATA_DIR/diag/events-YYYY-MM-DD.jsonl`. Client and server lines share one file. A source-constant size cap deletes oldest day files first and never deletes the only remaining file. Process-temp stream cache is unrelated; these files survive restart.

Not the library index: no Alembic, no extra tables.

## Join keys and stream URLs

A stable per-install client id, optional session id (Everything only), and a per-load play id travel on same-origin `/api` cookies (and matching fetch headers). Stream URLs stay `/api/stream?id=&codec=` so the browser cache key is unchanged. Missing mode on a request is treated as Errors only.

## Client outbox

Events that pass the current cutoff go onto one in-memory unacked list. IndexedDB (`musicweb-diag`, not the downloads database) only persists that list. Flush and hide/unload sendBeacon both read the same list. A failed POST leaves the rows in place. Emit never blocks play. Ingest writes whatever it receives (no second level filter) and does not log itself.

## Operator read path

`musicweb logs list|show|tail|purge` reads the files on disk. It does not take the data-dir lock or talk to the control socket. Typical filters: `--session` after an Everything repro, or `--level error` for quiet-mode failures. Exact flags: `uv run musicweb logs --help`.

Stdout Python `logging` is unchanged.

## Guardrails

- LAN trust: no ingest token. Same security model as the rest of `/api`.
- Do not put library filesystem paths in event data.
- Do not log ingest, and do not emit from the transcoder worker (routes own server events so they have track ids).
- Do not add stream-URL query params for diagnostics.
- Do not store events in `library.db`.
- Do not add `timeupdate` / byte / chunk streams.
- Exclusive-audio companion, scan, lyrics, covers, and the download worker are out of this system’s instrumentation.
- Playback events fire from existing player state seams. Do not add a silent exclusive-only fail path or a second exclusive logger.
- One client outbox: the memory list plus an IDB mirror of that list. Do not add a second flush buffer. Do not trim IDB independently of that list.
- All same-origin `/api` fetches share the client helper. Ingest flush stays a dedicated request so it cannot recurse through that helper.
- Ingest validates the whole batch; the store writes it in one append (rotation included). Do not rotate from the ingest route.
- Stream reject emit is one exception path on the route, not a site before each raise. Success emit happens once after the file is chosen.
- The CLI lists event files through the store module. Do not copy a second directory walker.
