"""Companion optical port: stub, mocked libcdio, and watch cancel."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
import tempfile
from typing import Any

import pytest

from musicweb.exclusive import protocol as p
from musicweb.exclusive.optical import (
    LIBCDIO_INSTALL_HINT,
    UNSUPPORTED_HINT,
    CdText,
    DiscToc,
    OpticalDrive,
    OpticalError,
    OpticalMedia,
    StubOpticalPort,
    media_signature,
)
from musicweb.exclusive.optical_volume import VolumeMount
from musicweb.exclusive.optical_cdio import (
    DRIVER_DEVICE,
    DRIVER_OSX,
    TRACK_FORMAT_AUDIO,
    DarwinOpticalPort,
    _decode_c_string,
    audio_toc_from_tracks,
)
from musicweb.exclusive.session import ClientSession, ExclusiveHub


class FakePlayer:
    def start(self) -> None:
        return None

    def shutdown_process(self) -> None:
        return None

    def release_device(self) -> None:
        return None

    def status_snapshot(self) -> dict[str, Any]:
        return {
            "device": None,
            "volume": 100.0,
            "paused": True,
            "position": 0.0,
            "duration": 0.0,
            "url": None,
            "volume_path": "digital",
        }


class FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    async def send_json(self, msg: dict[str, Any]) -> None:
        self.sent.append(msg)

    async def close(self) -> None:
        return None


def _hub() -> ExclusiveHub:
    hub = ExclusiveHub(
        companion_token="test-token",
        data_dir=Path(tempfile.mkdtemp()),
    )
    hub._player = FakePlayer()  # type: ignore[assignment]
    return hub


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


TWO_TRACK_TOC = DiscToc(
    first_track=1,
    last_audio_track=2,
    leadout_lba=15000,
    offsets=[0, 7500],
)
TWO_TRACK_TEXT = CdText(
    album="Demo Album",
    artist="Demo Artist",
    tracks=["One", "Two"],
)


class FakeCdio:
    def __init__(self) -> None:
        self.paths = ["/dev/rdisk2"]
        self.eject_calls: list[str] = []
        self._open = object()

    def list_device_paths(self) -> list[str]:
        return list(self.paths)

    def open(self, device_id: str) -> Any:
        return self._open if device_id in self.paths else None

    def destroy(self, handle: Any) -> None:
        return None

    def hwinfo_name(self, handle: Any) -> str | None:
        return "Apple SuperDrive"

    def hwinfo_key(self, handle: Any) -> str | None:
        return "Apple|SuperDrive"

    def first_track(self, handle: Any) -> int:
        return 1

    def last_track(self, handle: Any) -> int:
        return 2

    def track_format(self, handle: Any, track: int) -> int:
        return TRACK_FORMAT_AUDIO

    def track_lsn(self, handle: Any, track: int) -> int:
        if track == 1:
            return 0
        if track == 2:
            return 7500
        if track == 0xAA:
            return 15000
        return -45301

    def cdtext_handle(self, handle: Any) -> Any | None:
        return object()

    def cdtext_field(self, cdtext: Any, field: int, track: int) -> str | None:
        if field == 0 and track == 0:
            return "Demo Album"
        if field == 1 and track == 0:
            return "Demo Artist"
        if field == 0 and track == 1:
            return "One"
        if field == 0 and track == 2:
            return "Two"
        return None

    def eject(self, device_id: str) -> None:
        self.eject_calls.append(device_id)


class FakeOptical:
    def __init__(self) -> None:
        self.reads = 0
        self.drop_calls = 0
        self.reader_open = False
        self.throw_read = False
        self.events: list[str] = []
        self.watch_gate = asyncio.Event()
        self.media = OpticalMedia(
            device_id="dev-cd",
            present=True,
            toc=TWO_TRACK_TOC,
            cd_text=TWO_TRACK_TEXT,
            kind="audio",
        )

    def list_drives(self) -> list[OpticalDrive]:
        return [OpticalDrive(id="dev-cd", name="SuperDrive")]

    def read(self, device_id: str) -> OpticalMedia:
        if self.throw_read:
            raise RuntimeError("busy")
        self.reads += 1
        return self.media

    def eject(self, device_id: str) -> None:
        self.events.append("eject")
        if self.reader_open:
            raise OpticalError("busy", code="busy")

    def missing_lib_hint(self) -> str | None:
        return None

    def last_media(self):
        return self.media

    def open_track(self, device_id: str, track_no: int):
        self.reader_open = True
        return object()

    def drop_reader(self) -> None:
        self.events.append("drop")
        self.drop_calls += 1
        self.reader_open = False

    def live_reader_device(self) -> str | None:
        return "dev-cd" if self.reader_open else None


def test_stub_lists_nothing_and_eject_is_error():
    port = StubOpticalPort()
    assert port.list_drives() == []
    assert port.read("any").present is False
    assert port.missing_lib_hint() is None
    with pytest.raises(OpticalError, match="not supported") as exc:
        port.eject("/dev/rdisk2")
    assert exc.value.code == "unsupported"


def test_libcdio_driver_ids_match_current():
    assert DRIVER_OSX == 6
    assert DRIVER_DEVICE == 11


def test_cdtext_latin1_cafe_round_trips():
    assert _decode_c_string("café".encode("latin-1")) == "café"


def test_cdtext_msjis_japanese_not_replacement():
    raw = "あいう".encode("cp932")
    text = _decode_c_string(raw)
    assert text == "あいう"
    assert "\ufffd" not in text


def test_audio_toc_drops_trailing_data_track():
    toc = audio_toc_from_tracks(
        1,
        3,
        {1: 0, 2: 0, 3: 3},
        {1: 0, 2: 1000, 3: 2000},
        3000,
    )
    assert toc is not None
    assert toc.last_audio_track == 2
    assert toc.offsets == [0, 1000]
    assert toc.leadout_lba == 2000


def test_darwin_port_mocked_toc_and_cd_text():
    port = DarwinOpticalPort(lib=FakeCdio())
    drives = port.list_drives()
    assert drives == [
        OpticalDrive(
            id="/dev/rdisk2",
            name="Apple SuperDrive",
            key="Apple|SuperDrive",
        )
    ]
    assert drives[0].to_dict()["key"] == "Apple|SuperDrive"
    media = port.read("/dev/rdisk2")
    assert media.present is True
    assert media.toc == TWO_TRACK_TOC
    assert media.cd_text == TWO_TRACK_TEXT
    port.eject("/dev/rdisk2")


def test_darwin_drive_key_falls_back_to_path():
    lib = FakeCdio()
    lib.hwinfo_name = lambda handle: None  # type: ignore[method-assign]
    lib.hwinfo_key = lambda handle: None  # type: ignore[method-assign]
    port = DarwinOpticalPort(lib=lib)
    drives = port.list_drives()
    assert drives == [
        OpticalDrive(id="/dev/rdisk2", name="/dev/rdisk2", key="/dev/rdisk2")
    ]


def test_darwin_missing_lib_is_empty_with_hint():
    port = DarwinOpticalPort()
    port._lib = None
    port._missing = True
    assert port.list_drives() == []
    assert port.missing_lib_hint() == LIBCDIO_INSTALL_HINT
    assert port.read("x").present is False
    with pytest.raises(OpticalError) as exc:
        port.eject("x")
    assert exc.value.code == "libcdio_missing"


def test_media_signature_changes_on_toc():
    a = OpticalMedia("d", True, TWO_TRACK_TOC, None)
    b = OpticalMedia(
        "d",
        True,
        DiscToc(1, 2, 16000, [0, 7500]),
        None,
    )
    assert media_signature(a) != media_signature(b)


def test_media_signature_changes_on_volume_id():
    pending = OpticalMedia(
        "d", True, None, None, kind="data", volume_id=None
    )
    first = OpticalMedia(
        "d", True, None, None, kind="data", volume_id="vol-1"
    )
    other = OpticalMedia(
        "d", True, None, None, kind="data", volume_id="vol-2"
    )
    assert media_signature(pending) != media_signature(first)
    assert media_signature(first) != media_signature(other)
    assert "vol-1" not in str(first.to_dict())
    assert first.to_dict()["volume_name"] is None


def test_readonly_cannot_watch_or_eject():
    hub = _hub()
    ws = FakeWebSocket()
    sess = _add_session(hub, "ro", role=p.ROLE_READONLY, ws=ws)

    asyncio.run(
        hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
    )
    asyncio.run(
        hub.handle_message(
            sess, p.envelope(p.MSG_EJECT_OPTICAL, deviceId="dev-cd")
        )
    )
    assert all(m.get("code") == "readonly" for m in ws.sent)
    assert hub._optical_watch_task is None


def test_stub_eject_sends_optical_error_not_crash():
    hub = _hub()
    hub._optical = StubOpticalPort()
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    asyncio.run(
        hub.handle_message(sess, p.envelope(p.MSG_EJECT_OPTICAL, deviceId="dev"))
    )
    errors = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_ERROR]
    assert errors
    assert errors[0]["code"] == "unsupported"


def test_watch_off_cancels_poll_task():
    hub = _hub()
    fake = FakeOptical()
    hub._optical = fake  # type: ignore[assignment]
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        task = hub._optical_watch_task
        assert task is not None
        await asyncio.sleep(0.05)
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))
        assert hub._optical_watch_task is None
        await asyncio.sleep(0)
        assert task.cancelled() or task.done()
        media = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
        assert media
        assert media[0]["present"] is True
        assert media[0]["toc"]["last_audio_track"] == 2

    asyncio.run(_run())


def test_open_track_reuses_reader_until_track_changes():
    from musicweb.exclusive.cdda_stream import MemorySectorSource
    from musicweb.exclusive.optical_cdio import DarwinOpticalPort

    source = MemorySectorSource()
    port = DarwinOpticalPort(lib=FakeCdio(), sector_source=source)
    assert port.read("/dev/rdisk2").present is True
    first = port.open_track("/dev/rdisk2", 1)
    again = port.open_track("/dev/rdisk2", 1)
    assert first is not None
    assert first is again
    other = port.open_track("/dev/rdisk2", 2)
    assert other is not None
    assert other is not first
    assert first.closed is True


def test_release_device_leaves_watch_and_reader():
    hub = _hub()
    fake = FakeOptical()
    hub._optical = fake  # type: ignore[assignment]
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        task = hub._optical_watch_task
        assert task is not None
        await asyncio.sleep(0.05)
        drops_before = fake.drop_calls
        await hub.handle_message(sess, p.envelope(p.MSG_RELEASE_DEVICE))
        assert hub._optical_watch_task is task
        assert not task.done()
        assert fake.drop_calls == drops_before
        fake.media = OpticalMedia(
            device_id="dev-cd",
            present=False,
            toc=None,
            cd_text=None,
        )
        await asyncio.sleep(1.1)
        media = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
        assert any(m.get("present") is False for m in media)
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))
        assert hub._optical_watch_task is None

    asyncio.run(_run())


@pytest.mark.skipif(sys.platform == "darwin", reason="stub port is non-Mac")
def test_default_port_is_stub_off_darwin():
    from musicweb.exclusive.optical import get_optical_port

    assert isinstance(get_optical_port(), StubOpticalPort)


def test_darwin_data_session_is_kind_data_not_gone():
    lib = FakeCdio()
    lib.track_format = lambda handle, track: 3  # type: ignore[method-assign]
    port = DarwinOpticalPort(lib=lib)
    media = port.read("/dev/rdisk2")
    assert media.present is True
    assert media.kind == "data"
    assert media.toc is None


def test_paranoia_missing_is_optical_error(monkeypatch: pytest.MonkeyPatch):
    def boom(device_id: str):
        raise OSError("libcdio-paranoia not found")

    monkeypatch.setattr(
        "musicweb.exclusive.optical_cdio.ParanoiaSource", boom
    )
    port = DarwinOpticalPort(lib=FakeCdio())
    assert port.read("/dev/rdisk2").present is True
    with pytest.raises(OpticalError) as exc:
        port.open_track("/dev/rdisk2", 1)
    assert exc.value.code == "libcdio_paranoia_missing"


def test_watch_skips_read_while_reader_live():
    hub = _hub()
    fake = FakeOptical()
    hub._optical = fake  # type: ignore[assignment]
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        await asyncio.sleep(0.05)
        hub.optical.open_track("dev-cd", 1)
        fake.throw_read = True
        before = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
        await asyncio.sleep(1.1)
        after = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
        assert after == before
        assert not any(m.get("present") is False for m in after)
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


def test_eject_drops_reader_before_ioctl():
    hub = _hub()
    fake = FakeOptical()
    hub._optical = fake  # type: ignore[assignment]
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)
    hub.optical.open_track("dev-cd", 1)
    assert fake.reader_open is True

    asyncio.run(
        hub.handle_message(sess, p.envelope(p.MSG_EJECT_OPTICAL, deviceId="dev-cd"))
    )
    assert fake.events[:2] == ["drop", "eject"]
    media = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
    assert media
    assert media[-1]["present"] is False
    assert media[-1]["kind"] == "none"


def test_rewatch_on_does_not_drop_live_reader():
    hub = _hub()
    fake = FakeOptical()
    hub._optical = fake  # type: ignore[assignment]
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        hub.optical.open_track("dev-cd", 1)
        drops = fake.drop_calls
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        assert fake.drop_calls == drops
        assert fake.reader_open is True
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


def test_open_track_paranoia_error_broadcasts():
    hub = _hub()

    class BoomPort(FakeOptical):
        def open_track(self, device_id: str, track_no: int):
            raise OpticalError(
                "Install libcdio-paranoia: brew install libcdio libcdio-paranoia",
                code="libcdio_paranoia_missing",
            )

    fake = BoomPort()
    hub._optical = fake  # type: ignore[assignment]
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        assert hub.open_cdda_track("dev-cd", 1) is None
        await asyncio.sleep(0)
        errors = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_ERROR]
        assert errors
        assert errors[-1]["code"] == "libcdio_paranoia_missing"
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


class FakeVolumeInfo:
    def __init__(
        self,
        mount: VolumeMount | None = None,
        *,
        present: bool | None = True,
    ) -> None:
        self.mount = mount
        self.present = present
        self.calls = 0

    def resolve(self, device_id: str) -> VolumeMount | None:
        self.calls += 1
        return self.mount

    def device_present(self, device_id: str) -> bool | None:
        return self.present


class DataFakeOptical(FakeOptical):
    def __init__(self) -> None:
        super().__init__()
        self.media = OpticalMedia(
            device_id="dev-cd",
            present=True,
            toc=None,
            cd_text=None,
            kind="data",
        )


def _data_hub(tmp_path: Path, volume: FakeVolumeInfo) -> ExclusiveHub:
    hub = _hub()
    hub._optical = DataFakeOptical()  # type: ignore[assignment]
    hub.optical._volume_info = volume
    return hub


def test_data_disc_walks_and_auto_add(tmp_path: Path):
    (tmp_path / "Music").mkdir()
    (tmp_path / "Music" / "a.mp3").write_bytes(b"x")
    (tmp_path / "Music" / "b.flac").write_bytes(b"x")
    volume = FakeVolumeInfo(
        VolumeMount(name="MYCD", path=tmp_path, volume_id="vol-1")
    )
    hub = _data_hub(tmp_path, volume)
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        await asyncio.sleep(0.05)
        media = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
        assert media
        assert media[0]["kind"] == "data"
        assert media[0]["present"] is True
        assert media[0]["volume_name"] == "MYCD"
        assert "volume_id" not in media[0]
        indexes = [m for m in ws.sent if m.get("type") == p.MSG_CDROM_INDEX]
        assert indexes
        assert indexes[0]["auto_add_rel"] == "Music"
        assert indexes[0]["volume_name"] == "MYCD"
        await hub.handle_message(
            sess, p.envelope(p.MSG_LIST_CDROM, deviceId="dev-cd", rel="Music")
        )
        lists = [m for m in ws.sent if m.get("type") == p.MSG_CDROM_LIST]
        assert lists
        rels = {f["rel"] for f in lists[-1]["files"]}
        assert rels == {"Music/a.mp3", "Music/b.flac"}
        assert {f["source_codec"] for f in lists[-1]["files"]} == {"mp3", "flac"}
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


def test_data_watch_does_not_read_after_first_classify(tmp_path: Path):
    volume = FakeVolumeInfo(
        VolumeMount(name="MYCD", path=tmp_path, volume_id="vol-1")
    )
    hub = _data_hub(tmp_path, volume)
    fake = hub.optical.port
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        await asyncio.sleep(0.05)
        assert fake.reads == 1
        await asyncio.sleep(1.1)
        assert fake.reads == 1
        assert volume.calls >= 2
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


def test_data_pending_then_mount_walks(tmp_path: Path):
    (tmp_path / "only.mp3").write_bytes(b"x")
    volume = FakeVolumeInfo(None)
    hub = _data_hub(tmp_path, volume)
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        await asyncio.sleep(0.05)
        media = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
        assert media[0]["kind"] == "data"
        assert media[0]["present"] is True
        assert media[0]["volume_name"] is None
        indexes = [m for m in ws.sent if m.get("type") == p.MSG_CDROM_INDEX]
        assert indexes
        assert indexes[0]["auto_add_rel"] is None
        volume.mount = VolumeMount(name="LATER", path=tmp_path, volume_id="vol-9")
        await asyncio.sleep(1.1)
        media = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
        assert any(m.get("volume_name") == "LATER" for m in media)
        indexes = [m for m in ws.sent if m.get("type") == p.MSG_CDROM_INDEX]
        assert indexes[-1]["auto_add_rel"] == ""
        assert indexes[-1]["volume_name"] == "LATER"
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


def test_same_name_new_volume_id_rebuilds(tmp_path: Path):
    first = tmp_path / "one"
    second = tmp_path / "two"
    first.mkdir()
    second.mkdir()
    (first / "a.mp3").write_bytes(b"x")
    (second / "Music").mkdir()
    (second / "Music" / "b.flac").write_bytes(b"x")
    volume = FakeVolumeInfo(
        VolumeMount(name="SAME", path=first, volume_id="vol-a")
    )
    hub = _data_hub(tmp_path, volume)
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        await asyncio.sleep(0.05)
        indexes = [m for m in ws.sent if m.get("type") == p.MSG_CDROM_INDEX]
        assert indexes[-1]["auto_add_rel"] == ""
        volume.mount = VolumeMount(name="SAME", path=second, volume_id="vol-b")
        await asyncio.sleep(1.1)
        indexes = [m for m in ws.sent if m.get("type") == p.MSG_CDROM_INDEX]
        assert indexes[-1]["auto_add_rel"] == "Music"
        await hub.handle_message(
            sess, p.envelope(p.MSG_LIST_CDROM, deviceId="dev-cd", rel="Music")
        )
        lists = [m for m in ws.sent if m.get("type") == p.MSG_CDROM_LIST]
        assert lists[-1]["files"][0]["rel"] == "Music/b.flac"
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


def test_data_watch_keeps_present_on_transient_volume_miss(tmp_path: Path):
    (tmp_path / "ok.mp3").write_bytes(b"x")
    volume = FakeVolumeInfo(
        VolumeMount(name="MYCD", path=tmp_path, volume_id="vol-1")
    )
    hub = _data_hub(tmp_path, volume)
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        await asyncio.sleep(0.05)
        volume.mount = None
        await asyncio.sleep(1.1)
        media = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
        assert media
        assert not any(m.get("present") is False for m in media)
        await hub.handle_message(
            sess, p.envelope(p.MSG_LIST_CDROM, deviceId="dev-cd", rel="")
        )
        lists = [m for m in ws.sent if m.get("type") == p.MSG_CDROM_LIST]
        assert lists[-1]["files"]
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


def test_data_pending_unknown_presence_stays_data(tmp_path: Path):
    volume = FakeVolumeInfo(None, present=None)
    hub = _data_hub(tmp_path, volume)
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        await asyncio.sleep(0.05)
        media = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
        assert media[0]["kind"] == "data"
        assert media[0]["present"] is True
        await asyncio.sleep(1.1)
        media = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
        assert not any(m.get("present") is False for m in media)
        assert media[-1]["kind"] == "data"
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


def test_data_vanished_mount_path_is_gone(tmp_path: Path):
    vol = tmp_path / "vol"
    vol.mkdir()
    (vol / "ok.mp3").write_bytes(b"x")
    volume = FakeVolumeInfo(VolumeMount(name="MYCD", path=vol, volume_id="vol-1"))
    hub = _data_hub(tmp_path, volume)
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        await asyncio.sleep(0.05)
        media = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
        assert media[0]["kind"] == "data"
        assert media[0]["present"] is True
        (vol / "ok.mp3").unlink()
        vol.rmdir()
        await asyncio.sleep(1.1)
        media = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
        assert any(m.get("present") is False and m.get("kind") == "none" for m in media)
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


def test_data_pending_eject_becomes_gone(tmp_path: Path):
    volume = FakeVolumeInfo(None, present=True)
    hub = _data_hub(tmp_path, volume)
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        await asyncio.sleep(0.05)
        media = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
        assert media[0]["kind"] == "data"
        assert media[0]["present"] is True
        volume.present = False
        await asyncio.sleep(1.1)
        media = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
        assert any(m.get("present") is False and m.get("kind") == "none" for m in media)
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


def test_list_cdrom_escape_is_empty(tmp_path: Path):
    (tmp_path / "ok.mp3").write_bytes(b"x")
    volume = FakeVolumeInfo(
        VolumeMount(name="MYCD", path=tmp_path, volume_id="vol-1")
    )
    hub = _data_hub(tmp_path, volume)
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        await asyncio.sleep(0.05)
        await hub.handle_message(
            sess,
            p.envelope(p.MSG_LIST_CDROM, deviceId="dev-cd", rel="../etc/passwd"),
        )
        lists = [m for m in ws.sent if m.get("type") == p.MSG_CDROM_LIST]
        assert lists[-1]["dirs"] == []
        assert lists[-1]["files"] == []
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


def test_enrich_pushes_cdrom_list_without_client_list(tmp_path: Path, monkeypatch):
    from musicweb.exclusive.optical_meta import FileMeta
    import musicweb.exclusive.optical_session as optical_session

    (tmp_path / "Music").mkdir()
    (tmp_path / "Music" / "a.mp3").write_bytes(b"x")

    def fake_enrich(path: Path) -> FileMeta:
        return FileMeta(
            title="Tagged",
            artist="Someone",
            album="Disc",
            albumartist=None,
            track=1,
            disc=None,
            year=None,
            duration=12.0,
            sample_rate_hz=44100,
            bit_depth=None,
            channels=2,
            source_codec="mp3",
            has_cover=True,
            has_local_lyrics=False,
        )

    monkeypatch.setattr(optical_session, "enrich_file", fake_enrich)
    volume = FakeVolumeInfo(
        VolumeMount(name="MYCD", path=tmp_path, volume_id="vol-1")
    )
    hub = _data_hub(tmp_path, volume)
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        for _ in range(20):
            pushed = [
                m
                for m in ws.sent
                if m.get("type") == p.MSG_CDROM_LIST and m.get("rel") == "Music"
            ]
            if pushed and any(
                f.get("title") == "Tagged" for f in pushed[-1].get("files") or []
            ):
                break
            await asyncio.sleep(0.05)
        pushed = [
            m
            for m in ws.sent
            if m.get("type") == p.MSG_CDROM_LIST and m.get("rel") == "Music"
        ]
        assert pushed
        assert pushed[-1]["files"][0]["title"] == "Tagged"
        assert pushed[-1]["files"][0]["has_cover"] is True
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


def test_tagged_volume_file_lists_mutagen_tags(tmp_path: Path):
    from tests.exclusive.test_optical_meta import _tagged_mp3

    _tagged_mp3(tmp_path / "song.mp3")
    volume = FakeVolumeInfo(
        VolumeMount(name="MYCD", path=tmp_path, volume_id="vol-1")
    )
    hub = _data_hub(tmp_path, volume)
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        tagged = None
        for _ in range(40):
            lists = [m for m in ws.sent if m.get("type") == p.MSG_CDROM_LIST]
            for msg in lists:
                for item in msg.get("files") or []:
                    if item.get("title") == "Tagged Title":
                        tagged = item
                        break
                if tagged:
                    break
            if tagged:
                break
            await asyncio.sleep(0.05)
        assert tagged is not None
        assert tagged["artist"] == "Tagged Artist"
        assert tagged["album"] == "Tagged Album"
        assert tagged["track"] == 4
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


def test_walk_error_on_classify_keeps_watch(tmp_path: Path, monkeypatch):
    import musicweb.exclusive.optical_session as optical_session

    def boom(_root: Path):
        raise OSError("scratched directory")

    monkeypatch.setattr(optical_session, "walk_volume", boom)
    volume = FakeVolumeInfo(
        VolumeMount(name="MYCD", path=tmp_path, volume_id="vol-1")
    )
    hub = _data_hub(tmp_path, volume)
    fake = hub.optical.port
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        await asyncio.sleep(0.05)
        assert fake.reads == 1
        assert hub.optical.watch_task is not None
        media = [m for m in ws.sent if m.get("type") == p.MSG_OPTICAL_MEDIA]
        assert media
        assert media[0]["kind"] == "data"
        await asyncio.sleep(1.1)
        assert hub.optical.watch_task is not None
        assert not hub.optical.watch_task.done()
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


def test_rewatch_resends_same_generation_index(tmp_path: Path):
    (tmp_path / "ok.mp3").write_bytes(b"x")
    volume = FakeVolumeInfo(
        VolumeMount(name="MYCD", path=tmp_path, volume_id="vol-1")
    )
    hub = _data_hub(tmp_path, volume)
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        await asyncio.sleep(0.05)
        first = [m for m in ws.sent if m.get("type") == p.MSG_CDROM_INDEX]
        assert first
        gen = first[-1]["generation"]
        assert gen >= 1
        ws.sent.clear()
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        await asyncio.sleep(0.05)
        again = [m for m in ws.sent if m.get("type") == p.MSG_CDROM_INDEX]
        assert again
        assert again[-1]["generation"] == gen
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())


def test_read_optical_does_not_toc_open_live_data(tmp_path: Path):
    (tmp_path / "ok.mp3").write_bytes(b"x")
    volume = FakeVolumeInfo(
        VolumeMount(name="MYCD", path=tmp_path, volume_id="vol-1")
    )
    hub = _data_hub(tmp_path, volume)
    fake = hub.optical.port
    ws = FakeWebSocket()
    sess = _add_session(hub, "c1", role=p.ROLE_CONTROLLER, ws=ws)

    async def _run() -> None:
        await hub.handle_message(
            sess, p.envelope(p.MSG_WATCH_OPTICAL, on=True, deviceId="dev-cd")
        )
        await asyncio.sleep(0.05)
        assert fake.reads == 1
        await hub.handle_message(
            sess, p.envelope(p.MSG_READ_OPTICAL, deviceId="dev-cd")
        )
        assert fake.reads == 1
        indexes = [m for m in ws.sent if m.get("type") == p.MSG_CDROM_INDEX]
        assert indexes
        await hub.handle_message(sess, p.envelope(p.MSG_WATCH_OPTICAL, on=False))

    asyncio.run(_run())
