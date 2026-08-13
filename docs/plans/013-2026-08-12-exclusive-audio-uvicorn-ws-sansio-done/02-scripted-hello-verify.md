# Stage 02: Verify companion over loopback (no warning + health + hello)

## Status
done

## Description

After stage 01, prove the companion still serves ASGI WebSockets under `websockets-sansio`: process starts without the uvicorn websockets deprecation warning, `/health` responds, and a scripted JSON `hello` on `ws://127.0.0.1:<port>/ws` succeeds. No full Mac PWA or exclusive playback path required.

## Rationale

Backend switches can be silent at import time yet fail on accept/receive/close. Exclusive-audio is a long-lived loopback control channel (token hello, controller role). A minimal scripted hello is the agreed bar: enough to catch a broken upgrade path without re-running the whole exclusive playback product path.

## Implementation

1. **Prerequisites**

   - `HOG_TOKEN` set (project `.env` or env).
   - `mpv` on `PATH` (companion refuses to start without it).
   - Prefer a free loopback port if 18765 is busy: `--port <port>`.

2. **Start companion and capture stderr/stdout**

   ```sh
   uv run musicweb exclusive-audio --port 18765
   ```

   Expect:

   - Banner with `ws://127.0.0.1:18765/ws` and health URL.
   - **No** `UvicornDeprecationWarning` about the `websockets` implementation / `--ws websockets`.
   - Process stays up.

3. **HTTP health**

   ```sh
   curl -sS http://127.0.0.1:18765/health
   ```

   Expect JSON with `"ok": true` and protocol version `v` matching `musicweb.exclusive.protocol.PROTOCOL_VERSION`.

4. **Scripted WebSocket hello** (no PWA)

   One-shot client (any of: `websockets` CLI/snippet, small Python `asyncio` script, or browser console on a page that can open `ws://127.0.0.1`). Must:

   - Connect to `ws://127.0.0.1:18765/ws` (use `127.0.0.1`, not `localhost`).
   - Send first message as protocol envelope, e.g.:

     ```json
     {"v": 1, "type": "hello", "token": "<same HOG_TOKEN>", "sessionId": "verify-1"}
     ```

   - Expect `hello_ok` (controller role on first session) or a clear reject if token mismatches — not a hard socket failure mid-handshake.
   - Close the socket cleanly.

   Example sketch with the installed `websockets` package (adjust token/port):

   ```python
   import asyncio, json, os
   import websockets

   async def main():
       uri = "ws://127.0.0.1:18765/ws"
       token = os.environ["HOG_TOKEN"]
       async with websockets.connect(uri) as ws:
           await ws.send(json.dumps({
               "v": 1, "type": "hello",
               "token": token, "sessionId": "verify-1",
           }))
           print(await ws.recv())

   asyncio.run(main())
   ```

5. **Pass criteria**

   - Stage 01 pin active (`ws="websockets-sansio"`).
   - No deprecation warning on start.
   - Health OK.
   - Hello path returns a protocol message (`hello_ok` with valid token).

6. **Out of scope for this stage**

   - Full exclusive track play through mpv.
   - Permanent pytest fixture unless you choose to keep a tiny test later (not required by the grill).
   - Protocol version bumps or message-schema changes.
