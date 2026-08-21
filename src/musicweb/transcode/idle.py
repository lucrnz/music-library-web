"""Idle eviction policy for the process-temp stream cache."""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from collections.abc import Awaitable, Callable
from typing import Any

logger = logging.getLogger(__name__)

IDLE_AFTER_S = 3600
POLL_INTERVAL_S = 60


def idle_due(
    *,
    in_flight: int,
    last_seen: float,
    now: float,
    idle_after_s: float,
    already_swept: bool,
) -> bool:
    if already_swept or in_flight > 0:
        return False
    return (now - last_seen) >= idle_after_s


class StreamCacheIdle:
    """In-flight / last-seen counters for stream-cache idle eviction."""

    def __init__(
        self,
        *,
        idle_after_s: float = IDLE_AFTER_S,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self._idle_after_s = idle_after_s
        self._clock = time.monotonic if clock is None else clock
        self._lock = threading.Lock()
        self._last_seen = self._clock()
        self._in_flight = 0
        self._already_swept = False
        self._gate: asyncio.Lock | None = None

    def _ensure_gate(self) -> asyncio.Lock:
        if self._gate is None:
            self._gate = asyncio.Lock()
        return self._gate

    @property
    def in_flight(self) -> int:
        with self._lock:
            return self._in_flight

    @property
    def already_swept(self) -> bool:
        with self._lock:
            return self._already_swept

    def mark_enter(self) -> None:
        with self._lock:
            self._in_flight += 1
            self._last_seen = self._clock()
            self._already_swept = False

    def mark_exit(self) -> None:
        with self._lock:
            if self._in_flight > 0:
                self._in_flight -= 1
            self._last_seen = self._clock()

    def note_swept(self) -> None:
        with self._lock:
            self._already_swept = True

    def due(self) -> bool:
        with self._lock:
            return idle_due(
                in_flight=self._in_flight,
                last_seen=self._last_seen,
                now=self._clock(),
                idle_after_s=self._idle_after_s,
                already_swept=self._already_swept,
            )

    async def enter(self) -> None:
        async with self._ensure_gate():
            self.mark_enter()

    async def exit(self) -> None:
        async with self._ensure_gate():
            self.mark_exit()

    async def _await_exclusive(self, fn: Callable[[], int]) -> int:
        task = asyncio.create_task(asyncio.to_thread(fn))
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            await task
            raise

    async def sweep_if_due(self, clear_fn: Callable[[], int]) -> bool:
        async with self._ensure_gate():
            if not self.due():
                return False
            await self._await_exclusive(clear_fn)
            self.note_swept()
            return True

    async def run_exclusive(self, fn: Callable[[], int]) -> int:
        async with self._ensure_gate():
            return await self._await_exclusive(fn)


async def idle_sweep_loop(
    idle: StreamCacheIdle,
    clear_fn: Callable[[], int],
    stop: asyncio.Event,
    *,
    poll_s: float = POLL_INTERVAL_S,
) -> None:
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=poll_s)
        except TimeoutError:
            try:
                await idle.sweep_if_due(clear_fn)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Idle stream-cache sweep failed")


class StreamCacheIdleMiddleware:
    """Raw ASGI wrapper: in_flight covers the full HTTP body send."""

    def __init__(
        self, app: Callable[..., Awaitable[None]], idle: StreamCacheIdle
    ) -> None:
        self.app = app
        self.idle = idle

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        await self.idle.enter()
        try:
            await self.app(scope, receive, send)
        finally:
            await self.idle.exit()
