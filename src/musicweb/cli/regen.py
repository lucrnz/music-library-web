"""Regen CLI commands (covers, artist images, lyrics)."""

from __future__ import annotations

import typer

from musicweb.runtime.run_job import run_library_job


def regen_covers(
    force: bool = typer.Option(
        False,
        "--force",
        help="Re-extract covers for all albums (default: missing only).",
    ),
) -> None:
    """Regenerate album covers from the index (no full re-walk)."""
    raise SystemExit(run_library_job("regen-covers", force=force))


def regen_artist_images(
    force: bool = typer.Option(
        False,
        "--force",
        help="Re-fetch all artist portraits (default: missing / failed only).",
    ),
) -> None:
    """Regenerate artist portrait images."""
    raise SystemExit(run_library_job("regen-artist-images", force=force))


def regen_lyrics(
    force: bool = typer.Option(
        False,
        "--force",
        help="Re-fetch lyrics including cooldown rows (default: missing only).",
    ),
) -> None:
    """Regenerate track lyrics cache."""
    raise SystemExit(run_library_job("regen-lyrics", force=force))
