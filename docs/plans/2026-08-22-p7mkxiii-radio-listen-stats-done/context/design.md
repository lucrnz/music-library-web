**Archive.** Decisions in this file were current as of 2026-08-22 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Radio listen stats (tuned-in only)

## Goal

Count household listens for radio with the same 70% media-time contract as on-demand, and only on a client that is actually tuned in. Rankings stay mixed. Each event records `origin` (`queue` | `radio`) so a later filter is possible.

## Settled decisions

- **Who writes.** The tuned-in client. Same cycle → localStorage outbox → `POST /api/listens` path as on-demand. The station clock never inserts a listen. Zero tuners never count. Each tuned-in device that hears 70% writes its own event.
- **70% of the full track after join.** Tune-in seek-to-clock is a cold-load resume: skipped time does not count. Join at 80% cannot count. Join at 20% and stay can.
- **Tune-out is Stop.** The cycle is discarded. Two halves on the same official play do not add. An event that already fired at 70% stays in the outbox.
- **Cycle window.** Start only after a successful radio load + seek-to-clock + play (`chrome === "tuned"`). Do not start on tab-open, `tuning`, or `stopped`. Discard when chrome leaves `tuned` (Tune out, leave radio, catch-up / skip-pending, failed tune, station idle). A new official track or a policy/codec reload starts a new cycle only after the next successful tuned load.
- **Event shape.** Keep `play_source` as delivery (`streaming` | `downloaded`). Add `origin`: `queue` | `radio`. Exclusive companion stays `queue`. Existing rows and an omitted POST field are `queue` so in-flight outbox rows still ingest. Rankings ignore `origin` (no filter, no new chip, no origin on ranking JSON).
- **Profile tag.** Radio sends the resolved delivery profile (lossy uses `source`), not `radio.playProfileId` (that field is null on lossy for the status line).
- **No server radio writes.** `src/musicweb/radio/` still does not own listen stats.

## Design

On-demand already owns the contract: `createListenCycle` accumulates playing media-time deltas ≤ 2s, fires once at 70% of duration, and treats the first sample / a large seek as no add. Radio already has a distinct `HTMLAudioElement`, `resolvePlaySource` delivery (`streaming` | `downloaded`), and a seek-to-clock after load. Drift reseek uses the same 2s threshold as the listen seek epsilon, so a clock correction does not count as heard time.

The missing piece is wiring, plus an `origin` column so radio events are distinguishable later without splitting Stats today.

```text
queue load ok  → startCycle(origin=queue, play_source, profile)
radio tuned    → startCycle(origin=radio, play_source, profile)
        │
   timeupdate (playing, not seeking)
        │
   70% of full duration → enqueue → POST /api/listens
        │
   Tune out / leave / new load → discard (fired events stay queued)
```

The listen bridge remains a singleton. `become("radio")` / `become("queue")` plus discard on session leave keep one cycle. Radio must import `@/listens/bridge`, never `player.ts`.

Omitted `origin` on ingest defaults to `queue`. The outbox key stays `musicweb.listens.pending.v1`; a pending row without `origin` is treated as `queue` at read time.

## Stage map

1. **Origin on the server** — persist the new field and accept it on POST (default `queue`) before the client can send `radio`. Rankings stay mixed.
2. **Origin on the client listen path** — event, outbox, flush, and queue `startCycle` carry `origin`. Independently testable; radio still does not start a cycle.
3. **Wire radio** — start / sample / discard against the existing accumulator. This is the user-visible behavior change. Depends on stages 01–02 so a fired radio event is valid end-to-end.
4. **Living docs** — reverse the written “radio must not write listens” rule against what stages 01–03 shipped. `design.md` is not living documentation.

## Out of scope

- Settings toggle, privacy opt-out, wipe/reset
- User accounts, per-device charts, Last.fm
- A Stats chip, ranking query param, or visible origin/play-source split
- Inferring listens from `GET /api/stream`, prepare, diagnostic JSONL, or the station clock
- Exclusive-mode radio
- Carrying listened time across Tune-out
- Counting 70% of remaining time (late-join shortcut)
- Changing the 70% threshold or seek epsilon
- Server-side household-once dedupe

## Assumptions

- Radio snapshot tracks already carry catalog duration (`duration` / `duration_ms` via `fromApiTrack`); unknown duration still falls through to `onEnded` like on-demand.
- `become()` already prevents queue and radio from playing at once.
- Radio pause while tuned is already Tune-out; no new pause-vs-tune-out rule.
- Pending outbox rows written before this plan have no `origin` and must still flush.
