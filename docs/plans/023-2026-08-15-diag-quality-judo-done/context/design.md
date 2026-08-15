> **Archive.** Decisions in this file were current as of 2026-08-15 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Diagnostic quality judo

## Goal

Make the landed diagnostic stack match the thermo-nuclear bar: same operator behavior (Errors only / Everything, JSONL, `musicweb logs`), but emit from existing seams, one write path, one client outbox, and no special-case flags.

## Settled decisions

- **Exclusive failures use `player.load.fail`.** `hardStopCompanion` → `failPlayback` is one path. No silent exclusive flag. No new exclusive event names.
- **All same-origin `/api` fetches share one helper** that attaches diagnostic headers. Keep Path=/api cookies. `requestPrepare` and `clearCache` stop calling raw `fetch`.
- **Player catalog emits stay in `player.js`** at existing seams. No `playerDiag.js` / `diag/player.js` this plan.
- **`failPlayback` emits only `player.load.fail`.** `applyResolvedSource` emits `player.unavailable` when the result is unavailable. Do not fire both on one fail.
- **`player.load.ok` once**, after the final successful `attemptPlay` in `playHtml`. Exclusive success does not gain `load.ok`.
- **One client unacked list.** Memory is what flush and `sendBeacon` read. IDB only persists that list. Delete the `canReachServer` import from `log.js` (POST and keep rows on failure).
- **One Python envelope** and one public `event_files()` used by store rotation and the CLI.
- **Ingest is two-phase:** validate the whole batch, then append; rotate once after the batch.
- **`/api/stream` is one try/except**, not emit-then-raise at each site.
- **Failure context keys** are the catalog set (`track_id`, `play_source`, `profile`, `reason`, `connectivity`) plus event-specific extras (`status`, `detail`, sink codes). Do not alias `codec`/`profile` or `detail`/`reason`.
- **Delete unused** `getMode` / `getClientId` / `getSessionId` / `getPlayId`.

## Design

Plan 022 added a second program beside playback: catalog names in the middle of `playHtml`, five emit-then-raise sites on `stream`, two client outboxes, and three handwritten envelopes. This plan deletes those layers.

**Write path.** `musicweb.diag.envelope` is the only server record shape. `emit` and ingest call it. `store.event_files` is the only `events-YYYY-MM-DD.jsonl` listing. Ingest validates (count, names, data size) then writes, then `maybe_rotate` once.

**Stream.** The handler body is the existing plan/passthrough/encode logic. `HTTPException` (and encode failure mapped to one) is caught once, reject-emitted, re-raised. Success emits once before return.

**Client outbox.** `emit` pushes onto `unacked[]` and mirrors to IDB. Flush POSTs `unacked`, drops acked ids from memory and IDB. Hide `sendBeacon`s `unacked`. No second flush loop. No connectivity import.

**Fetch.** `api.js` owns one `apiFetch` (or equivalent) used by get/post/put/patch/delete, `requestPrepare`, and `clearCache`. Ingest flush stays on its own `fetch` (no `apiPost` recursion).

**Player.** `beginPlay` in `beginLoad`; `player.load.begin` in `playIndex` (track known). `applyResolvedSource` emits resolve vs unavailable. `failPlayback` emits load.fail only. `attemptPlay` keeps HTML `play_reject`. `playHtml` ends with one `load.ok` if the last `result.ok`. Exclusive still uses `failPlayback` on hard stop.

## Stage map

Shared server write helpers first so ingest, stream tests, and the CLI do not invent a fourth envelope. Client outbox next (hide-path judo, no server dep). Fetch helper next so prepare/clear match cookies+headers before stream tests assume them. Stream wrap then player seams (independent, stream first so media.py shrinks before player). CLI reuses `event_files` after it exists. Docs last.

1. **Envelope + ingest honesty** — every later server writer/reader shares one record and one file list.
2. **One client outbox** — deletes the dual-loop and the connectivity cycle.
3. **One `/api` fetch helper** — headers stop being half-applied.
4. **Stream one try** — media route stops growing emit-then-raise sites.
5. **Player seam emits** — catalog names leave the `playHtml` fallback tree.
6. **CLI reuses `event_files`** — depends on stage 01.
7. **Living docs** — durable guardrails; `design.md` is not.

## Out of scope

- New diagnostic events or changing Errors only / Everything.
- `playerDiag.js` / moving player emits out of `player.js`.
- Adding `httpx` / TestClient as a project dependency.
- Exclusive companion protocol or hog path.
- High-frequency clocks, ingest auth, SQLite events.
- Rewriting `tail --follow` into a new file watcher.

## Assumptions

- Frontend verification is still manual; no JS test runner.
- `create_app()` is too heavy for media tests; call `stream()` with a mocked Request / db / library / transcoder (same style as ingest tests).
- ESM cycle `log.js` ↔ `connectivity.js` is gone after stage 02; `connectivity.js` may still import `emit`.
- Plan 022 catalog names stay; only *where* they fire changes.
- `player.js` stays under 1k after the collapse (net lines should drop).
