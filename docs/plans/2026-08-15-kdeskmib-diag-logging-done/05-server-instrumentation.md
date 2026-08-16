# Stage 05: Server stream and prepare callsites

## Status
done

## Description

Emit the server events in [event-catalog.md](./context/event-catalog.md) from `/api/stream` and `/api/transcode/prepare`, copying join keys off the request. Do not emit from the transcoder worker.

## Rationale

`<audio src>` never hits `fetch`; cookies from stage 03 are how a phone play joins this line. Route-level emit is the only place that has `track_id` and not a library path.

## Invariants

- `transcode/worker.py` is not imported by `musicweb.diag` and does not call `emit`.
- `data` has `track_id` + `codec` / counts — never `rel_path`, never an absolute library path.
- Stream success uses one `http.stream` line (not start+end). Rejects use `http.stream.reject`.
- Prepare is one summary line per POST, not per id.
- `plan` is `passthrough` or `encode`. Encode `cache` is `ready` when `ensure_stream` did not need to wait on a new encode if that is cheap to know; otherwise omit `cache` rather than invent a second worker probe. Prefer: `ready` if the cache file already existed before `ensure_stream`, else `encoded` after a successful wait. Do **not** add new Transcoder APIs if a `Path.exists` check on the would-be cache path is wrong; then omit `cache`.
- Join keys on these lines match the cookies/headers the client set for that play.
- `http.stream` and `http.prepare` are `info`: they must not appear for a request whose mode is missing or `errors`. `http.stream.reject` is `error` and always written, with failure context.

## Risks

- `ensure_stream` blocks; the event must fire **after** success/failure so status is honest, not before the encode.
- A `Path.exists` guess can race with another request’s encode. Accept omit-`cache` if the race is messy; do not log a wrong `ready`.

## Implementation

### Files

- Change `src/musicweb/routes/media.py`
- Create `tests/test_diag_media.py`
- Do **not** change `src/musicweb/transcode/worker.py`

### Steps

1. Import `emit` in `media.py`.
2. `stream`: on 404/400/409 paths, `emit(..., "http.stream.reject", level="error", data={failure context, codec, status, detail})` then raise as today.
3. After a successful `FileResponse` is built (passthrough or encode), `emit(..., "http.stream", level="info", data={track_id, codec, plan, cache?})`.
4. If `ensure_stream` raises, emit `http.stream.reject` at `error` with status 500-class detail (short `type(exc).__name__` + message truncated) plus failure context, then re-raise or convert exactly as today.
5. `transcode_prepare`: after `counts` is computed, `emit(..., "http.prepare", level="info", data={codec, urgent, **counts})`. Include `replace` only if already on the payload (do not add new prepare semantics).
6. Tests: TestClient GET stream with cookies set; monkeypatch library/transcoder as existing media tests do if any, otherwise test `emit` via a thin wrapper / `caplog` + temp `diag_dir` on a request with injected cookies. Prefer writing a temp dir through the store by patching `Settings.diag_dir` or passing `store_dir` if `emit` allows it.

### Verify

- `uv run --group dev pytest tests/test_diag_media.py tests/test_diag_ingest.py`
- `rg "from musicweb.diag|diag.emit|emit\\(" src/musicweb/transcode` — no matches
- `rg "rel_path|as_posix|music_library_path" src/musicweb/routes/media.py` — no new uses inside `emit`/`data=` dicts
- TestClient stream **success** with no mode cookie / `musicweb_mode=errors` → no `http.stream` line. Same request with `X-Musicweb-Mode=everything` → one `http.stream` line.
- TestClient stream **404** with Errors only → one `http.stream.reject` (`error`) including failure context.
- Manual Everything: play one streamed track; `http.stream` shares `client_id`, `session_id`, and `play_id` with `player.load.begin`.

## Acceptance

- [x] Successful stream/prepare append only when the request mode is Everything.
- [x] Missing track / `StreamConflict` append `http.stream.reject` under both modes and still return the same HTTP status as today.
- [x] Worker file is byte-identical in intent (no diag import).
