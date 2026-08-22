"""Run a library job locally or via the live server control plane."""

from __future__ import annotations

import logging
import sys
import time
from musicweb.config import load_settings
from musicweb.control.client import ControlClient, ControlError
from musicweb.jobs import JobKind, ScanMode
from musicweb.runtime.lock import DataDirLockError
from musicweb.runtime.maintenance import exclusive_maintenance

logger = logging.getLogger(__name__)

_POLL_INTERVAL_S = 0.5
_TERMINAL = frozenset({"idle", "failed"})


def run_library_job(
    kind: JobKind,
    *,
    mode: ScanMode = "quick",
    force: bool = False,
) -> int:
    """
    If the server control socket is healthy, start the job via UDS and poll.
    Otherwise run under exclusive local lock + ``run_sync``.

    Returns process exit code (0 success, non-zero failure).
    """
    settings = load_settings()
    client = ControlClient(settings.musicweb_data_dir)
    if client.health():
        return _run_remote(client, kind, mode=mode, force=force)
    return _run_local(kind, mode=mode, force=force)


def _run_remote(
    client: ControlClient,
    kind: JobKind,
    *,
    mode: ScanMode,
    force: bool,
) -> int:
    try:
        if kind == "scan":
            client.start_scan(mode)
        elif kind == "regen-covers":
            client.start_regen_covers(force)
        elif kind == "regen-artist-images":
            client.start_regen_artist_images(force)
        elif kind == "regen-lyrics":
            client.start_regen_lyrics(force)
        else:
            print(f"Unknown job kind: {kind}", file=sys.stderr)
            return 2
    except ControlError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    while True:
        try:
            st = client.job_status()
        except ControlError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        status = st.get("status") or "idle"
        phase = st.get("phase")
        logger.info(
            "job status · kind=%s · status=%s · phase=%s",
            st.get("kind"),
            status,
            phase,
        )
        if status in _TERMINAL or status == "failed":
            if status == "failed" or st.get("last_error"):
                err = st.get("last_error") or "job failed"
                print(err, file=sys.stderr)
                return 1
            # idle after cancel may still be success for cancel path; for run, idle OK
            return 0
        if status == "canceling":
            time.sleep(_POLL_INTERVAL_S)
            continue
        time.sleep(_POLL_INTERVAL_S)


def _run_local(
    kind: JobKind,
    *,
    mode: ScanMode,
    force: bool,
) -> int:
    try:
        with exclusive_maintenance() as rt:
            try:
                if kind == "scan":
                    rt.jobs.run_sync("scan", mode=mode)
                else:
                    rt.jobs.run_sync(kind, force=force)
            except KeyboardInterrupt:
                print("Canceled.", file=sys.stderr)
                return 130
            st = rt.jobs.status()
            if st.get("status") == "failed" or st.get("last_error"):
                err = st.get("last_error") or "job failed"
                print(err, file=sys.stderr)
                return 1
            return 0
    except DataDirLockError as exc:
        print(str(exc), file=sys.stderr)
        print(
            "The server holds the data-dir lock. Stop it first, "
            "or ensure the control socket is healthy.",
            file=sys.stderr,
        )
        return 1
    except Exception as exc:
        logger.exception("Local library job failed")
        print(str(exc), file=sys.stderr)
        return 1
