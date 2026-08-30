import socket

import pytest

from musicweb.exclusive.mpv_ipc import (
    PIPE_PREFIX,
    _complete_read,
    _complete_write,
    connect_ipc,
    ipc_listen_spec,
)


def test_win32_spec_is_named_pipe():
    spec = ipc_listen_spec(system="win32", pipe_name="musicweb-mpv-test")
    assert spec.kind == "pipe"
    assert spec.server_arg == "musicweb-mpv-test"
    assert spec.connect_path == "\\\\.\\pipe\\musicweb-mpv-test"
    assert spec.connect_path.startswith("\\\\.\\pipe\\")


def test_win32_spec_keeps_explicit_pipe_prefix():
    raw = PIPE_PREFIX + "already"
    spec = ipc_listen_spec(system="win32", pipe_name=raw)
    assert spec.server_arg == raw
    assert spec.connect_path == raw


def test_posix_spec_is_uds_path():
    spec = ipc_listen_spec(system="darwin", posix_path="/tmp/mwc-ipc.sock")
    assert spec.kind == "uds"
    assert spec.server_arg == "/tmp/mwc-ipc.sock"
    assert spec.connect_path == "/tmp/mwc-ipc.sock"


def test_posix_connect_uses_af_unix_opener():
    spec = ipc_listen_spec(system="darwin", posix_path="/tmp/mwc-ipc.sock")
    seen: list[str] = []

    class Fake:
        def sendall(self, data: bytes) -> None:
            return None

        def recv(self, n: int) -> bytes:
            return b""

        def close(self) -> None:
            return None

    def open_uds(path: str) -> Fake:
        seen.append(path)
        return Fake()

    def open_pipe(path: str) -> Fake:
        raise AssertionError(f"must not open a named pipe: {path}")

    conn = connect_ipc(
        spec,
        timeout=1.0,
        path_exists=lambda _p: True,
        open_uds=open_uds,
        open_pipe=open_pipe,
        sleep=lambda _s: None,
    )
    assert seen == ["/tmp/mwc-ipc.sock"]
    conn.close()


def test_win32_connect_uses_pipe_opener_not_af_unix():
    spec = ipc_listen_spec(system="win32", pipe_name="musicweb-mpv-x")
    seen: list[str] = []

    class Fake:
        def sendall(self, data: bytes) -> None:
            return None

        def recv(self, n: int) -> bytes:
            return b""

        def close(self) -> None:
            return None

    def open_uds(path: str) -> Fake:
        raise AssertionError(f"must not open AF_UNIX: {path}")

    def open_pipe(path: str) -> Fake:
        seen.append(path)
        return Fake()

    conn = connect_ipc(
        spec,
        timeout=1.0,
        open_uds=open_uds,
        open_pipe=open_pipe,
        sleep=lambda _s: None,
    )
    assert seen == [PIPE_PREFIX + "musicweb-mpv-x"]
    assert socket.AF_UNIX  # still defined on POSIX hosts running this test
    conn.close()


def test_win32_spec_requires_pipe_name():
    with pytest.raises(ValueError, match="pipe_name"):
        ipc_listen_spec(system="win32", pipe_name="")


def test_posix_spec_requires_path():
    with pytest.raises(ValueError, match="posix_path"):
        ipc_listen_spec(system="darwin")


def test_complete_write_accepts_err_written_tuple():
    assert _complete_write((0, 12)) == 12


def test_complete_write_prefers_overlapped_in_tuple():
    class Ov:
        def GetOverlappedResult(self, _wait: bool) -> tuple[int, int]:
            return (43, 0)

    assert _complete_write((Ov(), 0)) == 43


def test_complete_read_accepts_err_bytes_tuple():
    assert _complete_read((0, b'{"a":1}\n')) == b'{"a":1}\n'


def test_complete_read_prefers_overlapped_in_tuple():
    class Ov:
        def GetOverlappedResult(self, _wait: bool) -> tuple[int, int]:
            return (7, 0)

        def getbuffer(self) -> bytes:
            return b"hello\n"

    assert _complete_read((Ov(), 0)) == b"hello\n"
