"""Loopback FastAPI app for exclusive-audio companion WebSocket."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from musicweb.exclusive import protocol as p
from musicweb.exclusive.session import ExclusiveHub

logger = logging.getLogger(__name__)


def create_exclusive_app(hub: ExclusiveHub) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        import asyncio

        hub.bind_loop(asyncio.get_running_loop())
        hub.start_player()
        hub.ensure_ttl_watch()
        logger.info("Exclusive companion ready")
        try:
            yield
        finally:
            hub.stop()

    app = FastAPI(
        title="musicweb exclusive-audio",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.state.hub = hub

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {"ok": True, "v": p.PROTOCOL_VERSION}

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
                await hub.handle_disconnect(sess.session_id)

    return app
