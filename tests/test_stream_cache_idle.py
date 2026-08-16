"""Stream-cache idle policy (no FastAPI / Transcoder)."""

import asyncio
import threading

import pytest

from musicweb.transcode.idle import (
    IDLE_AFTER_S,
    POLL_INTERVAL_S,
    StreamCacheIdle,
    idle_due,
    idle_sweep_loop,
)


class _Clock:
    def __init__(self, now: float = 0.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now


def test_constants() -> None:
    assert IDLE_AFTER_S == 3600
    assert POLL_INTERVAL_S == 60


def test_idle_due_false_at_zero_age() -> None:
    assert not idle_due(
        in_flight=0,
        last_seen=0.0,
        now=0.0,
        idle_after_s=10.0,
        already_swept=False,
    )


def test_idle_due_true_at_threshold() -> None:
    assert idle_due(
        in_flight=0,
        last_seen=0.0,
        now=10.0,
        idle_after_s=10.0,
        already_swept=False,
    )


def test_idle_due_false_while_in_flight() -> None:
    assert not idle_due(
        in_flight=1,
        last_seen=0.0,
        now=100.0,
        idle_after_s=10.0,
        already_swept=False,
    )


def test_idle_due_false_when_already_swept() -> None:
    assert not idle_due(
        in_flight=0,
        last_seen=0.0,
        now=100.0,
        idle_after_s=10.0,
        already_swept=True,
    )


def test_fresh_object_not_due() -> None:
    clock = _Clock(0.0)
    idle = StreamCacheIdle(idle_after_s=10.0, clock=clock)
    assert not idle.due()
    clock.now = 9.9
    assert not idle.due()
    clock.now = 10.0
    assert idle.due()


def test_in_flight_blocks_due() -> None:
    clock = _Clock(0.0)
    idle = StreamCacheIdle(idle_after_s=10.0, clock=clock)
    idle.mark_enter()
    assert idle.in_flight == 1
    clock.now = 100.0
    assert not idle.due()


def test_note_swept_then_enter_clears() -> None:
    clock = _Clock(0.0)
    idle = StreamCacheIdle(idle_after_s=10.0, clock=clock)
    clock.now = 10.0
    assert idle.due()
    idle.note_swept()
    assert idle.already_swept
    assert not idle.due()
    idle.mark_enter()
    assert not idle.already_swept
    idle.mark_exit()
    clock.now = 19.9
    assert not idle.due()
    clock.now = 20.0
    assert idle.due()


def test_last_seen_stamped_on_exit() -> None:
    clock = _Clock(0.0)
    idle = StreamCacheIdle(idle_after_s=10.0, clock=clock)
    idle.mark_enter()
    clock.now = 5.0
    idle.mark_exit()
    assert idle.in_flight == 0
    clock.now = 14.9
    assert not idle.due()
    clock.now = 15.0
    assert idle.due()


def test_mark_exit_clamps_at_zero() -> None:
    clock = _Clock(0.0)
    idle = StreamCacheIdle(idle_after_s=10.0, clock=clock)
    idle.mark_exit()
    assert idle.in_flight == 0


def test_async_enter_exit() -> None:
    clock = _Clock(0.0)
    idle = StreamCacheIdle(idle_after_s=10.0, clock=clock)

    async def run() -> None:
        await idle.enter()
        assert idle.in_flight == 1
        await idle.exit()
        assert idle.in_flight == 0

    asyncio.run(run())


def test_sweep_if_due_once_until_enter() -> None:
    clock = _Clock(0.0)
    idle = StreamCacheIdle(idle_after_s=1.0, clock=clock)
    calls: list[int] = []

    def clear_fn() -> int:
        calls.append(1)
        return 1

    async def run() -> None:
        clock.now = 1.0
        assert await idle.sweep_if_due(clear_fn)
        assert calls == [1]
        assert idle.already_swept
        assert not await idle.sweep_if_due(clear_fn)
        assert calls == [1]
        await idle.enter()
        await idle.exit()
        clock.now = 2.0
        assert await idle.sweep_if_due(clear_fn)
        assert calls == [1, 1]

    asyncio.run(run())


def test_sweep_if_due_noop_while_in_flight() -> None:
    clock = _Clock(0.0)
    idle = StreamCacheIdle(idle_after_s=1.0, clock=clock)

    async def run() -> None:
        await idle.enter()
        clock.now = 100.0
        assert not await idle.sweep_if_due(lambda: 1)
        await idle.exit()

    asyncio.run(run())


def test_enter_waits_during_clear() -> None:
    clock = _Clock(0.0)
    idle = StreamCacheIdle(idle_after_s=1.0, clock=clock)
    started = threading.Event()
    hold = threading.Event()

    def clear_fn() -> int:
        started.set()
        hold.wait()
        return 0

    async def run() -> None:
        clock.now = 1.0
        sweep = asyncio.create_task(idle.sweep_if_due(clear_fn))
        entered = await asyncio.to_thread(started.wait, 2.0)
        assert entered
        enter_task = asyncio.create_task(idle.enter())
        await asyncio.sleep(0.05)
        assert not enter_task.done()
        hold.set()
        assert await sweep
        await enter_task
        await idle.exit()

    asyncio.run(run())


def test_await_clear_drains_after_cancel() -> None:
    clock = _Clock(0.0)
    idle = StreamCacheIdle(idle_after_s=1.0, clock=clock)
    started = threading.Event()
    hold = threading.Event()
    finished: list[int] = []

    def clear_fn() -> int:
        started.set()
        hold.wait()
        finished.append(1)
        return 1

    async def run() -> None:
        clock.now = 1.0
        task = asyncio.create_task(idle.sweep_if_due(clear_fn))
        entered = await asyncio.to_thread(started.wait, 2.0)
        assert entered

        async def release() -> None:
            await asyncio.sleep(0.05)
            hold.set()

        releaser = asyncio.create_task(release())
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        await releaser
        assert finished == [1]

    asyncio.run(run())


def test_sweep_loop_stop_drains_in_flight_clear() -> None:
    clock = _Clock(0.0)
    idle = StreamCacheIdle(idle_after_s=1.0, clock=clock)
    started = threading.Event()
    hold = threading.Event()
    calls: list[int] = []

    def clear_fn() -> int:
        started.set()
        hold.wait()
        calls.append(1)
        return 1

    async def run() -> None:
        clock.now = 1.0
        stop = asyncio.Event()
        loop = asyncio.create_task(
            idle_sweep_loop(idle, clear_fn, stop, poll_s=0.05)
        )
        entered = await asyncio.to_thread(started.wait, 2.0)
        assert entered
        stop.set()
        await asyncio.sleep(0.05)
        assert not loop.done()
        hold.set()
        await loop
        assert calls == [1]

    asyncio.run(run())


def test_run_clear_does_not_note_swept() -> None:
    clock = _Clock(0.0)
    idle = StreamCacheIdle(idle_after_s=1.0, clock=clock)

    async def run() -> None:
        clock.now = 1.0
        assert await idle.run_clear(lambda: 3) == 3
        assert not idle.already_swept
        assert await idle.sweep_if_due(lambda: 1)

    asyncio.run(run())
