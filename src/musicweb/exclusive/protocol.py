"""Canonical WebSocket protocol for exclusive audio via the Desktop companion.

Envelope: ``{ "v": PROTOCOL_VERSION, "type": <str>, ...fields }``.

Client and PWA must mirror these type strings and ``PROTOCOL_VERSION``.
"""

from __future__ import annotations

import hmac
from typing import Any, Final

PROTOCOL_VERSION: Final[int] = 1

# Default loopback port (override with --port / PWA setting).
DEFAULT_PORT: Final[int] = 18765

# Client heartbeat ~5s (also on become-visible). After CONTROLLER_TTL_S
# with no inbound traffic and nothing loaded in mpv, the companion unhogs
# so a crashed PWA that never closed the socket cannot keep the device.
# The same session takes hog back on the next message.
HEARTBEAT_INTERVAL_S: Final[float] = 5.0
CONTROLLER_TTL_S: Final[float] = 60.0

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
MSG_BLOB_PUT: Final[str] = "blob_put"
MSG_BLOB_ABORT: Final[str] = "blob_abort"
MSG_BLOB_DELETE: Final[str] = "blob_delete"
MSG_BLOB_STAT: Final[str] = "blob_stat"
MSG_DISK_INFO: Final[str] = "disk_info"

# --- Server → client ---
MSG_HELLO_OK: Final[str] = "hello_ok"
MSG_HELLO_REJECT: Final[str] = "hello_reject"
MSG_STATUS: Final[str] = "status"
MSG_DEVICES: Final[str] = "devices"
MSG_TIME: Final[str] = "time"
MSG_PAUSE_EVENT: Final[str] = "pause"  # { paused: bool }
MSG_EOF: Final[str] = "eof"
MSG_ERROR: Final[str] = "error"
MSG_BLOB_PROGRESS: Final[str] = "blob_progress"
MSG_BLOB_DONE: Final[str] = "blob_done"
MSG_BLOB_ERROR: Final[str] = "blob_error"
MSG_BLOB_STAT_OK: Final[str] = "blob_stat_ok"
MSG_DISK_INFO_OK: Final[str] = "disk_info_ok"

BLOB_CLIENT_TYPES: Final[frozenset[str]] = frozenset(
    {
        MSG_BLOB_PUT,
        MSG_BLOB_ABORT,
        MSG_BLOB_DELETE,
        MSG_BLOB_STAT,
        MSG_DISK_INFO,
    }
)

ROLE_CONTROLLER: Final[str] = "controller"
ROLE_READONLY: Final[str] = "readonly"

# Volume path labels for status.
VOLUME_DIGITAL: Final[str] = "digital"
VOLUME_HARDWARE: Final[str] = "hardware"


def token_ok(provided: str, expected: str) -> bool:
    """Constant-time compare; empty sides never match."""
    if not provided or not expected:
        return False
    return hmac.compare_digest(provided, expected)


def require_http_url(url: str) -> str:
    if not url.startswith(("http://", "https://")):
        raise ValueError("absolute http(s) url required")
    return url


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
