# Stage 01: Server encode tiers

## Status
done

## Description

Split the transcoder’s non-urgent FIFO into radio, download, and playlist deques. Drain urgent → radio → download → playlist. Preempt down that ladder. Scope `drop_pending_prewarm` to playlist only. Thread a `tier` argument through `enqueue_prepare`, `Transcoder.prepare`, and `POST /api/transcode/prepare`. Point radio next-2 at the radio tier.

## Rationale

Without a real middle class, a download dump either shares today’s FIFO (starves radio next-2 and play-queue prepare) or cannot sit above playlist prepare. Every later client POST is a no-op against the old two-tier worker.

## Invariants

- Drain order is `_urgent` (newest first), then `_radio`, `_download`, `_playlist` (each FIFO).
- `urgent=True` always lands on `_urgent` and ignores `tier`.
- Non-urgent `tier` is `"radio"` | `"download"` | `"playlist"`. Default `"playlist"`.
- HTTP `PrepareRequest.tier` is omitted (playlist), `"playlist"`, or `"download"`. Any other value is 400. Radio is not an HTTP tier.
- `replace: true` calls `drop_pending_prewarm`, which drains **only** `_playlist`.
- Same cache key is one `_Job`. A new request promotes to the higher class; it never demotes.
- A preempted job is re-queued at the head of **its** class, not always playlist.
- `forget_paths`, `clear_cache`, and shutdown drain all four deques.
- `MAX_PENDING_PREWARM` (300) is enforced per non-urgent deque.
- Radio next-2 `enqueue_prepare` passes `tier="radio"`. Radio still must not call `drop_pending_prewarm`.

## Risks

- Leaving `_prewarm` as a shared radio+playlist deque would put radio next-2 **below** downloads and violate Q5.
- Re-queueing a canceled download encode onto `_playlist` would invert ranking after the first play preemption.
- `tests/transcode/test_forget.py` and `test_enqueue.py` construct `_Job` / call `enqueue_prepare` without `tier`; default must stay playlist so they keep compiling.

## Implementation

### Files

- `src/musicweb/transcode/worker.py`
- `src/musicweb/transcode/enqueue.py`
- `src/musicweb/routes/media.py`
- `src/musicweb/radio/prepare.py`
- `tests/transcode/test_tiers.py`
- `tests/transcode/test_enqueue.py`
- `tests/transcode/test_forget.py`
- `tests/routes/test_prepare.py`
- `tests/radio/test_prepare.py`

### Steps

1. In `src/musicweb/transcode/worker.py`, add a prewarm-class field on `_Job` (`"radio"` | `"download"` | `"playlist"`, default `"playlist"`). Replace `_prewarm` with `_radio`, `_download`, and `_playlist`. Update every wait / drain / `forget_paths` / `clear_cache` / shutdown / worker-loop pop to use all three. Cap each non-urgent deque with the existing `MAX_PENDING_PREWARM`.
2. In `_enqueue_encode` / `prepare`, accept `tier` (default `"playlist"`). New non-urgent jobs append to the matching deque. Existing same-key jobs call a promote helper: urgent wins; else radio > download > playlist; move deques; do not demote. Urgent enqueue still `_urgent.appendleft` and preempts any running non-urgent job.
3. Preempt ladder: starting/promoting urgent cancels a running radio/download/playlist job; enqueueing radio cancels running download/playlist; enqueueing download cancels running playlist. On `TranscodeCanceled` (not purged, not closed), restore the job to the **head of its class** (`urgent=False`, class unchanged).
4. Change `drop_pending_prewarm` to drain only `_playlist`. Keep the same return count + log line.
5. In `src/musicweb/transcode/enqueue.py`, add `tier: str = "playlist"` and pass it to `transcoder.prepare`. Invalid tier is the worker’s problem only if HTTP already validated; radio/tests pass a literal.
6. In `src/musicweb/routes/media.py`, add optional `tier: str | None = None` on `PrepareRequest`. Unknown / `"radio"` → 400. Normalize omitted to playlist. Pass `tier` into `enqueue_prepare`. `replace` still calls `drop_pending_prewarm` (now playlist-only).
7. In `src/musicweb/radio/prepare.py`, pass `tier="radio"` on the next-2 `enqueue_prepare` call. Current track stays `urgent=True` (tier irrelevant).
8. Add `tests/transcode/test_tiers.py` (no ffmpeg): enqueue playlist then download then radio for distinct keys and assert deque membership; same-key playlist then download promotes and leaves `_playlist`; `drop_pending_prewarm` leaves radio and download jobs; a mocked running playlist job is marked canceled when a download job is enqueued; a canceled download job is re-queued on `_download`, not `_playlist`.
9. Update `tests/transcode/test_enqueue.py` to assert `tier` is forwarded when passed, and that the default call still works. Update `tests/transcode/test_forget.py` so queued-job setup uses `_playlist` (or whichever deque the helper now represents) and that `forget_paths` also drops a job sitting on `_download`. Update `tests/routes/test_prepare.py` so `fake_enqueue` accepts `tier` and a new test 400s `tier="radio"` / unknown. Update `tests/radio/test_prepare.py` `test_first_tune_in_enqueues_current_and_two_prewarms` to expect `tier="radio"` on the next-2 kwargs (current may omit or pass anything; urgent is what matters).

### Verify

```sh
uv run --group dev pytest tests/transcode/test_tiers.py tests/transcode/test_enqueue.py tests/transcode/test_forget.py tests/routes/test_prepare.py tests/radio/test_prepare.py
```

## Acceptance

- Radio next-2 jobs sit on `_radio` and are popped before any `_download` job.
- `POST /api/transcode/prepare` with `tier: "download"` enqueues `_download`; omitted `tier` enqueues `_playlist`.
- `replace: true` drops pending playlist jobs and does not drop pending download or radio jobs.
- Preempt + restart keeps the job’s class.
- Same key is one job at the highest requested class.
- Existing radio “never call `drop_pending_prewarm`” test still passes.
