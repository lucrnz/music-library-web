"""Canonical WebSocket protocol for the exclusive-audio companion.

Envelope: ``{ "v": PROTOCOL_VERSION, "type": <str>, ...fields }``.

Client and PWA must mirror these type strings and ``PROTOCOL_VERSION``.
"""

from __future__ import annotations

from typing import Any, Final

PROTOCOL_VERSION: Final[int] = 1

# Default loopback port (override with --port / PWA setting).
DEFAULT_PORT: Final[int] = 18765

# Controller lock: heartbeat interval ~5s; drop after ~15s without beat.
HEARTBEAT_INTERVAL_S: Final[float] = 5.0
CONTROLLER_TTL_S: Final[float] = 15.0

# --- Client → server ---
MSG_HELLO: Final[str] = "hello"
MSG_HEARTBEAT: Final[str] = "heartbeat"
MSG_LIST_DEVICES: Final[str] = "list_devices"
MSG_SET_DEVICE: Final[str] = "set_device"
MSG_LOAD: Final[str] = "load"
MSG_PAUSE: Final[str] = "pause"
MSG_RESUME: Final[str] = "resume"
MSG_SEEK: Final[str] = "seek"
MSG_STOP: Final[str] = "stop"
MSG_SET_VOLUME: Final[str] = "set_volume"

# --- Server → client ---
MSG_HELLO_OK: Final[str] = "hello_ok"
MSG_HELLO_REJECT: Final[str] = "hello_reject"
MSG_STATUS: Final[str] = "status"
MSG_DEVICES: Final[str] = "devices"
MSG_TIME: Final[str] = "time"
MSG_PAUSE_EVENT: Final[str] = "pause"  # { paused: bool }
MSG_EOF: Final[str] = "eof"
MSG_ERROR: Final[str] = "error"

ROLE_CONTROLLER: Final[str] = "controller"
ROLE_READONLY: Final[str] = "readonly"

# Volume path labels for status.
VOLUME_DIGITAL: Final[str] = "digital"
VOLUME_HARDWARE: Final[str] = "hardware"


def envelope(msg_type: str, **fields: Any) -> dict[str, Any]:
    """Build a protocol message dict."""
    out: dict[str, Any] = {"v": PROTOCOL_VERSION, "type": msg_type}
    out.update(fields)
    return out


def parse_message(data: Any) -> dict[str, Any] | None:
    """Validate basic envelope; return None if unusable."""
    if not isinstance(data, dict):
        return None
    if data.get("v") != PROTOCOL_VERSION:
        return None
    if not isinstance(data.get("type"), str) or not data["type"]:
        return None
    return data
