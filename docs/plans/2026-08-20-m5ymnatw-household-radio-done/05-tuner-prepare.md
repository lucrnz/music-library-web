# Stage 05: Tuner registry and prepare

## Status
done

## Description

Count tuners on the now-playing WebSocket (`tune_in` / `tune_out`) and, while count ≥ 1, ask the existing `Transcoder` to urgent-ensure the current track and prewarm the next two, per active codec. No live ffmpeg and no new stream route.

## Rationale

This is the resource switch the product promised: simulation is clock-only; the first Tune-in starts complete-file work so `/api/stream` + seek can join the official clock. Reusing `Transcoder` deletes the live-pipe design the review rejected.

## Invariants

- No `GET /api/radio/stream`. Clients will load `/api/stream?id=&codec=` in stage 07.
- Radio must not spawn ffmpeg itself. No concat list, no `Popen` to stdout, no radio writes under `streams/` except what `Transcoder` already does.
- Never call `drop_pending_prewarm` for radio. Call `Transcoder.prepare` / `ensure` in-process. Do not POST `/api/transcode/prepare`.
- Next-2 ids are never placed on the WS or HTTP now-playing payload. They are an internal station method.
- Radio prepare logs do not include upcoming titles or paths: `log_label` on `prepare` / `_Job`; radio current = `"radio current"`, radio prewarm = `"radio prewarm"`. Log profile tag + label. Never path, title, or `source.name` for those jobs. On-demand jobs stay as they are.
- `catching_up`, `skip_pending`, and `idle`: keep the socket. Send `{ "ok": false, "error": "station_not_current", "face" }`. Do not register the tuner. Do not prepare.
- `tune_in` on an already-registered socket updates that tuner’s codec and does not double-count. Prepare only if the codec union grew or changed.
- Lossy ids are never encoded. That is a property of the track (`is_lossy` / `tech_from_track`), not of the tuner.
- `tune_in.codec` must be a `browser_listed` profile. `source`, exclusive, and unknown reply `{ "ok": false, "error": "codec_rejected", "face" }`. Use `get_profile` / `browser_listed` — do not hand-roll a tag list.

## Risks

- Using `/api/stream` GET count as tuners would mix on-demand plays into radio prepare.
- `Transcoder._run_job` already logs `job.relative_path` at INFO. Without `log_label`, prewarming the next two ids prints upcoming paths.
- `drop_pending_prewarm` is the existing prepare hammer (`replace` on the HTTP body); one mistaken call cancels the user’s queue prewarm.

## Implementation

### Files

- `src/musicweb/radio/tuners.py`
- `src/musicweb/radio/prepare.py` (choose ids + `log_label` + urgent; call `enqueue_prepare`)
- `src/musicweb/radio/protocol.py` (allowlist + ack / reject frames)
- `src/musicweb/routes/radio.py`
- `src/musicweb/transcode/enqueue.py` (`enqueue_prepare` — extract the id→enqueue loop from `transcode_prepare`)
- `src/musicweb/transcode/worker.py` (`log_label` on `prepare` / `_Job`; `_run_job` uses it instead of `relative_path` when set)
- `src/musicweb/routes/media.py` (HTTP `replace` → `drop_pending_prewarm`, then `enqueue_prepare`)
- `tests/radio/test_tuners.py`
- `tests/radio/test_prepare.py`
- `tests/radio/test_protocol.py`
- `tests/transcode/test_enqueue.py`

### Steps

1. Tuner registry: keyed by WS connection.
   - Unknown payload → close (replaces stage 04).
   - `tune_in` while `catching_up` / `skip_pending` / `idle` → `{ ok: false, error: "station_not_current", face }`, no register, no prepare.
   - `source` / exclusive / unknown tag → `{ ok: false, error: "codec_rejected", face }`, no register.
   - First valid `tune_in` → register, `{ ok: true }`, `prepare_radio`.
   - `tune_in` again on the same socket → update codec if changed, `{ ok: true }`, prepare only if the codec union grew/changed. Do not double-count.
   - `tune_out` / disconnect → drop that tuner; 1→0 stops *new* radio prepares; in-flight stays.
   Log 0→1 simulation→streaming and 1→0 streaming→simulation (counts only, no ids).
2. Extract `enqueue_prepare` from `transcode_prepare` into `transcode/enqueue.py`. `media.py` keeps `if payload.replace: tc.drop_pending_prewarm()` then calls the helper. Radio never imports `routes/media.py`.
3. On 0→1, codec-union change, and each advance while count ≥ 1: `prepare_radio` chooses current + next-2 (internal station method) and calls `enqueue_prepare(..., urgent=..., log_label=...)`:
   - union of distinct **profiles** among tuners (never `source`)
   - lossless + profile → urgent current (`"radio current"`), prewarm nexts (`"radio prewarm"`)
   - lossy ids → skipped inside `enqueue_prepare`
4. On 1→0: stop scheduling radio prepares. Leave in-flight worker jobs.
5. Prepare refresh rides the **same** post-`to_thread` event-loop listener stage 04 registered. Do not add a second station hook. Do not put FastAPI types in `station.py`.
6. Tests (mock `Transcoder`; protocol helpers — no TestClient): 0→1 enqueues current urgent + two prewarms; second tuner with another profile enqueues that profile only; second `tune_in` same profile does not double-count or re-enqueue; profile replace re-prepares the new union; 1→0 does not enqueue; `catching_up`/`skip_pending`/`idle` produce `station_not_current`; `tune_in` with `source` / exclusive / unknown → `codec_rejected`; lossy current/next are not encoded and the stored profile is still the tuner codec; next ids absent from any serialized payload; `drop_pending_prewarm` is never called from radio; a 1s no-op tick listener does not re-enqueue; log assertions contain no upcoming title/path. Never encode a real file.

### Verify

- `uv run --group dev pytest tests/radio/`

## Acceptance

- Zero tuners enqueue no radio prepares.
- First valid `tune_in` on a `current` station replies `{ ok: true }`, urgent-ensures the current id, and prewarms at most two later ids per active codec.
- A second `tune_in` on the same socket is idempotent; a profile change updates the union and re-prepares.
- `tune_in` with `source` is `codec_rejected`. Lossy ids are skipped by `enqueue_prepare`; the tuner still holds the profile.
- Rejected `tune_in` is a typed error frame on an open socket; tuner count unchanged.
- Radio and `/transcode/prepare` share `enqueue_prepare`. Radio never calls `drop_pending_prewarm`.
- Disconnect and `tune_out` drop that tuner; last tuner returns to simulation.
- No live ffmpeg path and no `/api/radio/stream`.
- Now-playing payloads still have no upcoming ids.
