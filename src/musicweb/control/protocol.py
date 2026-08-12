"""Length-prefixed JSON control protocol (big-endian u32 + UTF-8 body)."""

from __future__ import annotations

import json
import struct
from typing import Any

from pydantic import BaseModel, Field

# Max JSON body size (1 MiB) — jobs payloads are small.
MAX_FRAME_BYTES = 1_048_576
_HEADER = struct.Struct(">I")


class ControlRequest(BaseModel):
    method: str
    params: dict[str, Any] = Field(default_factory=dict)


class ControlResponse(BaseModel):
    ok: bool
    result: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


def encode_frame(obj: dict[str, Any] | BaseModel) -> bytes:
    if isinstance(obj, BaseModel):
        payload = obj.model_dump_json().encode("utf-8")
    else:
        payload = json.dumps(obj, separators=(",", ":")).encode("utf-8")
    if len(payload) > MAX_FRAME_BYTES:
        raise ValueError("control frame too large")
    return _HEADER.pack(len(payload)) + payload


def read_frame(recv: Any) -> dict[str, Any]:
    """Read one frame from a socket-like object with ``recv(n)``."""
    header = _recv_exact(recv, _HEADER.size)
    (length,) = _HEADER.unpack(header)
    if length > MAX_FRAME_BYTES:
        raise ValueError("control frame length exceeds limit")
    body = _recv_exact(recv, length)
    data = json.loads(body.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("control frame must be a JSON object")
    return data


def _recv_exact(recv: Any, n: int) -> bytes:
    buf = bytearray()
    while len(buf) < n:
        chunk = recv.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("control connection closed")
        buf.extend(chunk)
    return bytes(buf)
