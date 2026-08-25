"""Loopback FastAPI app for the Desktop companion WebSocket."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response, StreamingResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from musicweb.exclusive import blob_store
from musicweb.exclusive import protocol as p
from musicweb.exclusive.session import ExclusiveHub

logger = logging.getLogger("musicweb.companion.app")

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type, Authorization",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Range, Content-Length",
    "Access-Control-Allow-Private-Network": "true",
}


def file_token_ok(provided: str, expected: str) -> bool:
    return p.token_ok(provided, expected)


def parse_byte_range(rng: str | None, size: int) -> tuple[int, int] | None:
    """Inclusive start/end, or None for the full file. ValueError → 416."""
    if not rng or not rng.startswith("bytes="):
        return None
    spec = rng[6:].strip()
    if not spec or "," in spec or "-" not in spec:
        raise ValueError("unsatisfiable")
    start_s, end_s = spec.split("-", 1)
    try:
        if start_s == "":
            suffix = int(end_s)
        else:
            start = int(start_s)
            end: int | None = int(end_s) if end_s else None
    except ValueError as exc:
        raise ValueError("unsatisfiable") from exc
    if start_s == "":
        if suffix <= 0 or size <= 0:
            raise ValueError("unsatisfiable")
        return max(0, size - suffix), size - 1
    if size <= 0:
        raise ValueError("unsatisfiable")
    if end is None:
        end = size - 1
    start = max(0, start)
    end = min(size - 1, end)
    if start > end:
        raise ValueError("unsatisfiable")
    return start, end


def read_file_span(path: object, start: int, end: int) -> bytes:
    return b"".join(blob_store.iter_file_span(Path(str(path)), start, end))


def slice_bytes(
    data: bytes, rng: str | None
) -> tuple[int, bytes, dict[str, str]]:
    """Kept for tests; prefer parse_byte_range + read_file_span on disk."""
    size = len(data)
    headers = {"Accept-Ranges": "bytes"}
    try:
        span = parse_byte_range(rng, size)
    except ValueError:
        return 416, b"", headers
    if span is None:
        headers["Content-Length"] = str(size)
        return 200, data, headers
    start, end = span
    chunk = data[start : end + 1]
    headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    headers["Content-Length"] = str(len(chunk))
    return 206, chunk, headers


class _LoopbackCors:
    """ASGI CORS wrapper — BaseHTTPMiddleware buffers StreamingResponse."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if scope.get("method") == "OPTIONS":
            await send(
                {
                    "type": "http.response.start",
                    "status": 204,
                    "headers": [
                        (key.lower().encode(), value.encode())
                        for key, value in CORS_HEADERS.items()
                    ],
                }
            )
            await send({"type": "http.response.body", "body": b""})
            return

        async def send_with_cors(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers") or [])
                have = {key.lower() for key, _ in headers}
                for key, value in CORS_HEADERS.items():
                    low = key.lower().encode()
                    if low not in have:
                        headers.append((low, value.encode()))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_cors)


def create_exclusive_app(hub: ExclusiveHub) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        import asyncio

        hub.bind_loop(asyncio.get_running_loop())
        hub.start_player()
        hub.ensure_ttl_watch()
        logger.info("Companion ready")
        try:
            yield
        finally:
            hub.stop()

    app = FastAPI(
        title="musicweb companion",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.state.hub = hub
    app.add_middleware(_LoopbackCors)

    def _require_file_token(request: Request) -> None:
        token = str(request.query_params.get("token") or "")
        if not file_token_ok(token, hub.companion_token):
            raise HTTPException(status_code=401, detail="unauthorized")

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {"ok": True, "v": p.PROTOCOL_VERSION}

    @app.api_route("/files/{key:path}", methods=["GET", "HEAD"])
    async def get_file(key: str, request: Request) -> Response:
        _require_file_token(request)
        try:
            path = blob_store.open_read(hub.data_dir, key)
        except blob_store.BlobJailError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="missing") from None
        size = path.stat().st_size
        rng = request.headers.get("range") or request.headers.get("Range")
        try:
            span = parse_byte_range(rng, size)
        except ValueError:
            raise HTTPException(status_code=416, detail="unsatisfiable") from None
        if span is None:
            if request.method == "HEAD":
                return Response(
                    status_code=200,
                    media_type="application/octet-stream",
                    headers={
                        "Accept-Ranges": "bytes",
                        "Content-Length": str(size),
                    },
                )
            return FileResponse(
                path,
                media_type="application/octet-stream",
                headers={"Accept-Ranges": "bytes"},
            )
        start, end = span
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Content-Length": str(end - start + 1),
        }
        if request.method == "HEAD":
            return Response(
                status_code=206,
                media_type="application/octet-stream",
                headers=headers,
            )
        return StreamingResponse(
            blob_store.iter_file_span(path, start, end),
            status_code=206,
            media_type="application/octet-stream",
            headers=headers,
        )

    @app.put("/files/{key:path}")
    async def put_file(key: str, request: Request) -> dict[str, Any]:
        _require_file_token(request)

        async def chunks() -> AsyncIterator[bytes]:
            async for piece in request.stream():
                if piece:
                    yield piece

        try:
            nbytes = await blob_store.put_async_chunks(hub.data_dir, key, chunks())
        except blob_store.BlobJailError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"ok": True, "bytes": nbytes}

    @app.websocket("/ws")
    async def ws_endpoint(websocket: WebSocket) -> None:
        await websocket.accept()
        sess = None
        try:
            # First message must be hello
            raw = await websocket.receive_json()
            msg = p.parse_message(raw)
            if msg is None or msg.get("type") != p.MSG_HELLO:
                await websocket.send_json(
                    p.envelope(
                        p.MSG_HELLO_REJECT,
                        reason="expected_hello",
                    )
                )
                await websocket.close()
                return
            token = str(msg.get("token") or "")
            session_id = str(
                msg.get("sessionId") or msg.get("session_id") or ""
            )
            sess = await hub.handle_connect_hello(
                websocket, token, session_id
            )
            if sess is None:
                await websocket.close()
                return

            while True:
                raw = await websocket.receive_json()
                msg = p.parse_message(raw)
                if msg is None:
                    await websocket.send_json(
                        p.envelope(
                            p.MSG_ERROR,
                            message="invalid message envelope",
                        )
                    )
                    continue
                await hub.handle_message(sess, msg)
        except WebSocketDisconnect:
            pass
        except RuntimeError as exc:
            # Starlette may raise when the peer closes mid-receive.
            if "not connected" not in str(exc).lower():
                logger.exception("websocket error: %s", exc)
        except Exception as exc:
            logger.exception("websocket error: %s", exc)
        finally:
            if sess is not None:
                await hub.handle_disconnect(sess)

    return app
