"""Raw ASGI body-lifetime for StreamCacheIdleMiddleware. No create_app."""

from __future__ import annotations

import asyncio
from typing import Any

from starlette.applications import Starlette
from starlette.responses import StreamingResponse
from starlette.routing import Route

from musicweb.transcode.idle import StreamCacheIdle, StreamCacheIdleMiddleware


def _http_scope(path: str = "/") -> dict[str, Any]:
    return {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.4"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
        "client": ("127.0.0.1", 123),
        "server": ("test", 80),
    }


def test_in_flight_spans_delayed_body() -> None:
    started = asyncio.Event()
    hold = asyncio.Event()
    idle = StreamCacheIdle(idle_after_s=10.0)

    async def delayed(_request: object) -> StreamingResponse:
        async def gen():
            started.set()
            await hold.wait()
            yield b"x"

        return StreamingResponse(gen())

    inner = Starlette(routes=[Route("/", delayed)])
    app = StreamCacheIdleMiddleware(inner, idle=idle)

    async def run() -> None:
        async def receive() -> dict[str, Any]:
            return {"type": "http.request", "body": b"", "more_body": False}

        async def send(_message: dict[str, Any]) -> None:
            return None

        task = asyncio.create_task(app(_http_scope(), receive, send))
        await asyncio.wait_for(started.wait(), timeout=2)
        assert idle.in_flight == 1
        hold.set()
        await task
        assert idle.in_flight == 0
        assert not idle.due()

    asyncio.run(run())


def test_non_http_scope_uncounted() -> None:
    idle = StreamCacheIdle(idle_after_s=10.0)
    seen = {"called": False}

    async def inner(scope: dict[str, Any], receive: Any, send: Any) -> None:
        seen["called"] = True

    app = StreamCacheIdleMiddleware(inner, idle=idle)

    async def run() -> None:
        async def receive() -> dict[str, Any]:
            return {"type": "lifespan.startup"}

        async def send(_message: dict[str, Any]) -> None:
            return None

        await app({"type": "lifespan"}, receive, send)
        assert seen["called"]
        assert idle.in_flight == 0

    asyncio.run(run())
