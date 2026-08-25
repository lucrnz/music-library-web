"""mpv IPC playback engine for exclusive HTTP FLAC streams."""

from __future__ import annotations

import json
import logging
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from musicweb.exclusive.coreaudio import (
    get_device_volume,
    is_macos,
    set_device_volume,
)
from musicweb.exclusive.volume import ExclusiveVolume, Restore

logger = logging.getLogger(__name__)

EventCallback = Callable[[str, dict[str, Any]], None]


class MpvPlayer:
    """Owns one idle mpv process with JSON IPC."""

    def __init__(
        self,
        *,
        mpv_path: str | None = None,
        on_event: EventCallback | None = None,
    ) -> None:
        self._mpv_path = mpv_path or shutil.which("mpv") or "mpv"
        self._on_event = on_event
        self._proc: subprocess.Popen[bytes] | None = None
        self._sock: socket.socket | None = None
        self._ipc_path: Path | None = None
        self._tmpdir: tempfile.TemporaryDirectory[str] | None = None
        self._reader: threading.Thread | None = None
        self._lock = threading.RLock()
        self._req_id = 0
        self._pending: dict[int, threading.Event] = {}
        self._results: dict[int, Any] = {}
        self._closed = False
        self._stub = False
        self._stub_logged: set[str] = set()
        self._stderr_buf: list[bytes] = []
        self._stderr_thread: threading.Thread | None = None
        self._device: str | None = None
        self._vol = ExclusiveVolume(
            get_hw=lambda d: get_device_volume(d),
            set_hw=lambda d, v: set_device_volume(d, v),
            set_digital=self._set_digital,
        )
        self._paused = True
        self._position = 0.0
        self._duration = 0.0
        self._url: str | None = None

    @property
    def device(self) -> str | None:
        return self._device

    @property
    def volume(self) -> float:
        return self._vol.user

    @property
    def paused(self) -> bool:
        return self._paused

    @property
    def position(self) -> float:
        return self._position

    @property
    def duration(self) -> float:
        return self._duration

    @property
    def url(self) -> str | None:
        return self._url

    def _stub_out(self, action: str) -> bool:
        if not self._stub:
            return False
        if action not in self._stub_logged:
            self._stub_logged.add(action)
            logger.info("exclusive %s stub: no-op on this platform", action)
        return True

    def start(self) -> None:
        if self._proc is not None or self._stub:
            return
        if not is_macos():
            logger.info("exclusive mpv hog stub: no-op on this platform")
            self._stub = True
            return
        if not shutil.which(self._mpv_path) and not Path(self._mpv_path).is_file():
            raise RuntimeError(f"mpv not found: {self._mpv_path}")

        self._tmpdir = tempfile.TemporaryDirectory(prefix="musicweb-mpv-")
        self._ipc_path = Path(self._tmpdir.name) / "ipc.sock"
        # Exclusive is armed only via set_device (not a process-wide startup flag).
        cmd = [
            self._mpv_path,
            "--idle=yes",
            "--force-window=no",
            "--no-video",
            "--keep-open=no",
            "--gapless-audio=no",
            "--pause",
            "--volume=100",
            f"--input-ipc-server={self._ipc_path}",
            "--msg-level=all=error",
            "--no-terminal",
        ]
        logger.info("Starting mpv: %s", " ".join(cmd))
        self._proc = subprocess.Popen(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        self._stderr_buf = []
        self._stderr_thread = threading.Thread(
            target=self._drain_stderr, name="mpv-stderr", daemon=True
        )
        self._stderr_thread.start()
        self._connect_ipc(timeout=5.0)
        self._reader = threading.Thread(
            target=self._read_loop, name="mpv-ipc-reader", daemon=True
        )
        self._reader.start()
        # Observe properties for time / pause / eof
        for prop in ("time-pos", "duration", "pause", "eof-reached"):
            self._command("observe_property", self._next_id(), prop)

    def close(self) -> None:
        with self._lock:
            self._closed = True
            if self._stub:
                self._device = None
                return
            self._unhog_unlocked()
            restore = self._vol.on_release()
            self._device = None
            self._write_restore(restore)
            if self._sock is not None:
                try:
                    self._command_unlocked("quit")
                except Exception:
                    pass
                try:
                    self._sock.close()
                except Exception:
                    pass
                self._sock = None
            if self._proc is not None:
                try:
                    self._proc.terminate()
                    self._proc.wait(timeout=2)
                except Exception:
                    try:
                        self._proc.kill()
                    except Exception:
                        pass
                self._proc = None
            if self._stderr_thread is not None:
                self._stderr_thread.join(timeout=0.5)
                self._stderr_thread = None
            if self._tmpdir is not None:
                try:
                    self._tmpdir.cleanup()
                except Exception:
                    pass
                self._tmpdir = None

    def set_device(self, mpv_device: str) -> None:
        """Select output and arm exclusive mode for that device."""
        if self._stub_out("set_device"):
            return
        with self._lock:
            leaving = self._device is not None and self._device != mpv_device
            restore = self._vol.on_device(mpv_device)
            if leaving:
                self._unhog_unlocked()
            self._write_restore(restore)
            self._device = mpv_device
            self._command_unlocked("set_property", "audio-exclusive", True)
            self._command_unlocked("set_property", "audio-device", mpv_device)
            self._vol.apply()

    def load(self, url: str) -> None:
        """Load and play an absolute HTTP(S) stream URL."""
        if self._stub_out("load"):
            return
        with self._lock:
            self._url = url
            self._position = 0.0
            self._duration = 0.0
            # loadfile replace + play
            self._command_unlocked("loadfile", url, "replace")
            self._command_unlocked("set_property", "pause", False)
            self._paused = False
            self._vol.apply()

    def pause(self) -> None:
        if self._stub_out("pause"):
            return
        with self._lock:
            self._command_unlocked("set_property", "pause", True)
            self._paused = True

    def resume(self) -> None:
        if self._stub_out("resume"):
            return
        with self._lock:
            self._command_unlocked("set_property", "pause", False)
            self._paused = False

    def stop(self) -> None:
        """Stop playback; keep selected device and exclusive arming."""
        if self._stub_out("stop"):
            return
        with self._lock:
            self._clear_transport_unlocked()

    def release_device(self) -> None:
        """Stop playback and drop exclusive Core Audio hold (idle process stays up)."""
        if self._stub_out("release_device"):
            return
        with self._lock:
            self._clear_transport_unlocked()
            self._unhog_unlocked()
            restore = self._vol.on_release()
            self._device = None
            self._write_restore(restore)
            logger.info("Exclusive device released")

    def _clear_transport_unlocked(self) -> None:
        if self._sock is not None:
            try:
                self._command_unlocked("stop")
            except Exception:
                # Still clear local state so status matches intent.
                pass
        self._url = None
        self._position = 0.0
        self._duration = 0.0
        self._paused = True

    def seek(self, seconds: float) -> None:
        if self._stub_out("seek"):
            return
        with self._lock:
            self._command_unlocked("set_property", "time-pos", float(seconds))

    def set_volume(self, volume_0_100: float) -> None:
        if self._stub_out("set_volume"):
            return
        with self._lock:
            self._vol.set_user(volume_0_100)

    def status_snapshot(self) -> dict[str, Any]:
        return {
            "device": self._device,
            "volume": self._vol.user,
            "paused": self._paused,
            "position": self._position,
            "duration": self._duration,
            "url": self._url,
            "volume_path": self._vol.path,
        }

    def _set_digital(self, digital: float) -> None:
        if self._sock is None:
            return
        self._command_unlocked("set_property", "volume", digital)

    def _unhog_unlocked(self) -> None:
        try:
            self._command_unlocked("set_property", "audio-exclusive", False)
            self._command_unlocked("set_property", "audio-device", "auto")
        except Exception:
            pass

    def _write_restore(self, restore: Restore | None) -> None:
        if restore is None:
            return
        try:
            set_device_volume(restore.device_id, restore.volume)
        except Exception:
            logger.debug("hardware volume restore failed", exc_info=True)

    def _next_id(self) -> int:
        self._req_id += 1
        return self._req_id

    def _drain_stderr(self) -> None:
        err = self._proc.stderr if self._proc is not None else None
        if err is None:
            return
        try:
            for line in err:
                self._stderr_buf.append(line)
                text = line.decode("utf-8", errors="replace").rstrip()
                if text:
                    logger.warning("mpv: %s", text)
        except Exception:
            return

    def _connect_ipc(self, timeout: float) -> None:
        assert self._ipc_path is not None
        deadline = time.monotonic() + timeout
        last_err: Exception | None = None
        while time.monotonic() < deadline:
            if self._proc is not None and self._proc.poll() is not None:
                if self._stderr_thread is not None:
                    self._stderr_thread.join(timeout=0.5)
                err = b"".join(self._stderr_buf)
                raise RuntimeError(
                    f"mpv exited early: {err.decode('utf-8', errors='replace')}"
                )
            if self._ipc_path.exists():
                try:
                    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                    sock.connect(str(self._ipc_path))
                    sock.settimeout(1.0)
                    self._sock = sock
                    return
                except OSError as exc:
                    last_err = exc
            time.sleep(0.05)
        raise RuntimeError(f"mpv IPC connect failed: {last_err}")

    def _command(self, *args: Any) -> None:
        with self._lock:
            self._command_unlocked(*args)

    def _command_unlocked(self, *args: Any) -> None:
        if self._sock is None:
            raise RuntimeError("mpv IPC not connected")
        payload = json.dumps({"command": list(args)}, separators=(",", ":"))
        self._sock.sendall(payload.encode("utf-8") + b"\n")

    def _read_loop(self) -> None:
        buf = b""
        while not self._closed and self._sock is not None:
            try:
                chunk = self._sock.recv(4096)
            except socket.timeout:
                continue
            except OSError:
                break
            if not chunk:
                break
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line.decode("utf-8"))
                except json.JSONDecodeError:
                    continue
                self._handle_ipc_message(msg)
        if not self._closed and self._on_event:
            self._on_event("error", {"message": "mpv IPC closed"})

    def _handle_ipc_message(self, msg: dict[str, Any]) -> None:
        if msg.get("event") == "property-change":
            name = msg.get("name")
            value = msg.get("data")
            if name == "time-pos" and isinstance(value, (int, float)):
                self._position = float(value)
                if self._on_event:
                    self._on_event(
                        "time",
                        {"t": self._position, "d": self._duration},
                    )
            elif name == "duration" and isinstance(value, (int, float)):
                self._duration = float(value)
            elif name == "pause" and isinstance(value, bool):
                self._paused = value
                if self._on_event:
                    self._on_event("pause", {"paused": value})
            elif name == "eof-reached" and value is True:
                if self._on_event:
                    self._on_event("eof", {})
            return
        if msg.get("event") == "end-file":
            reason = msg.get("reason")
            if reason == "eof":
                if self._on_event:
                    self._on_event("eof", {})
            elif reason not in (None, "stop", "quit", "redirect"):
                if self._on_event:
                    self._on_event(
                        "error",
                        {"message": f"mpv end-file: {reason}"},
                    )
            return
        if msg.get("event") == "audio-reconfig":
            try:
                with self._lock:
                    if (
                        not self._closed
                        and self._device
                        and self._vol.device_id
                    ):
                        self._vol.apply()
            except Exception:
                logger.debug(
                    "volume re-apply after audio-reconfig failed",
                    exc_info=True,
                )
            return
        if msg.get("event") == "log-message":
            text = msg.get("text") or ""
            if "error" in (msg.get("level") or "").lower():
                logger.warning("mpv: %s", text.strip())
