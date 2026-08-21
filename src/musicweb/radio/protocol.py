"""Radio WebSocket client-payload allowlist and ack frames."""

from __future__ import annotations

import json

from musicweb.transcode.passthrough import SOURCE_TAG
from musicweb.transcode.profiles import get_profile

ACTION_CLOSE = "close"
ACTION_TUNE_IN = "tune_in"
ACTION_TUNE_OUT = "tune_out"

ERROR_STATION_NOT_CURRENT = "station_not_current"
ERROR_CODEC_REJECTED = "codec_rejected"


def parse_client_payload(raw: str | bytes | None) -> tuple[str, dict]:
    """Return ``(action, fields)``. Unknown / unparseable → close."""
    if raw is None:
        return ACTION_CLOSE, {}
    text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        return ACTION_CLOSE, {}
    if not isinstance(data, dict):
        return ACTION_CLOSE, {}
    kind = data.get("type")
    if kind == ACTION_TUNE_IN:
        return ACTION_TUNE_IN, {"codec": data.get("codec")}
    if kind == ACTION_TUNE_OUT:
        return ACTION_TUNE_OUT, {}
    return ACTION_CLOSE, {}


def is_browser_listed_profile(tag: object) -> bool:
    if not isinstance(tag, str) or not tag or tag == SOURCE_TAG:
        return False
    try:
        profile = get_profile(tag)
    except ValueError:
        return False
    return bool(profile.browser_listed)


def ack_ok() -> dict:
    return {"ok": True}


def ack_error(error: str, face: str) -> dict:
    return {"ok": False, "error": error, "face": face}
