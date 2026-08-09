"""Process-scoped cache root for transcoded streams (wiped on shutdown).

Layout::

    /tmp/musicweb-<random>/
      streams/   # transcoded audio (owned by Transcoder)

Cover art is persisted under MUSICWEB_DATA_DIR (see CoverStore), not here.
"""

from __future__ import annotations

import logging
import shutil
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)

# Named subdirectories under the process cache root.
CACHE_STREAMS = "streams"
CACHE_SUBDIRS = (CACHE_STREAMS,)


class ProcessCache:
    """One musicweb-* temp root with named subdirectories; wiped on shutdown."""

    def __init__(self) -> None:
        self._root: Path | None = None

    @property
    def root(self) -> Path:
        if self._root is None:
            raise RuntimeError("Process cache not started")
        return self._root

    def path(self, name: str) -> Path:
        """Return ``root / name`` (must already exist after start)."""
        return self.root / name

    def start(self) -> Path:
        """Create the temp root and standard subdirs (idempotent)."""
        if self._root is None:
            self._root = Path(tempfile.mkdtemp(prefix="musicweb-"))
            for name in CACHE_SUBDIRS:
                (self._root / name).mkdir(exist_ok=True)
            logger.info("Process cache root: %s", self._root)
        return self._root

    def shutdown(self) -> None:
        """Remove the entire process cache tree."""
        if self._root is not None and self._root.exists():
            logger.info("Cleaning up process cache: %s", self._root)
            shutil.rmtree(self._root, ignore_errors=True)
        self._root = None
