# Stage 05: Companion blob API

## Status
done

## Description

Give the sidecar a jailed blob store under the app-support dir: WS fetch/delete/stat/disk_info for any authenticated session, plus token-gated `GET`/`PUT /files/{key}` with Range. Hog commands stay controller-only. PWA does not call this yet.

## Rationale

Stage 07 jobs and stage 08/09 play/migrate need one on-disk contract. Ship it in the companion first so the client binds to a real protocol.

## Invariants

- Keys are relative, no `..`, no absolute, no NUL. Layout in [context/design.md](context/design.md).
- Writes go to `*.partial` then rename. `blob_put` with `offset` resumes the partial via HTTP Range on `url`.
- `GET`/`PUT /files/{key}?token=` require the companion token. Bad token → 401. Missing file GET → 404. GET supports `Range`.
- Blob WS types are allowed for any hello-authenticated session. `load` / `set_device` / transport stay controller-only.
- `disk_info_ok.free` is OS free bytes on the volume that contains the data dir.
- `PROTOCOL_VERSION` stays `1`.
- `ExclusiveHub` takes `data_dir: Path`. Tests pass a tmp path. CLI uses `companion_data_dir()`.
- mkdir the data dir on first blob write, not at import.

## Risks

- `handle_message` currently rejects every non-controller command except heartbeat and `list_devices`. Blob types must be carved out without opening hog commands to readonly.
- Companion `GET` of the library URL must not send `COMPANION_TOKEN` to the NAS. Only the loopback `/files` query carries the token.
- Logging the file URL would leak the token. Log key + status only.

## Implementation

### Files

- `src/musicweb/exclusive/protocol.py`
- `src/musicweb/exclusive/blob_store.py`
- `src/musicweb/exclusive/session.py`
- `src/musicweb/exclusive/app.py`
- `src/musicweb/cli/companion.py`
- `tests/exclusive/test_blob_store.py`
- `tests/exclusive/test_blob_http.py`
- `tests/test_exclusive_protocol.py`
- `tests/test_exclusive_hub_release.py`
- `frontend/src/exclusive/protocol.ts`
- `frontend/tests/exclusive/protocol.test.ts`

### Steps

1. In `src/musicweb/exclusive/protocol.py` and `frontend/src/exclusive/protocol.ts`, add the message type string constants from [context/design.md](context/design.md) (`blob_put`, `blob_abort`, `blob_delete`, `blob_stat`, `disk_info`, `blob_progress`, `blob_done`, `blob_error`, `blob_stat_ok`, `disk_info_ok`). Keep `PROTOCOL_VERSION = 1`.
2. Create `src/musicweb/exclusive/blob_store.py`: `safe_key(key) -> Path` relative parts; `resolve(root, key)`; `stat`; `delete` (final + partial); `write_stream` / `put_bytes`; `open_read`; `disk_free(root)`. Jail tests must reject `../x`, `/etc/passwd`, and `a\x00b`.
3. In `src/musicweb/exclusive/session.py`, add `data_dir` to `ExclusiveHub.__init__`. Route blob WS types in `handle_message` **before** the controller-only check, for any current session. Implement put (GET of `url` with optional Range via `urllib.request` in `asyncio.to_thread`, write partial, progress to requester, `blob_done` / `blob_error`), abort, delete, stat, disk_info. Do not add an httpx dependency. Fan-out progress only to the requesting session.
4. In `src/musicweb/exclusive/app.py`, add `GET /files/{key:path}` and `PUT /files/{key:path}` that read `token` from the query, compare to `hub.companion_token`, and use the blob store. GET implements Range (206). PUT replaces/creates the final file (migrate). Do not add these routes to the library server.
5. In `src/musicweb/cli/companion.py`, pass `data_dir=companion_data_dir()` into `ExclusiveHub`.
6. Update `tests/test_exclusive_hub_release.py` to pass `data_dir=tmp_path`.
7. Add `tests/exclusive/test_blob_store.py` for jail, partial resume size, delete, and `disk_free` (just `>= 0` on tmp).
8. Add `tests/exclusive/test_blob_http.py` using FastAPI `TestClient` / httpx: 401 without token, PUT then GET bytes, GET Range first byte, 404 miss.
9. In `tests/test_exclusive_protocol.py` and `frontend/tests/exclusive/protocol.test.ts`, assert the new type constants are non-empty strings and envelope still uses version 1.

### Verify

```sh
uv run --group dev pytest tests/exclusive/test_blob_store.py tests/exclusive/test_blob_http.py tests/test_exclusive_protocol.py tests/test_exclusive_hub_release.py
pnpm --dir frontend test -- frontend/tests/exclusive/protocol.test.ts
pnpm --dir frontend typecheck
```

## Acceptance

- A PUT of 4 bytes then GET returns those bytes when `token` matches.
- Range `bytes=0-0` returns one byte and 206.
- `blob_put` to a jailed key writes under `data_dir` only. `../escape` errors and writes nothing outside.
- Readonly session can `disk_info` / `blob_stat`. Readonly `load` still errors `readonly`.
- Hub release tests still pass with a tmp `data_dir`.
