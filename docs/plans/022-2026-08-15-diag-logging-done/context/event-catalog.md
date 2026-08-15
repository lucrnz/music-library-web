# Event catalog (this plan)

Implementation contract for stages 02–05. Exact JSON keys live in source; this list is **which events fire, at what level, and why**. Do not log ingest, and do not add names outside this list in this plan.

Envelope on every line: `ts` (UTC), `source` (`client`|`server`), `event`, `level` (`info`|`warn`|`error`), `client_id`, `session_id`, `play_id`, `data`. Null join keys when unknown. `data` never contains a library filesystem path.

`warn` is reserved; no catalog row uses it in this plan.

Errors only persists/writes `error`. Everything persists/writes every level. Callsites always `emit`; they do not branch on the dropdown.

## Failure context (`error` only)

Every `error` line includes this object (nulls when unknown) so a quiet-mode failure stands alone:

- `track_id`
- `play_source` (`streaming` | `downloaded` | `unavailable` | `none`)
- `profile` (stream/download tag)
- `reason` (play-block / fail reason when one exists)
- `connectivity` (`online` | `offline` | `server_down`)
- plus the event-specific technical fields in the tables below (sink media codes, HTTP status, exception name)

## Client

| Event | Level | When | `data` intent |
|-------|-------|------|----------------|
| `diag.boot` | info | Logger init (once per page lifetime) | UA, `display-mode` / standalone, origin, `isSecureContext` |
| `player.load.begin` | info | `beginLoad` / `playIndex` start | `track_id`, queue `index` |
| `player.resolve` | info | After `resolvePlaySource` returns a **non-unavailable** result | `type`, profile tag |
| `player.load.ok` | info | HTML sink `load` resolved | `play_source`, profile tag |
| `player.load.fail` | error | `attemptPlay` rejected or `failPlayback` | failure context + message |
| `player.unavailable` | error | Resolve or fail set `unavailable` | failure context |
| `sink.html.error` | error | HTML `error` after the empty-src guard **and** after `playSource === "none"` no-op | failure context + `media_code`, `network_state`, `ready_state` (no raw `src` query) |
| `sink.html.play_reject` | error | `audio.play()` / `load` threw | failure context + DOM exception `name` + message |
| `connectivity.state` | info | `setState` actually changes | `from`, `to` |
| `pwa.sw` | info, or error when `result=error` | End of `doRegister` | `result`: `registered` \| `skipped_insecure` \| `skipped_origin` \| `unsupported` \| `error`; message when useful |
| `codec.probe.summary` | info | Once after `loadCodecs` filter | Catalog profile ids vs ids kept by decode probe (not per-fixture) |

## Server

Emit from **routes** (request thread), never from `transcode/worker.py`. `emit` no-ops when the request mode is missing/`errors` and `level` is not `error`.

| Event | Level | When | `data` intent |
|-------|-------|------|----------------|
| `http.stream` | info | `/api/stream` is about to return a file | `track_id`, `codec`, `plan` (`passthrough`\|`encode`), `cache` (`ready`\|`encoded` when encode path) |
| `http.stream.reject` | error | 400 / 404 / 409 (and ensure_stream failure) | failure context + `codec`, status, short detail |
| `http.prepare` | info | `/api/transcode/prepare` returns | `codec`, `urgent`, count fields already returned to the client |

No `http.diag.*`. No per-id prepare lines (prepare may list up to 1000 ids).
