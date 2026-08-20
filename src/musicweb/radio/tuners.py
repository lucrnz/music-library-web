"""In-process tuner registry keyed by WebSocket connection."""

from __future__ import annotations

import logging

from musicweb.radio.protocol import (
    ERROR_CODEC_REJECTED,
    ERROR_STATION_NOT_CURRENT,
    ack_error,
    ack_ok,
    is_browser_listed_profile,
)
from musicweb.radio.station import RadioStation

logger = logging.getLogger(__name__)


class TunerRegistry:
    """One entry per tuned-in socket. Codec is always a browser-listed profile."""

    def __init__(self) -> None:
        self._by_conn: dict[int, str] = {}

    def count(self) -> int:
        return len(self._by_conn)

    def profiles(self) -> set[str]:
        return set(self._by_conn.values())

    def has(self, conn_key: int) -> bool:
        return conn_key in self._by_conn

    def tune_in(self, conn_key: int, codec: str) -> tuple[int, int, bool]:
        """Register or update. Returns (old_count, new_count, union_changed)."""
        old_count = len(self._by_conn)
        old_union = set(self._by_conn.values())
        self._by_conn[conn_key] = codec
        new_union = set(self._by_conn.values())
        return old_count, len(self._by_conn), old_union != new_union

    def drop(self, conn_key: int) -> tuple[int, int]:
        """Remove that tuner. Returns (old_count, new_count)."""
        old_count = len(self._by_conn)
        self._by_conn.pop(conn_key, None)
        return old_count, len(self._by_conn)


def apply_tune_in(
    station: RadioStation,
    tuners: TunerRegistry,
    prepare: object,
    conn_key: int,
    codec: object,
) -> dict:
    face = station.now_playing().face
    if face != "current":
        return ack_error(ERROR_STATION_NOT_CURRENT, face)
    if not is_browser_listed_profile(codec):
        return ack_error(ERROR_CODEC_REJECTED, face)
    old, new, union_changed = tuners.tune_in(conn_key, str(codec))
    if old == 0 and new == 1:
        logger.info("radio: simulation → streaming (tuners=%s)", new)
    if union_changed:
        refresh = getattr(prepare, "refresh", None)
        if refresh is not None:
            refresh()
    return ack_ok()


def apply_tune_out(tuners: TunerRegistry, conn_key: int) -> dict:
    old, new = tuners.drop(conn_key)
    if old == 1 and new == 0:
        logger.info("radio: streaming → simulation (tuners=0)")
    return ack_ok()


def apply_disconnect(tuners: TunerRegistry, conn_key: int) -> None:
    apply_tune_out(tuners, conn_key)
