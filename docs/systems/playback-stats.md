# Playback stats

Household listen history for the **Stats** browse mode (most-played artists and tracks). Collection is always on. There is no settings toggle and no wipe.

This page owns the listen contract. Exact columns, JSON fields, and route wiring live in source — see Source of truth. Do not treat `docs/plans/` as the living spec.

`GET /api/library/stats` and the `musicweb stats` CLI remain **index counts** (how many artists/albums/tracks). They are not listen rankings.

## Source of truth

- Event row and rankings SQL: `src/musicweb/db/models.py`, `src/musicweb/db/repositories/listens.py`
- HTTP ingest and rankings: `src/musicweb/routes/listens.py`
- 65% cycle, outbox, flush, chips: `frontend/src/listens/`
- Player call sites: sink time/ended in `frontend/src/stores/player.ts`; cycle start after successful load in `frontend/src/playback/load.ts`
- Radio call sites: start after a successful tuned load, time/ended, and discard in `frontend/src/radio/session.ts`; Tune out / leave also discard via `frontend/src/stores/radio.ts`
- Stats browse UI: `frontend/src/components/stats/`
- Related: `docs/systems/playback.md` (delivery, not listens), `docs/systems/radio.md`, `docs/systems/diagnostics.md` (JSONL, not listens)

## What a listen is

A listen is **65% accumulated media time** in one play cycle (successful load, or a restart near 0 such as repeat-one / previous-track seek-0). Pauses and seek jumps do not add. Playback rate is not a special case: media-time deltas already require 65% of the file.

Cold-load resume is a seek. Time skipped by the resume jump does not count. Finishing from a late resume without hearing 65% after that seek does not count.

All sinks count: stream, downloaded OPFS, and exclusive companion. Start the cycle after a successful html or exclusive load. Radio **does** start a cycle after a successful tuned load (load + seek-to-clock + play), only while this client is `tuned`, with the same 65% / pause / seek / late-resume rules. The Tune-in seek is a cold-load resume. Tune-out discards the cycle (Stop, not Pause); two halves on the same official play do not add. Each tuned-in client posts independently. Tab-open, `tuning`, `stopped`, and the station clock with no this-client tune-in do not start a cycle. Do **not** infer listens from `GET /api/stream`, prepare, diagnostic JSONL, or the station clock.

If duration is never known, count only on ended / companion eof.

## Where events live

Each counted listen is a row in the SQLite index (event id, track, profile tag, play source, **origin** (`queue` | `radio`), counted time, calendar month in the **server host timezone**). Omitted ingest `origin` and existing rows are `queue`. Rankings are `GROUP BY` over that log — no materialized counters and no origin filter. Performing artist (`tracks.artist_id`) keys the artist list. Missing tracks still count. `play_source` is delivery (`streaming` | `downloaded`); exclusive companion is still `origin=queue`.

The client fires the event, writes it to `localStorage` (`musicweb.listens.pending.v1`) first, then `POST /api/listens` via `apiFetch` (never `apiPost` — that JSON-parses a 204). Flush owns retry; the POST is the probe. Do not gate on `canReachServer()`. A 204 deletes the row and calls `reportSuccess()`. A 422 deletes and does not report success. Network / 5xx keep the row, `reportFailure`, then local backoff. Do not add a `HealthWorkSource`. Do not use the diagnostics outbox or a listens IndexedDB.

Unknown track ids are rejected at ingest (lookup before insert). Duplicate event ids are success.

## Stats UI

ModeBar **Stats** → `/stats` (all-time) or `/stats?range=7d|30d|YYYY-MM`. Bookmarkable. Online-only: no ranking cache. Rankings 200 goes through `noteServerReachable()`; fetch failure through `noteServerUnreachable()`.

One chip row (All-time, Last 7 days, Last 30 days, then months that have data). Calendar months use the server host timezone. Dedicated artist and track rows (cover, label, play count). Track rows show `LossyMark`. Artist tap opens the artist page. Track tap uses `playOrQueueTrack`. No list/grid/tree toggle, no ⋯ / +, no collection control. The library Settings gear stays visible.

Empty copy: no history at all vs no listens in the selected range. Exact strings live in the Stats view.

Tracks map through `fromApiTrack`. Ranking artists map through `fromApiArtist`; `ListenArtist` is camel (`playCount`, `lastCountedAt`). Do not widen `Track` or `Artist` with ranking-only fields except via `ListenArtist` / `ListenTrack`.

## Out of scope

- Pre-encode / pre-warm of popular (track, profile) pairs — events retain profile and play source so a later job can read them
- Settings toggle, privacy opt-out, or wipe/reset UI or CLI
- User accounts, per-device charts, Last.fm
- A visible codec or play-source ranking
- Offline cached rankings
- Inferring listens from stream HTTP or diagnostics
