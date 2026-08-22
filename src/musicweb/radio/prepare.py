"""Tuner-driven complete-file prepare (current urgent + next-2 prewarm)."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime

from musicweb.db.engine import Database
from musicweb.library import Library
from musicweb.radio.station import RadioStation
from musicweb.radio.tuners import TunerRegistry
from musicweb.transcode.enqueue import enqueue_prepare
from musicweb.transcode.worker import Transcoder

RADIO_CURRENT_LABEL = "radio current"
RADIO_PREWARM_LABEL = "radio prewarm"


class RadioPrepare:
    """Refresh radio prepares only when the snapshot or codec union changes."""

    def __init__(
        self,
        station: RadioStation,
        tuners: TunerRegistry,
        database: Database,
        library: Library,
        transcoder: Transcoder,
        *,
        enqueue: Callable[..., dict] | None = None,
    ) -> None:
        self._station = station
        self._tuners = tuners
        self._database = database
        self._library = library
        self._transcoder = transcoder
        self._enqueue = enqueue or enqueue_prepare
        self._last_key: tuple | None = None

    def refresh(self) -> None:
        snap = self._station.now_playing()
        track_id = snap.track.id if snap.track is not None else None
        started = snap.started_at.isoformat() if isinstance(snap.started_at, datetime) else snap.started_at
        key = (snap.face, track_id, started, frozenset(self._tuners.profiles()))
        if key == self._last_key:
            return
        self._last_key = key
        if self._tuners.count() < 1 or snap.face != "current" or not track_id:
            return
        next_ids = self._station.peek_upcoming_ids(2)
        with self._database.session() as session:
            for profile in sorted(self._tuners.profiles()):
                self._enqueue(
                    session,
                    self._library,
                    self._transcoder,
                    [track_id],
                    profile_tag=profile,
                    urgent=True,
                    log_label=RADIO_CURRENT_LABEL,
                )
                if next_ids:
                    self._enqueue(
                        session,
                        self._library,
                        self._transcoder,
                        next_ids,
                        profile_tag=profile,
                        urgent=False,
                        log_label=RADIO_PREWARM_LABEL,
                    )
