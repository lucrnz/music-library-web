# Stage 01: Shared enqueue for prepare and ensure_stream

## Status
done

## Description

Collapse the duplicated urgent-queue / promote / preempt logic in `Transcoder` into a single internal helper used by both `prepare` and `ensure_stream`. Keep public behavior: `prepare` stays non-blocking and returns status strings; `ensure_stream` still blocks until the encode finishes. Wire `PrepareRequest.urgent` through `prepare(..., urgent=…)` if not already present after the restructure.

## Rationale

The near-end feature needs urgent prepare, but the current path copies `ensure_stream`’s tier logic almost line-for-line. One enqueue owner is the only way to keep priority policy correct as caps, promotion, and preemption evolve. This stage is pure server structure with no client dependency, so it lands first.

## Implementation

- In `src/musicweb/transcode/worker.py`, extract something like `_enqueue_encode(source, relative_path, *, profile_tag, source_tech, urgent) -> tuple[str, _Job | None]`:
  - cache hit → `("ready", None)`
  - existing job: non-urgent → `("already", job)`; urgent → promote from prewarm if pending, set `urgent`, preempt other running prewarm, `("already", job)`
  - new urgent job → appendleft `_urgent`, preempt other prewarm, `("queued", job)`
  - new prewarm job → respect `MAX_PENDING_PREWARM`, append FIFO, `("queued", job)` or `("skipped", None)`
- `prepare(...)`: call helper; return status only (never wait on `job.done`).
- `ensure_stream(...)`: call helper with `urgent=True`; if job is not None, `job.done.wait()` and raise/return path as today.
- Keep `routes/media.py` thin: pass `payload.urgent` into `tc.prepare`.
- Smoke: non-urgent prepare still queues prewarm; urgent prepare promotes; stream path still blocks and serves; no double-encode of the same key.
