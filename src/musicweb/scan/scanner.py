"""Back-compat alias: library job orchestration lives in ``musicweb.jobs``."""

from __future__ import annotations

from musicweb.jobs.runner import JobKind, LibraryJobRunner, ScanMode

# Historical name used by older imports / docs.
LibraryScanner = LibraryJobRunner

__all__ = ["JobKind", "LibraryJobRunner", "LibraryScanner", "ScanMode"]
