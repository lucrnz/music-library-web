"""Minimal rate-limited HTTP GET client for library integrations."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

DEFAULT_HTTP_TIMEOUT_S = 20.0


class RateLimitedHttp:
    """Simple GET client with a global min interval between requests."""

    def __init__(
        self,
        min_interval_ms: int,
        default_user_agent: str,
        *,
        timeout_s: float = DEFAULT_HTTP_TIMEOUT_S,
    ) -> None:
        self._min_interval = max(0, min_interval_ms) / 1000.0
        self._default_ua = default_user_agent
        self._timeout_s = timeout_s
        self._last_at = 0.0

    def _throttle(self) -> None:
        if self._min_interval <= 0:
            return
        now = time.monotonic()
        wait = self._min_interval - (now - self._last_at)
        if wait > 0:
            time.sleep(wait)

    def get_bytes(
        self,
        url: str,
        *,
        user_agent: str | None = None,
        accept: str = "*/*",
        max_bytes: int,
    ) -> tuple[int, bytes, str | None]:
        """Return (status_code, body, content_type). Raises on transport errors."""
        self._throttle()
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": user_agent or self._default_ua,
                "Accept": accept,
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=self._timeout_s) as resp:
                status = getattr(resp, "status", 200) or 200
                ctype = resp.headers.get("Content-Type")
                chunks: list[bytes] = []
                total = 0
                while True:
                    chunk = resp.read(64 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise ValueError(f"response exceeds {max_bytes} bytes")
                    chunks.append(chunk)
                self._last_at = time.monotonic()
                return status, b"".join(chunks), ctype
        except urllib.error.HTTPError as exc:
            self._last_at = time.monotonic()
            body = b""
            try:
                body = exc.read(max_bytes)
            except Exception:
                pass
            return (
                exc.code,
                body,
                exc.headers.get("Content-Type") if exc.headers else None,
            )

    def get_json(
        self, url: str, *, user_agent: str | None = None, max_bytes: int
    ) -> tuple[int, dict | list | None]:
        status, body, _ = self.get_bytes(
            url, user_agent=user_agent, accept="application/json", max_bytes=max_bytes
        )
        if not body:
            return status, None
        try:
            return status, json.loads(body.decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            return status, None


def looks_like_image(data: bytes, content_type: str | None) -> bool:
    if len(data) < 24:
        return False
    if data[:3] == b"\xff\xd8\xff":
        return True
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return True
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return True
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return True
    if content_type and content_type.split(";")[0].strip().lower().startswith("image/"):
        return True
    return False
