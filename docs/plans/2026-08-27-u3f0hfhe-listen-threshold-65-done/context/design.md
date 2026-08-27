**Archive.** Decisions in this file were current as of 2026-08-27 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Lower listen threshold to 65%

## Goal

Count a household listen after **65%** accumulated media time in one play cycle, instead of 70%. Queue, radio, and every sink keep the same cycle / outbox / ingest path.

## Settled decisions

- The ratio is the existing named constant `LISTEN_THRESHOLD` in `frontend/src/listens/accumulator.ts`. Change `0.7` to `0.65`. Do not add a Settings control, env var, or per-profile override.
- Queue and radio share that constant. Do not split thresholds by origin or play source.
- The comparison stays `listenedSec < LISTEN_THRESHOLD * duration` (exact 65% fires). Seek epsilon (2s), pause/seek non-adds, first-sample no-add, unknown-duration `onEnded`, and one-fire-per-cycle are unchanged.
- The server still accepts whatever the client posts. Do not re-check the ratio on `POST /api/listens`.
- Already-stored `listen_events` rows stay. There is no recount of past plays that stopped between 65% and 70%.
- No Last.fm-style “4 minutes or 50%” alternative. Percentage of file duration remains the only bar.
- Living contract copy lives in `docs/systems/playback-stats.md`. Archived plans under `docs/plans/` keep their historical 70% wording.

## Design

A listen is still one play cycle of accumulated playing media-time deltas (≤ 2s). The client owns the bar: `createListenCycle` adds those deltas, fires once when accumulated time reaches the threshold of known duration, and writes the event through the existing localStorage outbox → `POST /api/listens` path.

Only the ratio changes. `LISTEN_THRESHOLD` is already the single source for that ratio. File-header comments and the accumulator unit tests that pin `0.7` / a 100-second fire point at 70s move with it. Tests that play well past 70% on a 10-second file (for example to 7.5s) still fire at 65% and do not need new fire-point math unless a case sits between 6.5s and 7.0s.

Radio, exclusive companion, downloaded OPFS, and stream sinks already call this accumulator. They do not hardcode 0.7.

Ingest, rankings SQL, Stats chips, and flush/retry stay as they are. A listen that never fired under 70% and is no longer in an active cycle cannot be reconstructed.

## Stage map

1. **Lower the constant and retarget its tests.** This is the behavior change. Everything that counts a listen already reads `LISTEN_THRESHOLD`.
2. **Living docs.** After stage 01 so `docs/systems/playback-stats.md` describes the shipped 65% contract rather than the old 70% one. `design.md` is not living documentation.

## Out of scope

- Settings toggle, env var, or operator-configurable threshold
- Server-side percentage validation or a new ingest field
- Recounting or deleting historical `listen_events`
- A minimum wall-clock time (Last.fm 4-minute rule) alongside the percentage
- Changing `LISTEN_SEEK_EPSILON_SECONDS` or pause/seek/restart rules
- Rewriting archived plans or `docs/plans/ARCHIVED.md`

## Assumptions

- No player, radio, or bridge file hardcodes `0.7` / `70%` outside `accumulator.ts` and its unit test.
- Exact 65% of a finite duration is enough to fire, matching today’s exact-70% behavior.
- Unknown duration still counts only on `onEnded` / companion eof.
