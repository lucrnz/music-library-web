# Stage 09: Control socket — protocol and health

## Status
done

## Description

While `serve` runs, expose a Unix domain socket under the data directory using **length-prefixed JSON** (big-endian u32 length + UTF-8 JSON body), Pydantic-validated. Implement `health` first; create socket on start, unlink on shutdown. Server accept-loop in `control/`; client in `control/` for CLI/runtime use.

## Rationale

CLI detects a live server before routing jobs in-process (stage 10–11). Health proves the control plane answers. No pause/resume; no grpcio.

## Implementation

1. Layout:
   - `src/musicweb/control/protocol.py` — models + **frame codec: `struct.pack(">I", n) + utf-8 json bytes`** (document max frame size).
   - `src/musicweb/control/server.py` — UDS accept + dispatch
   - `src/musicweb/control/client.py` — connect, request, timeouts
2. Path: `{musicweb_data_dir}/musicweb.sock`; mode 0600.
3. Methods this stage: `health` → ok payload. Unknown method → structured error.
4. Lifespan: start after lock held and app ready; shutdown stops acceptor and unlinks sock.
5. Client: `health(data_dir) -> bool`.
6. Do not change CLI write routing yet (stage 11).
