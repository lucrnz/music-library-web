**Archive.** Decisions in this file were current as of 2026-08-22 (the plan date in the directory name). They may be outdated. Do not treat this as living documentation. This plan directory is an archive.

# Download queue prewarm

## Goal

Queued lossless downloads ask the server to encode in the background so the user mostly waits on transfer. Active download jobs stay `GET /api/stream` (urgent) as they do today.

## Settled decisions

- Always on. No Settings toggle.
- New middle encode class: **urgent** (play, radio current, near-end prepare, active download stream) **> radio next-2 > download prewarm > playlist prewarm**.
- Sliding window of **8** pending lossless rows (queue `addedAt` order). Active jobs are not in the window; they already hit `/api/stream`.
- User-pause still prewarms that window. Auto-pause / offline does not POST (server unreachable).
- Each queue row uses its stored **download** codec. Lossy / `source` is skipped.
- `POST /api/transcode/prepare` grows optional `tier: "download"`. Omitted `tier` stays playlist prewarm. Radio stays in-process `enqueue_prepare` (never HTTP, never `drop_pending_prewarm`).
- Higher class **preempts** a running lower encode (`.partial` deleted, job re-queued on **its own** class). Same restart rules as today’s urgent→prewarm.
- Play all / stream-codec `replace: true` drops **only** the playlist tier. Download and radio next-2 stay.
- Cancel or clear of **not-yet-complete** download rows POSTs forget for those ids unless they are still on the play queue. Server still retains radio current + remaining radio queue.
- Clear **finished** does not evict a completed cache.
- Same track+profile is one job, held at the **highest** requested class (never demoted).

## Design

Today album/artist “download all” only enqueues locally. The pump admits up to the client concurrency cap; each **active** job blocks on `GET /api/stream` → `ensure_stream` (urgent). Pending rows do no server work. Play-queue prepare and radio next-2 share one prewarm FIFO; `replace: true` drains that whole FIFO.

This plan splits non-urgent work into three deques and lets the download manager fill a short download-tier window:

```text
single encode worker
  1. _urgent          newest first   play / radio current / near-end / active download GET
  2. _radio           FIFO           radio next-2
  3. _download        FIFO           download-manager window
  4. _playlist        FIFO           play-queue prepare (today’s _prewarm)

preempt down the ladder
  urgent     → cancel running radio / download / playlist
  radio      → cancel running download / playlist
  download   → cancel running playlist
  playlist   → never

same key
  one _Job; promote deque membership to the higher class; do not demote
```

Client (`downloads/prewarm.ts`, not `queue.ts`):

- On queue membership/state change and on boot: if the server is reachable, `selectDownloadPrewarmWindow` takes the first 8 `pending` or user-`paused` lossless encodeable rows, groups by row codec, and `requestPrepare(..., { tier: "download" })`.
- Download-tier POSTs do **not** write play `preparedKeys` (play prepare skip stays play-only).
- Cancel one row, clear unfinished, or disable-and-clear-queue: `requestForget` those track ids minus current play-queue ids.
- Window slide does not forget. A row that becomes active is promoted by `/api/stream`, not forgotten.

`drop_pending_prewarm` drains `_playlist` only. `forget_paths` / shutdown / `clear_cache` drain every deque. A preempted job returns to the head of **its** deque (`urgent` cleared, class kept).

`MAX_PENDING_PREWARM` (300) applies **per** non-urgent deque. A window of 8 never hits it from one client.

## Stage map

1. **Server tiers** — nothing else is real until the worker ranks radio above download above playlist, scopes `replace` to playlist, and accepts `tier` on enqueue/HTTP. Radio next-2 must land on the radio deque in the same change or they sit below downloads.
2. **Prepare flag + window** — independent of the pump wire-up; gives `requestPrepare` a download tier and a pure “first 8” helper the later sync can call. Node tests can cover both without OPFS.
3. **Queue sync + forget** — depends on 01 (server honors `tier`) and 02 (window + POST shape). This is the user-visible “enqueue album → encodes start.”
4. **Living docs** — written against the contract 01–03 actually ship (`downloads.md`, `transcoding.md`, `playback.md`).

## Out of scope

- A Settings toggle or per-row “prewarm” control
- Raising download-job concurrency or changing the pump cap
- A new HTTP route
- Promoting radio next-2 into the urgent deque
- Forgetting completed cache files on “clear finished”
- Multi-tab / multi-client window coordination
- Vue, OPFS, or download-worker tests (see `docs/development/testing.md`)
- Changing idle cache wipe, ffmpeg policy, or exclusive prepare tags

## Assumptions

- Play `preparedKeys` stays a client skip list for **play** prepare only. Download sync de-dupes its own last-posted window.
- `pl.tracks` is the play-queue retain set for client-side forget (server retain stays radio-only).
- Queue `codec` is already the delivered tag (`source` for lossy) at enqueue time; the window does not re-read Settings.
- `canReachServer()` is the right gate for POSTs; `isHardOffline()` alone is not.
- Existing `requestForget` chunking and fire-and-forget error swallow stay.
- `_Job` gains an explicit prewarm class so a preempted download encode is not re-queued as playlist.
