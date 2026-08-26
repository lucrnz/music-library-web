"""ExclusiveHub: controller loss must release exclusive device (mock player)."""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from typing import Any

import pytest

from musicweb.exclusive import protocol as p
from pathlib import Path
import tempfile

from musicweb.exclusive.session import ClientSession, ExclusiveHub


class FakePlayer:
    def __init__(self) -> None:
        self.release_calls = 0
        self.fail_release = False
        self.load_calls: list[str] = []
        self._device: str | None = None
        self._url: str | None = None
        self._paused = True
        self.gate: threading.Event | None = None
        self.entered_load = threading.Event()
        self.entered_set_device = threading.Event()

    def release_device(self) -> None:
        self.release_calls += 1
        if self.fail_release:
            raise RuntimeError("release failed")
        self._device = None
        self._url = None
        self._paused = True

    def set_device(self, mpv_device: str) -> None:
        self.entered_set_device.set()
        if self.gate is not None:
            self.gate.wait()
        self._device = mpv_device

    def load(self, url: str) -> None:
        self.entered_load.set()
        if self.gate is not None:
            self.gate.wait()
        self.load_calls.append(url)
        self._url = url
        self._paused = False

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
        self.close_calls = 0

    async def send_json(self, msg: dict[str, Any]) -> None:
        self.sent.append(msg)

    async def close(self) -> None:
        self.close_calls += 1


def _hub_with_fake() -> tuple[ExclusiveHub, FakePlayer]:
    hub = ExclusiveHub(
        companion_token="test-token",
        data_dir=Path(tempfile.mkdtemp()),
    )
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
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    hub._device_id = "dev-1"
    fake._device = "coreaudio/Dev1"

    asyncio.run(hub.handle_disconnect(sess))

    assert hub._controller_id is None
    assert hub._device_id is None
    assert fake.release_calls == 1
    assert "c1" not in hub._clients


def test_ttl_demotion_releases_idle_device():
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


def test_release_device_unhogs_while_stream_loaded():
    hub, fake = _hub_with_fake()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    hub._device_id = "dev-1"
    hub._rearm_device_id = "dev-1"
    fake._device = "coreaudio/Dev1"
    fake._url = "http://127.0.0.1/stream"
    fake._paused = False

    asyncio.run(hub.handle_message(sess, {"type": p.MSG_RELEASE_DEVICE}))

    assert fake.release_calls == 1
    assert fake._url is None
    assert fake._device is None
    assert hub._device_id is None
    assert hub._rearm_device_id is None
    assert hub._controller_id == "c1"
    assert sess.role == p.ROLE_CONTROLLER
    assert "c1" in hub._clients


def test_readonly_cannot_release_device():
    hub, fake = _hub_with_fake()
    _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    ws = FakeWebSocket()
    ro = _add_session(hub, "ro", role=p.ROLE_READONLY, ws=ws)
    hub._device_id = "dev-1"
    fake._device = "coreaudio/Dev1"
    fake._url = "http://127.0.0.1/stream"

    asyncio.run(hub.handle_message(ro, {"type": p.MSG_RELEASE_DEVICE}))

    assert fake.release_calls == 0
    assert hub._device_id == "dev-1"
    assert fake._url == "http://127.0.0.1/stream"
    assert any(m.get("code") == "readonly" for m in ws.sent)


def test_ttl_skips_while_stream_loaded():
    hub, fake = _hub_with_fake()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    hub._device_id = "dev-1"
    fake._device = "coreaudio/Dev1"
    fake._url = "http://127.0.0.1/stream"
    sess.last_heartbeat = time.monotonic() - (p.CONTROLLER_TTL_S + 1.0)

    asyncio.run(hub._check_ttl())

    assert hub._controller_id == "c1"
    assert hub._device_id == "dev-1"
    assert fake.release_calls == 0
    assert sess.role == p.ROLE_CONTROLLER


def test_readonly_disconnect_does_not_release():
    hub, fake = _hub_with_fake()
    _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    readonly = _add_session(hub, "r1", role=p.ROLE_READONLY)
    hub._device_id = "dev-1"
    fake._device = "coreaudio/Dev1"

    asyncio.run(hub.handle_disconnect(readonly))

    assert hub._controller_id == "c1"
    assert hub._device_id == "dev-1"
    assert fake.release_calls == 0


def test_double_disconnect_ensure_idempotent():
    hub, fake = _hub_with_fake()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    hub._device_id = "dev-1"

    async def run() -> None:
        await hub.handle_disconnect(sess)
        await hub.handle_disconnect(sess)
        await hub._ensure_no_controller_exclusive()

    asyncio.run(run())

    assert fake.release_calls == 2
    assert hub._device_id is None


def test_hello_invalid_token_logs(caplog):
    hub, _fake = _hub_with_fake()
    ws = FakeWebSocket()
    with caplog.at_level(logging.INFO, logger="musicweb.exclusive.session"):
        sess = asyncio.run(hub.handle_connect_hello(ws, "wrong", "c1"))
    assert sess is None
    assert ws.sent[0]["type"] == p.MSG_HELLO_REJECT
    assert "invalid_token" in caplog.text
    assert "wrong" not in caplog.text


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
    assert old_ws.close_calls == 1


def test_hello_replace_old_disconnect_is_noop():
    hub, fake = _hub_with_fake()
    old_ws = FakeWebSocket()
    old_sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=old_ws)
    hub._device_id = "dev-1"
    fake._device = "coreaudio/Dev1"

    new_ws = FakeWebSocket()
    new_sess = asyncio.run(hub.handle_connect_hello(new_ws, "test-token", "c1"))
    asyncio.run(hub.handle_disconnect(old_sess))

    assert new_sess is not None
    assert hub._clients.get("c1") is new_sess
    assert new_sess.role == p.ROLE_CONTROLLER
    assert hub._controller_id == "c1"
    assert hub._device_id == "dev-1"
    assert fake.release_calls == 0


def test_hello_replace_new_disconnect_releases():
    hub, fake = _hub_with_fake()
    _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    hub._device_id = "dev-1"
    fake._device = "coreaudio/Dev1"

    new_ws = FakeWebSocket()
    new_sess = asyncio.run(hub.handle_connect_hello(new_ws, "test-token", "c1"))
    assert new_sess is not None
    asyncio.run(hub.handle_disconnect(new_sess))

    assert hub._controller_id is None
    assert hub._device_id is None
    assert fake.release_calls == 1
    assert "c1" not in hub._clients


def test_displaced_handle_message_is_noop():
    hub, fake = _hub_with_fake()
    old_ws = FakeWebSocket()
    old_sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=old_ws)
    hub._device_id = "dev-1"

    new_ws = FakeWebSocket()
    new_sess = asyncio.run(hub.handle_connect_hello(new_ws, "test-token", "c1"))
    asyncio.run(
        hub.handle_message(
            old_sess,
            {"type": p.MSG_LOAD, "url": "http://127.0.0.1/stream"},
        )
    )

    assert new_sess is not None
    assert fake.load_calls == []
    assert hub._clients.get("c1") is new_sess
    assert new_sess.role == p.ROLE_CONTROLLER
    assert hub._controller_id == "c1"


def test_ttl_then_activity_reclaims_and_rearms():
    hub, fake = _hub_with_fake()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    hub._device_id = "dev-1"
    fake._device = "coreaudio/Dev1"
    sess.last_heartbeat = time.monotonic() - (p.CONTROLLER_TTL_S + 1.0)

    async def run() -> None:
        await hub._check_ttl()
        await hub.handle_message(sess, {"type": p.MSG_HEARTBEAT})

    asyncio.run(run())

    assert sess.role == p.ROLE_CONTROLLER
    assert hub._controller_id == "c1"
    assert hub._device_id == "dev-1"
    assert fake._device == "dev-1"
    assert fake.release_calls == 1


def test_ttl_then_load_reclaims_then_plays():
    hub, fake = _hub_with_fake()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    hub._device_id = "dev-1"
    fake._device = "coreaudio/Dev1"
    sess.last_heartbeat = time.monotonic() - (p.CONTROLLER_TTL_S + 1.0)

    async def run() -> None:
        await hub._check_ttl()
        await hub.handle_message(
            sess,
            {"type": p.MSG_LOAD, "url": "http://127.0.0.1/stream"},
        )

    asyncio.run(run())

    assert fake.load_calls == ["http://127.0.0.1/stream"]
    assert hub._controller_id == "c1"
    assert hub._device_id == "dev-1"
    assert sess.role == p.ROLE_CONTROLLER
    assert hub._clients.get("c1") is sess


def test_ttl_heartbeat_does_not_promote_other_session():
    hub, _fake = _hub_with_fake()
    c1 = _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    ws = FakeWebSocket()
    ro = _add_session(hub, "ro", role=p.ROLE_READONLY, ws=ws)
    c1.last_heartbeat = time.monotonic() - (p.CONTROLLER_TTL_S + 1.0)
    asyncio.run(hub._check_ttl())
    asyncio.run(hub.handle_message(ro, {"type": p.MSG_HEARTBEAT}))
    assert hub._controller_id is None
    assert ro.role == p.ROLE_READONLY
    asyncio.run(hub.handle_message(c1, {"type": p.MSG_HEARTBEAT}))
    assert hub._controller_id == "c1"
    assert c1.role == p.ROLE_CONTROLLER


def test_any_inbound_message_refreshes_heartbeat():
    hub, _fake = _hub_with_fake()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    sess.last_heartbeat = time.monotonic() - 30.0
    asyncio.run(hub.handle_message(sess, {"type": p.MSG_DISK_INFO}))
    assert time.monotonic() - sess.last_heartbeat < 1.0


def test_midflight_load_replace_skips_hub_write():
    hub, fake = _hub_with_fake()
    old_ws = FakeWebSocket()
    old_sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=old_ws)
    hub._device_id = "dev-1"
    fake.gate = threading.Event()

    async def run() -> None:
        task = asyncio.create_task(
            hub.handle_message(
                old_sess,
                {"type": p.MSG_LOAD, "url": "http://127.0.0.1/stream"},
            )
        )
        entered = await asyncio.to_thread(fake.entered_load.wait, 2.0)
        assert entered
        new_ws = FakeWebSocket()
        new_sess = await hub.handle_connect_hello(new_ws, "test-token", "c1")
        fake.gate.set()
        await task
        return new_sess, new_ws

    new_sess, new_ws = asyncio.run(run())

    assert new_sess is not None
    assert hub._clients.get("c1") is new_sess
    assert new_sess.role == p.ROLE_CONTROLLER
    assert hub._controller_id == "c1"
    assert hub._device_id == "dev-1"
    old_status = [
        m
        for m in old_ws.sent
        if m.get("type") == p.MSG_STATUS and m.get("reason") is None
    ]
    # Hello-replace does not send STATUS to the old socket; the stale LOAD
    # must not either.
    assert old_status == []
    assert not any(m.get("type") == p.MSG_STATUS for m in old_ws.sent)


def test_midflight_set_device_replace_skips_device_id():
    hub, fake = _hub_with_fake()
    old_ws = FakeWebSocket()
    old_sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=old_ws)
    hub._device_id = "dev-1"
    fake.gate = threading.Event()

    async def run() -> None:
        task = asyncio.create_task(
            hub.handle_message(
                old_sess,
                {"type": p.MSG_SET_DEVICE, "deviceId": "dev-2"},
            )
        )
        entered = await asyncio.to_thread(fake.entered_set_device.wait, 2.0)
        assert entered
        new_ws = FakeWebSocket()
        new_sess = await hub.handle_connect_hello(new_ws, "test-token", "c1")
        fake.gate.set()
        await task
        return new_sess

    new_sess = asyncio.run(run())

    assert new_sess is not None
    assert hub._clients.get("c1") is new_sess
    assert new_sess.role == p.ROLE_CONTROLLER
    assert hub._controller_id == "c1"
    assert hub._device_id == "dev-1"


def test_release_failure_keeps_hub_device_id():
    hub, fake = _hub_with_fake()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    hub._device_id = "dev-1"
    fake.fail_release = True

    with pytest.raises(RuntimeError, match="release failed"):
        asyncio.run(hub.handle_disconnect(sess))

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


def test_readonly_may_blob_stat_but_not_load():
    hub, _fake = _hub_with_fake()
    _add_session(hub, "c1", role=p.ROLE_CONTROLLER)
    ws = FakeWebSocket()
    ro = _add_session(hub, "ro", role=p.ROLE_READONLY, ws=ws)
    asyncio.run(
        hub.handle_message(
            ro, p.envelope(p.MSG_BLOB_STAT, key="audio/x.bin")
        )
    )
    types = [m.get("type") for m in ws.sent]
    assert p.MSG_BLOB_STAT_OK in types
    ws.sent.clear()
    asyncio.run(
        hub.handle_message(ro, p.envelope(p.MSG_LOAD, url="http://127.0.0.1/x"))
    )
    assert any(m.get("code") == "readonly" for m in ws.sent)


def test_blob_put_rejects_file_url():
    hub, _fake = _hub_with_fake()
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)
    asyncio.run(
        hub.handle_message(
            sess,
            p.envelope(
                p.MSG_BLOB_PUT,
                requestId="r1",
                key="audio/a.bin",
                url="file:///etc/passwd",
            ),
        )
    )
    assert any(m.get("type") == p.MSG_BLOB_ERROR for m in ws.sent)
    assert not (hub.data_dir / "audio" / "a.bin").exists()


def test_blob_put_jail_does_not_escape():
    hub, _fake = _hub_with_fake()
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)
    asyncio.run(
        hub.handle_message(
            sess,
            p.envelope(
                p.MSG_BLOB_PUT,
                requestId="r1",
                key="../escape",
                url="http://127.0.0.1/nope",
            ),
        )
    )
    types = [m.get("type") for m in ws.sent]
    assert p.MSG_BLOB_ERROR in types or p.MSG_ERROR in types
    assert not (hub.data_dir.parent / "escape").exists()
    for child in hub.data_dir.rglob("*"):
        assert "escape" not in child.name
