> **Archive.** Decisions in this file were current as of 2026-08-15 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Diagnostic event capture

## Goal

Give the operator a server-side timeline of client and server events so an Android Chrome PWA playback failure can be reproduced on the phone and read later on the machine that runs the server. This plan is the capture system, not the playback fix.

## Settled decisions

- **No master off switch; a cutoff, not a recorder.** Settings → **Diagnostics** is a `SettingsSelect`: **Errors only** (default) vs **Everything**. Callsites always call `emit`; the mode only decides whether a line is stored or written.
- **Levels.** Envelope `level` is `info` | `warn` | `error`. Errors only stores/writes `error`. Everything stores/writes all three. `warn` is reserved; this plan’s catalog does not use it.
- **One control.** Everything mints a `session_id` (cookie + events) so `musicweb logs show --session` isolates a repro. Switching back to Errors only clears `session_id`. Settings always shows `client_id`. There is no separate session toggle.
- **Same cutoff on both sides.** Client does not IDB/POST `info`/`warn` when quiet. Cookie `musicweb_mode` + header `X-Musicweb-Mode` (`errors` | `everything`) tell the server; `http.stream` / `http.prepare` are not written for that request when the mode is missing or `errors`. Ingest **writes the batch as-is** (no second level filter).
- **Error lines stand alone.** Every `error` event includes the shared failure context in [event-catalog.md](./event-catalog.md) so a quiet-mode Android decode fail is diagnosable without Everything.
- **Storage.** Daily UTC JSONL files at `$MUSICWEB_DATA_DIR/diag/events-YYYY-MM-DD.jsonl`. Client and server lines share one file. CLI filters; do not split trees by device or source.
- **Retention.** Source-constant size cap (~64MB) over the diag dir. Delete oldest day files first. Do not delete the only remaining file (today may overshoot). `musicweb logs purge` still exists.
- **Not the library index.** No Alembic, no `library.db` tables, no `diag.db`.
- **Join keys.** `client_id` (localStorage, one per origin/PWA install) + optional `session_id` + per-`beginLoad` `play_id`. Cookies on `Path=/api` carry them (and the mode) on `<audio src>` and other `/api` requests. `fetch`/POST helpers send the same ids plus mode as headers. Stream URLs stay `/api/stream?id=&codec=` so the 1-hour private browser cache is not busted.
- **Chat.** Transitions, errors, and stream/prepare decisions only. No `timeupdate`, no byte/chunk logs, no `console.*` interceptor. Event names: [event-catalog.md](./event-catalog.md).
- **Client outbox.** In-memory ring plus a separate IndexedDB (`musicweb-diag`, not the downloads DB). Only events that pass the current cutoff enter the outbox. Flush when `canReachServer()`. `sendBeacon`/keepalive on hide. Survives PWA kill. Emit never blocks play.
- **Ingest.** `POST /api/diag/events`, LAN trust, no token. Force `source=client` on written lines. Do not emit events about ingest (no recursion).
- **Server emits from routes**, not the transcoder worker, so lines have `track_id` and never a library filesystem path.
- **Operator surface.** `musicweb logs list|show|tail|purge` reads files on disk (no control socket). Settings: Errors only / Everything + copyable ids. No in-app log viewer.
- **Stdout Python logging is unchanged.** JSONL is an additional structured stream.
- **Out of this plan’s instrumentation:** exclusive-audio companion (Mac), scan, lyrics, cover/artist-image GETs, download-worker internals.

## Design

One append-only event stream. Each line is a JSON object with a shared envelope (`ts`, `source`, `event`, `level`, `client_id`, `session_id`, `play_id`, `data`). Exact field names live in source; the catalog of *which* events this plan adds is [event-catalog.md](./event-catalog.md).

**Server package `musicweb.diag`.** A store appends one line and may delete older day files. An emit helper fills `ts`/`source=server`, copies join keys from a request (header overrides cookie), and no-ops non-error levels when the request mode is `errors` or missing. A small FastAPI router accepts a client batch, validates size, and writes without a second level filter. `ensure_data_dir` creates `diag/`.

**Client module `static/js/diag/`.** Boot assigns or reuses `client_id`, sets the client + mode cookies, hydrates the IDB outbox, and starts flush. `emit(event, data, level)` is fire-and-forget and no-ops when the current mode rejects that level. `beginPlay` (called from `beginLoad`) mints `play_id` and rewrites the play cookie. `setMode('everything'|'errors')` mints or clears `session_id`. `api.js` adds join-key + mode headers on existing helpers; ingest uses its own fetch so a failure there cannot recurse through `apiPost`. `streamUrl` does not grow query params.

**Settings** gains a Diagnostics section: `SettingsSelect` **Errors only** / **Everything**, copyable `client_id`, and `session_id` when Everything. Persist `musicweb.diag.mode` (`errors` default) and `musicweb.diag.sessionId` (absent on Errors only).

**CLI** opens the same directory the server writes. It does not take `musicweb.lock` and does not talk to the control socket.

## Stage map

Store before HTTP, HTTP contract before the client, client plumbing before callsites, both instrumentations before the CLI (so `show` has real names to filter), docs last.

1. **JSONL store + rotation** — nothing else can persist.
2. **Ingest + emit + join-key reader** — the write contract both sides use.
3. **Client logger + IDB + cookies + Settings cutoff** — the phone can ship errors by default and Everything when marked; still no playback callsites.
4. **Client playback-path callsites** — the Android-visible half of the timeline.
5. **Server stream/prepare callsites** — the matching half; depends on 02 only, follows 04 so the first end-to-end repro has both sides.
6. **CLI** — read/purge what 01–05 produced.
7. **Living docs** — systems page, commands, data-dir layout, ownership. Durable; `design.md` is not.

## Out of scope

- Fixing Android Chrome PWA playback.
- Always-off, env-gated capture, or an in-app log viewer.
- SQLite event storage or Alembic.
- Ingest authentication (LAN trust stands).
- Exclusive-audio companion / hog path.
- Scan, lyrics, cover, artist-image, download-worker event streams.
- Replacing stdout `logging`.
- High-frequency clocks (`timeupdate`, buffer snapshots, byte counters).
- Service-worker-originated POSTs (page logs register/skip/fail only).

## Assumptions

- Frontend verification is manual (`uv run musicweb`); no JS test runner.
- `data/` is gitignored; JSONL files are never committed.
- FastAPI ignores unknown stream query params today; we still do not add them.
- Same-origin `Path=/api` cookies are sent by Android Chrome for `<audio src>` and `fetch`.
- A ~64MB cap at transition-only verbosity is enough for days of one-operator use.
- `contextvars` are unnecessary if emit stays on the request thread (routes).
- Separate IDB from downloads so diagnostics still persist when downloads are disabled.
