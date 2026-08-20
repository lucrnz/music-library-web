**Archive.** Decisions in this file were current as of 2026-08-20 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Playback stats

## Goal

Count household listens so the Stats browse mode can show the most-played artists and tracks, and so later pre-encode work has a durable track × profile × play-source history. Collection is always on. There is no settings toggle and no wipe in this plan.

## Settled decisions

- **Household pool.** No user accounts. Every device that reaches the server contributes to one ranking. No per-device split and no named members.
- **Always-on collection.** The earlier Settings toggle idea is withdrawn. No opt-out, no clear button, no reset CLI in this plan. The library Settings gear stays visible on `/stats`.
- **A listen is 70% accumulated media time.** One play cycle (a successful load, or a restart near 0 such as repeat-one / `playPrev`) may fire once when accumulated playing time is ≥ 70% of duration. Pauses do not add. Seek jumps (forward or back) do not add and do not subtract. 2× speed still needs 70% of the file’s duration in media time. If duration is never known, count only on `ended` / companion `eof`. Full rules: [listen-policy.md](listen-policy.md).
- **Cold-load resume does not credit skipped time.** `flushPendingResume` seeks after a successful load. That seek is a jump: it does not add to accumulated time. 70% must be heard *after* the resume seek. Finishing a track from a resume at 80% does **not** count. No special `onEnded` credit.
- **All sinks.** Stream, downloaded OPFS, and exclusive companion all count. Start the cycle after a successful load in **both** `playHtml` and `playExclusive`. Do not key off `player.load.ok` (html-only). Do not infer listens from `GET /api/stream` or prepare.
- **Offline outbox.** Pending listens live in `localStorage` key `musicweb.listens.pending.v1` (JSON array). Same durability as playback position: quota/thrown write drops the listen and must not POST. Two tabs last-write-wins. Flush mutex in one tab. No IndexedDB. No `HealthWorkSource`. Flush owns retry: 1s start, double, cap 60s (copied numbers from `connectivity.ts`, not a shared helper). Enqueue, visibility, and boot **attempt** POST even when `canReachServer()` is false — the POST is the probe. 204 deletes the row, resets backoff, and **calls** `reportSuccess()`. 422 deletes and does not report success. Network/5xx keep the row, `reportFailure` for the banner, then local backoff. `onConnectivityRecovered` is an extra kick, not the only path back. Client-generated event ids make retries idempotent. `counted_at` is the device time the 70% threshold was crossed so a delayed flush stays in the correct month.
- **One listen, one POST.** `POST /api/listens` accepts a single JSON object. `204` means inserted or duplicate id. `422` means drop (poison). Anything else keeps the row. No `items[]`, no batch, no per-index errors.
- **Event log, not counters.** Each listen is a row: event id, track id, profile tag, play source (`streaming` | `downloaded`), `counted_at` (normalized on ingest via `parse_iso_utc` / `utc_now_iso`), and a `month_key` (`YYYY-MM` in the **server local timezone** at ingest, derived from the parsed `counted_at`). Exclusive plays are `streaming` plus a `flac_*` profile tag.
- **Artist rank uses performing artist** (`tracks.artist_id`). A listen with a null `artist_id` still counts the track and is omitted from the artist list.
- **UI:** ModeBar chip **Stats** → `/stats` (all-time) or `/stats?range=7d|30d|YYYY-MM`. One time-chip row, then dedicated top-100 **Artists** and **Tracks** rows (cover, label, play count). `StatsTrackRow` shows `LossyMark`. Artist tap → `/artists/:id`. Track tap → `playOrQueueTrack`. Online-only page. Hide list/grid/tree on this mode. No ⋯, no +, no chevron-as-action. Do not special-case `ArtistRow` / `TrackRow`.
- **Empty copy.** Both lists empty **and** `months` empty: `No listening history yet`. Selected range empty but `months.length > 0`: `No listens in this range`.
- **Ranking types.** `ListenTrack = Track & { playCount, lastCountedAt }` via `fromApiTrack`. `ListenArtist = ArtistListItem & { play_count, last_counted_at }`. Do not put `playCount` on `Track`. Do not write `fromApiArtist`.
- **Time chips:** always All-time, Last 7 days, Last 30 days; then only months that have at least one listen, newest first. Current-year months are the month word (`August`). Older years are `2025 — December`. Last 7 / 30 days are rolling 7×24h / 30×24h. Calendar months use the server host timezone. Rank by play count descending, then most recent listen descending.
- **Pre-encode stays out of product scope.** Profile tag and play source are stored on every event so a later job can read them. No codec ranking page and no pre-warm job in this plan.

## Design

Today the server sees stream/prepare HTTP and optional diagnostic JSONL. Neither is a listen: Range/seeks/downloads over-count, offline OPFS plays never hit `/api/stream`, and diagnostics must not live in `library.db`.

The client already knows when a sink is playing (`onSinkTime`, `onSinkEnded`, repeat-one seek 0, `playPrev` restart, `playIndex` load generation). A **pure accumulator** (no `player.ts` import) owns the 70% / cycle rules so they can be unit-tested. A thin **`listens/bridge.ts`** adapter is the only player-facing API (`startCycle`, `onTime`, `onEnded`, `onRestart`, `discard`). `player.ts` only calls it.

The outbox appends the event to the localStorage array first, then `POST /api/listens` via `apiFetch` (never `apiPost` — that `json()`s a 204). Duplicate primary keys are success. Unknown track ids (`insert_listen` looks up `Track` first → `ListenUnknownTrack`) and validation errors drop the row; network failures keep it and back off locally. Boot, visibility, and enqueue always attempt the POST; `onConnectivityRecovered` is extra. Failed POST calls `reportFailure`. 204 **calls** `reportSuccess()`.

`routes/listens.py` owns Pydantic body, `parse_range` (public token `all` | `7d` | `30d` | `YYYY-MM`), `host_timezone_name`, and handler tests. The repository owns insert, ranks, `month_key_for`, and domain errors only.

SQLite gains a `listen_events` table (Alembic `010`). Rankings are `GROUP BY` over that table joined to `tracks` / `artists` — no materialized counters. `GET /api/library/stats` stays index counts. Ingest is `POST /api/listens`; rankings are `GET /api/listens/rankings`.

`/stats` is a first-class library browse mode (bookmarkable, ModeBar, same `LibraryView` shell). When `mode === "stats"`, skip `loadLibraryPage` / `LibraryView.load()` entirely (five-line early return) and mount `StatsView`. Treat stats like search in `isTreeActive`. Do not edit `treeNavigation.ts`. Rankings 200 calls `noteServerReachable()`; fetch throw calls `noteServerUnreachable()`. No ranking cache.

## Stage map

Schema and ranking SQL are the shared contract; the HTTP surface sits on them; the client cannot flush or render without that surface. The accumulator is independent of HTTP and must exist before player wiring, or `player.ts` will grow untested policy (the same split as resume position). The outbox needs both an event to enqueue and an API to POST. The Stats page needs the GET rankings route and can ship after collection. Living docs last so the systems page describes what actually shipped.

1. **Listen-events schema** — table, model, repository (`month_key_for`, insert, ranks). Nothing HTTP or UI.
2. **Listens API** — route parse/validate, single-object ingest, range rankings. Depends on 01.
3. **Listen accumulator** — 70% / cycle module and tests. Independent of 01–02; before player wiring.
4. **Outbox and player** — localStorage queue, flush-owned retry, `listens/bridge.ts` + `player.ts` call sites, `initListens` in `flush.ts`. Depends on 02 and 03.
5. **Stats UI** — route, ModeBar, chips, dedicated rows. Depends on 02; collection can be empty.
6. **Living docs** — durable contract under `docs/systems/` and the pages that must point at it.

## Out of scope

- Pre-encode / pre-reencode / cache pre-warm of popular (track, profile) pairs
- Settings toggle, privacy opt-out, or any wipe/reset UI or CLI
- Hiding the library Settings gear on `/stats`
- User accounts, per-device charts, or a “who is listening” picker
- Last.fm / external scrobbling
- A visible codec or play-source ranking
- Inferring listens from stream, prepare, or diagnostic JSONL
- Offline cached rankings
- Pagination past top 100, ⋯ menus on stats rows, list/grid/tree for Stats
- Extending `HealthWorkSource` or adding a `musicweb-listens` IndexedDB
- A `src/musicweb/listens/` package
- Widening `Track` / `track_dict` / `artist_dict` / `ArtistListItem` with play counts
- Recently-played as its own surface (last listen is only a tie-break)

## Assumptions

- The host timezone is stable enough that `month_key` assigned at ingest from `counted_at` matches how the operator thinks about calendar months. The mapping is `datetime.now().astimezone().tzinfo` (often a fixed offset, not `ZoneInfo`). DST-boundary mis-binning is accepted. Do not add `tzlocal` or rewrite keys.
- Missing files stay as `tracks.is_missing` rows (history-friendly identity). Hard deletes are rare; `ON DELETE CASCADE` from `listen_events.track_id` is acceptable.
- Personal-library listen volume is fine for SQLite `GROUP BY` with indexes on `counted_at`, `month_key`, and `track_id`.
- `playOrQueueTrack` remains the library track-row tap (queue + play if idle/paused).
- The existing SPA catch-all already serves `/stats` HTML.
- Exclusive companion time/eof already reach `onSinkTime` / `onSinkEnded`; no second exclusive logger.
- Two-tab last-write-wins on the pending array is acceptable (same as playback position).
- A device clock more than 5 minutes ahead yields 422; the outbox drops that row permanently.
- Cold-load resume is a seek. 70% must be accumulated after that seek. Finishing from a resume at ≥ 70% of duration without hearing 70% after the seek does not count.
