"""ExclusiveHub: controller loss must release exclusive device (mock player)."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import pytest

from musicweb.exclusive import protocol as p
from musicweb.exclusive.session import ClientSession, ExclusiveHub


class FakePlayer:
    def __init__(self) -> None:
        self.release_calls = 0
        self.fail_release = False
        self._device: str | None = None
        self._url: str | None = None
        self._paused = True

    def release_device(self) -> None:
        self.release_calls += 1
        if self.fail_release:
            raise RuntimeError("release failed")
        self._device = None
        self._url = None
        self._paused = True

    def set_device(self, mpv_device: str) -> None:
        self._device = mpv_device

    def status_snapshot(self) -> dict[str, Any]:
        return {
            "device": self._device,
            "volume": 100.0,
            "paused": self._paused,
            "position": 0.0,
            "duration": 0.0,
            "url": self._url,
            "volume_path": "digital",
        }


class FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    async def send_json(self, msg: dict[str, Any]) -> None:
        self.sent.append(msg)


def _hub_with_fake() -> tuple[ExclusiveHub, FakePlayer]:
    hub = ExclusiveHub(hog_token="test-token")
    fake = FakePlayer()
    hub._player = fake  # type: ignore[assignment]
    return hub, fake


def _add_session(
    hub: ExclusiveHub,
    session_id: str,
    *,
    role: str,
    ws: FakeWebSocket | None = None,
) -> ClientSession:
    sess = ClientSession(
        session_id=session_id,
        websocket=ws or FakeWebSocket(),
        role=role,
    )
    hub._clients[session_id] = sess
    if role == p.ROLE_CONTROLLER:
        hub._controller_id = session_id
    return sess


def test_controller_disconnect_releases_device():
    hub, fake = _hub_with_fake()
    _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    hub._device_id = "dev-1"
    fake._device = "coreaudio/Dev1"

    asyncio.run(hub.handle_disconnect("c1"))

    assert hub._controller_id is None
    assert hub._device_id is None
    assert fake.release_calls == 1
    assert "c1" not in hub._clients


def test_ttl_demotion_releases_device():
    hub, fake = _hub_with_fake()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    hub._device_id = "dev-1"
    fake._device = "coreaudio/Dev1"
    sess.last_heartbeat = time.monotonic() - (p.CONTROLLER_TTL_S + 1.0)

    asyncio.run(hub._check_ttl())

    assert hub._controller_id is None
    assert hub._device_id is None
    assert fake.release_calls == 1
    assert sess.role == p.ROLE_READONLY
    assert "c1" in hub._clients
    ttl_msgs = [
        m
        for m in sess.websocket.sent
        if m.get("type") == p.MSG_STATUS and m.get("reason") == "controller_ttl"
    ]
    assert ttl_msgs


def test_readonly_disconnect_does_not_release():
    hub, fake = _hub_with_fake()
    _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    _add_session(hub, "r1", role=p.ROLE_READONLY)
    hub._device_id = "dev-1"
    fake._device = "coreaudio/Dev1"

    asyncio.run(hub.handle_disconnect("r1"))

    assert hub._controller_id == "c1"
    assert hub._device_id == "dev-1"
    assert fake.release_calls == 0


def test_double_disconnect_ensure_idempotent():
    hub, fake = _hub_with_fake()
    _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    hub._device_id = "dev-1"

    async def run() -> None:
        await hub.handle_disconnect("c1")
        await hub.handle_disconnect("c1")
        await hub._ensure_no_controller_exclusive()

    asyncio.run(run())

    assert fake.release_calls == 2
    assert hub._device_id is None


def test_hello_replace_same_session_does_not_release():
    hub, fake = _hub_with_fake()
    old_ws = FakeWebSocket()
    _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=old_ws)
    hub._device_id = "dev-1"
    fake._device = "coreaudio/Dev1"

    new_ws = FakeWebSocket()
    sess = asyncio.run(hub.handle_connect_hello(new_ws, "test-token", "c1"))

    assert sess is not None
    assert sess.role == p.ROLE_CONTROLLER
    assert hub._controller_id == "c1"
    assert hub._device_id == "dev-1"
    assert fake.release_calls == 0


def test_release_failure_keeps_hub_device_id():
    hub, fake = _hub_with_fake()
    _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    hub._device_id = "dev-1"
    fake.fail_release = True

    with pytest.raises(RuntimeError, match="release failed"):
        asyncio.run(hub.handle_disconnect("c1"))

    assert hub._controller_id is None
    assert hub._device_id == "dev-1"
    assert fake.release_calls == 1


def test_missing_controller_session_releases():
    """TTL path when controller id is stale (session map missing)."""
    hub, fake = _hub_with_fake()
    hub._controller_id = "ghost"
    hub._device_id = "dev-1"

    asyncio.run(hub._check_ttl())

    assert hub._controller_id is None
    assert hub._device_id is None
    assert fake.release_calls == 1
