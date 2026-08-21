"""Shared id → Transcoder.prepare enqueue used by HTTP prepare and radio."""

from __future__ import annotations

from sqlalchemy.orm import Session

from musicweb.db.repositories import tracks as tracks_repo
from musicweb.library import Library
from musicweb.transcode.null_tech_log import warn_null_track_tech
from musicweb.transcode.passthrough import stream_intent
from musicweb.transcode.probe import tech_from_track
from musicweb.transcode.worker import Transcoder


def enqueue_prepare(
    session: Session,
    library: Library,
    transcoder: Transcoder,
    ids: list[str],
    *,
    profile_tag: str,
    urgent: bool = False,
    log_label: str | None = None,
) -> dict[str, int]:
    """Resolve ids and queue encodes. Skips missing, non-encode, and unreadable."""
    counts = {"queued": 0, "already": 0, "ready": 0, "skipped": 0}
    if not ids:
        return counts
    for track in tracks_repo.get_many(session, ids):
        if track.is_missing or not track.rel_path:
            counts["skipped"] += 1
            continue
        if (
            stream_intent(
                is_lossy=bool(track.is_lossy), codec=profile_tag
            ).kind
            != "encode"
        ):
            counts["skipped"] += 1
            continue
        try:
            resolved = library.resolve(track.rel_path)
        except Exception:
            counts["skipped"] += 1
            continue
        if not resolved.is_file() or not library.is_audio(resolved):
            counts["skipped"] += 1
            continue
        warn_null_track_tech(track)
        result = transcoder.prepare(
            resolved,
            track.rel_path,
            profile_tag=profile_tag,
            source_tech=tech_from_track(track),
            urgent=urgent,
            log_label=log_label,
        )
        counts[result] += 1
    return counts
