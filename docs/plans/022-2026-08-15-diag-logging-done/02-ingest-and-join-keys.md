# Stage 02: Ingest API, emit, join keys

## Status
done

## Description

Add `POST /api/diag/events`, a server `emit` helper that honors the mode cutoff, and a join-key + mode reader (headers override cookies). Client batches are written with `source` forced to `client`. Ingest itself emits nothing and does not re-filter by level.

## Rationale

Stage 01 can persist; this stage is the contract both instrumentations and the phone outbox will use. Join keys must be readable on `/api/stream` before stage 05.

## Invariants

- LAN trust: no token. Same as the rest of `/api`.
- Written client lines always have `source="client"` even if the body said `server`.
- Envelope fields listed in [event-catalog.md](./context/event-catalog.md) are present (join keys may be JSON `null`).
- `POST /api/diag/events` never calls `emit` and is never recorded as an event.
- Header names: `X-Musicweb-Client`, `X-Musicweb-Session`, `X-Musicweb-Play`, `X-Musicweb-Mode`. Cookie names: `musicweb_client`, `musicweb_session`, `musicweb_play`, `musicweb_mode`. Header wins when both set.
- Mode values: `errors` | `everything`. Missing or unknown mode on a request is `errors`.
- `emit` with `level != "error"` is a no-op when the request mode is `errors` (does not append). `emit(..., level="error")` always appends.
- Ingest writes every valid event in the batch regardless of mode cookie or event `level`.
- Max 100 events per POST; each `event` is a non-empty dotted string; each `data` is an object; reject (400) oversize bodies rather than silently truncating a partial batch.

## Risks

- A chatty or hostile LAN client can still fill the cap. Accepted (LAN trust + rotation).
- FastAPI TestClient cookie/header tests must set both to prove override.

## Implementation

### Files

- Create `src/musicweb/diag/ids.py`
- Create `src/musicweb/diag/emit.py`
- Create `src/musicweb/routes/diag.py`
- Change `src/musicweb/routes/api.py` (include router)
- Create `tests/test_diag_ingest.py`

### Steps

1. `ids.from_request(request) ->` client, session, play, mode. Strip empty strings to `None`. Header then cookie. Mode normalizes to `errors` | `everything` (`errors` if missing/unknown).
2. `emit(request, event, *, level="info", data=None, store_dir=None)`: if `level != "error"` and mode is `errors`, return. Else build envelope (`source="server"`, UTC `ts`, join keys from `request` or all-null if `request` is None), `store.append`. Must not raise to the route on I/O failure (log via stdlib `logging`, swallow).
3. `POST /api/diag/events` body: `{ "events": [ { "event", "level"?, "ts"?, "client_id"?, "session_id"?, "play_id"?, "data"? } ] }`. Validate counts/types. For each item, write via `store.append` with `source="client"` and server-assigned `ts` if missing/unparseable. Do **not** drop info lines because the mode cookie is `errors`. 204 empty body.
4. Include the router in `routes/api.py`. Do not add stream query params in this stage.

### Verify

- `uv run --group dev pytest tests/test_diag_ingest.py tests/test_diag_store.py`
- TestClient: 204 writes one JSONL line with `source=client` when the body claimed `source=server`.
- TestClient: 400 on 101 events; JSONL unchanged.
- TestClient: header `X-Musicweb-Client=h` + cookie `musicweb_client=c` → a server `emit` on a dummy route or direct `from_request` returns `h`.
- `emit` with `level="info"` + no mode cookie → JSONL unchanged. `level="error"` → one line. `X-Musicweb-Mode=everything` + `level="info"` → one line.
- Ingest POST of an `info` event with mode cookie `errors` still writes the line.
- `rg "diag.events|diag/" src/musicweb/diag src/musicweb/routes/diag.py` — no `emit(` from the ingest handler.

## Acceptance

- [x] `POST /api/diag/events` is mounted and returns 204 on a valid one-event batch.
- [x] Forced `source=client`; join-key and mode header/cookie rules hold.
- [x] Server `emit` no-ops info under Errors only; always writes error.
- [x] Ingest does not re-filter by level.
- [x] Ingest failure/success does not append an ingest event.
- [x] `emit` I/O errors do not become HTTP 500.
