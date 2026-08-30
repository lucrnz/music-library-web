"""mpv JSON IPC transport: Unix domain socket or Windows named pipe."""

from __future__ import annotations

import socket
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

PIPE_PREFIX = "\\\\.\\pipe\\"


class IpcConn(Protocol):
    def sendall(self, data: bytes) -> None: ...

    def recv(self, n: int) -> bytes: ...

    def close(self) -> None: ...


@dataclass(frozen=True)
class IpcListenSpec:
    """How to start mpv's IPC server and how a client connects to it."""

    kind: str  # "uds" | "pipe"
    server_arg: str
    connect_path: str


def ipc_listen_spec(
    *,
    system: str,
    posix_path: str | None = None,
    pipe_name: str | None = None,
) -> IpcListenSpec:
    """Build the ``--input-ipc-server`` value and the client connect path."""
    if system == "win32":
        name = (pipe_name or "").strip()
        if not name:
            raise ValueError("pipe_name is required on win32")
        if name.lower().startswith(PIPE_PREFIX.lower()):
            connect = name
            server = name
        else:
            connect = PIPE_PREFIX + name
            server = name
        return IpcListenSpec(kind="pipe", server_arg=server, connect_path=connect)
    if not posix_path:
        raise ValueError("posix_path is required on non-win32")
    return IpcListenSpec(kind="uds", server_arg=posix_path, connect_path=posix_path)


class _SocketConn:
    def __init__(self, sock: socket.socket) -> None:
        self._sock = sock

    def sendall(self, data: bytes) -> None:
        self._sock.sendall(data)

    def recv(self, n: int) -> bytes:
        try:
            return self._sock.recv(n)
        except TimeoutError:
            return b""

    def close(self) -> None:
        try:
            self._sock.close()
        except OSError:
            pass


def _as_overlapped(result: object) -> object | None:
    if hasattr(result, "GetOverlappedResult"):
        return result
    if isinstance(result, tuple):
        for item in result:
            if hasattr(item, "GetOverlappedResult"):
                return item
    return None


def _transferred(ov_result: object) -> int:
    """``GetOverlappedResult`` is an int or ``(count, err)`` depending on CPython."""
    if isinstance(ov_result, tuple):
        return int(ov_result[0] or 0)
    return int(ov_result or 0)


def _complete_write(result: object) -> int:
    """Normalize ``_winapi.WriteFile`` overlapped vs ``(err, written)``."""
    ov = _as_overlapped(result)
    if ov is not None:
        return _transferred(ov.GetOverlappedResult(True))
    if isinstance(result, tuple) and len(result) == 2 and isinstance(result[1], int):
        return int(result[1])
    raise OSError(f"unexpected WriteFile result: {type(result)!r}")


def _complete_read(result: object) -> bytes:
    """Normalize ``_winapi.ReadFile`` overlapped vs ``(err, data)``."""
    ov = _as_overlapped(result)
    if ov is not None:
        ov.GetOverlappedResult(True)
        buf = ov.getbuffer()
        return bytes(buf) if buf else b""
    if isinstance(result, tuple) and len(result) == 2:
        second = result[1]
        if isinstance(second, (bytes, bytearray)):
            return bytes(second)
    return b""


class _PipeConn:
    """Overlapped named-pipe client via ``_winapi`` (stdlib on Windows)."""

    def __init__(self, handle: int) -> None:
        self._handle = handle
        self._closed = False

    def sendall(self, data: bytes) -> None:
        import _winapi

        view = memoryview(data)
        while view:
            result = _winapi.WriteFile(self._handle, view.tobytes(), True)
            written = _complete_write(result)
            if written <= 0:
                raise OSError("named pipe write returned no bytes")
            view = view[written:]

    def recv(self, n: int) -> bytes:
        import _winapi

        if self._closed:
            return b""
        try:
            result = _winapi.ReadFile(self._handle, n, True)
            return _complete_read(result)
        except OSError:
            return b""

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        import _winapi

        try:
            cancel = getattr(_winapi, "CancelIo", None)
            if cancel is not None:
                cancel(self._handle)
        except OSError:
            pass
        try:
            _winapi.CloseHandle(self._handle)
        except OSError:
            pass


def _winapi_null() -> object:
    import _winapi

    return getattr(_winapi, "NULL", 0)


def _open_uds(path: str) -> IpcConn:
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(path)
    sock.settimeout(1.0)
    return _SocketConn(sock)


def _open_pipe(path: str) -> IpcConn:
    import _winapi

    try:
        _winapi.WaitNamedPipe(path, 50)
    except FileNotFoundError as exc:
        raise OSError("named pipe not ready") from exc
    except OSError:
        # Busy is fine — the server created the pipe.
        pass
    handle = _winapi.CreateFile(
        path,
        _winapi.GENERIC_READ | _winapi.GENERIC_WRITE,
        0,
        _winapi_null(),
        _winapi.OPEN_EXISTING,
        _winapi.FILE_FLAG_OVERLAPPED,
        _winapi_null(),
    )
    return _PipeConn(handle)


def connect_ipc(
    spec: IpcListenSpec,
    *,
    timeout: float,
    proc_alive: Callable[[], bool] | None = None,
    now: Callable[[], float] = time.monotonic,
    sleep: Callable[[float], None] = time.sleep,
    path_exists: Callable[[str], bool] | None = None,
    open_uds: Callable[[str], IpcConn] = _open_uds,
    open_pipe: Callable[[str], IpcConn] = _open_pipe,
) -> IpcConn:
    """Retry until the mpv IPC endpoint accepts a client or *timeout* elapses."""
    deadline = now() + timeout
    last_err: Exception | None = None
    exists = path_exists
    if exists is None:
        from pathlib import Path

        exists = lambda p: Path(p).exists()  # noqa: E731
    while now() < deadline:
        if proc_alive is not None and not proc_alive():
            raise RuntimeError("mpv exited before IPC connected")
        try:
            if spec.kind == "pipe":
                return open_pipe(spec.connect_path)
            if exists(spec.connect_path):
                return open_uds(spec.connect_path)
        except OSError as exc:
            last_err = exc
        sleep(0.05)
    raise RuntimeError(f"mpv IPC connect failed: {last_err}")
