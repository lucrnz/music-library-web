# Stage 04: Living docs for download prewarm

## Status
done

## Description

Record download-queue prewarm in the downloads, transcoding, and playback system pages: window of 8, always-on, tier ranking, replace scoped to playlist, and forget only for unfinished download rows.

## Rationale

`docs/systems/downloads.md` still says the queue only works when a job is active. After stages 01–03 that is wrong, and `transcoding.md` still describes a two-tier worker plus a blunt `drop_pending_prewarm`.

## Invariants

- Living docs describe intent and ownership. Exact deque field names and abort-reason strings stay in source.
- Do not treat `context/design.md` as living documentation.
- Do not document a Settings toggle or a new HTTP route.

## Risks

- Copying the four-class drain table into three pages will drift. One ranking sentence on `transcoding.md`; downloads and playback point at it.

## Implementation

### Files

- `docs/systems/downloads.md`
- `docs/systems/transcoding.md`
- `docs/systems/playback.md`

### Steps

1. In `docs/systems/downloads.md`, add `prewarm.ts` to the source-of-truth / ownership table (window + sync + forget; HTTP stays `playback/prepare.ts`). In Behavior / Queue, state that pending and user-paused lossless rows ask `POST /api/transcode/prepare` with `tier: "download"` for the first 8 in queue order; active jobs still `GET /api/stream`; lossy/`source` skipped; user-pause still prewarms; auto-pause/offline does not. Note cancel / disable-and-clear forget unfinished ids that are not on the play queue; clear-finished does not forget.
2. In `docs/systems/transcoding.md`, replace the two-tier “urgent then prewarm FIFO” sentence with the four-class order (urgent > radio next-2 > download prewarm > playlist prewarm) and that higher classes preempt lower ones. State `drop_pending_prewarm` is playlist-only (Play all / codec replace); radio still must not call it. Mention optional prepare `tier: "download"`; omitted `tier` is playlist. Keep radio `log_label` + no-path rule and the 1-hour idle wipe.
3. In `docs/systems/playback.md`, in Prepare and near-end, note that download-manager prewarm is a separate `tier` and a separate client skip list from play `preparedKeys`. Play-queue prepare and near-end urgent prepare are unchanged. Point at `docs/systems/downloads.md` for the window and forget rules.

### Verify

Read the three pages against [context/design.md](context/design.md): always-on, window 8, ranking, replace leaves download/radio, forget only unfinished download rows, no new route, no Settings toggle. Frontend conventions do not need a change (prepare still lives in `playback/prepare.ts`; downloads still do not re-export it).

## Acceptance

- A reader of `docs/systems/downloads.md` knows album/artist enqueue prewarms 8 pending lossless rows and that pause still encodes.
- A reader of `docs/systems/transcoding.md` knows download prewarm sits between radio next-2 and playlist prepare, and that `replace` does not drop it.
- A reader of `docs/systems/playback.md` knows play prepare and download prewarm are different tiers / skip lists.
- No page lists `_download` field names or `MAX_PENDING_PREWARM` as a product contract.
