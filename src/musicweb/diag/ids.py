"""Join keys and Diagnostics mode from request headers / cookies."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from starlette.requests import Request

HEADER_CLIENT = "X-Musicweb-Client"
HEADER_SESSION = "X-Musicweb-Session"
HEADER_PLAY = "X-Musicweb-Play"
HEADER_MODE = "X-Musicweb-Mode"

COOKIE_CLIENT = "musicweb_client"
COOKIE_SESSION = "musicweb_session"
COOKIE_PLAY = "musicweb_play"
COOKIE_MODE = "musicweb_mode"

Mode = Literal["errors", "everything"]


@dataclass(frozen=True, slots=True)
class DiagIds:
    client_id: str | None
    session_id: str | None
    play_id: str | None
    mode: Mode


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def normalize_mode(value: str | None) -> Mode:
    text = (value or "").strip().lower()
    if text == "everything":
        return "everything"
    return "errors"


def _header_then_cookie(request: Request, header: str, cookie: str) -> str | None:
    got = _clean(request.headers.get(header))
    if got is not None:
        return got
    return _clean(request.cookies.get(cookie))


def from_request(request: Request | None) -> DiagIds:
    if request is None:
        return DiagIds(None, None, None, "errors")
    return DiagIds(
        client_id=_header_then_cookie(request, HEADER_CLIENT, COOKIE_CLIENT),
        session_id=_header_then_cookie(request, HEADER_SESSION, COOKIE_SESSION),
        play_id=_header_then_cookie(request, HEADER_PLAY, COOKIE_PLAY),
        mode=normalize_mode(
            _header_then_cookie(request, HEADER_MODE, COOKIE_MODE)
        ),
    )
