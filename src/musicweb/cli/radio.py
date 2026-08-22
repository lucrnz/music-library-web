"""``musicweb radio`` — debug DJ tools against a live server."""

from __future__ import annotations

import sys
from typing import Annotated

import typer

from musicweb.config import load_settings
from musicweb.control.client import ControlClient, ControlError

app = typer.Typer(
    help="Debug household radio on a live server (control socket). Upcoming ids stay hidden unless --spoilers.",
    no_args_is_help=True,
)

skip_ids_app = typer.Typer(
    help="List or clear process-lifetime unplayable ids.",
    invoke_without_command=True,
    no_args_is_help=False,
)

Spoilers = Annotated[
    bool,
    typer.Option("--spoilers", help="Print upcoming and banlist track ids."),
]


def _client() -> ControlClient:
    settings = load_settings()
    return ControlClient(settings.musicweb_data_dir)


def _require_live(client: ControlClient) -> None:
    if not client.health():
        print(
            "No live server control socket; radio debug commands need a running "
            "musicweb server.",
            file=sys.stderr,
        )
        raise SystemExit(1)


def _run(fn, *, spoilers: bool | None = None) -> None:
    client = _client()
    _require_live(client)
    try:
        result = fn(client)
    except ControlError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
    if spoilers is None:
        print(format_skip_ids(result), end="")
    elif "banlist_batch_sizes" in result and "face" not in result:
        print(format_banlist(result, spoilers=spoilers), end="")
    else:
        print(format_status(result, spoilers=spoilers), end="")


def _track_line(entry: dict) -> str:
    tid = str(entry.get("id") or "")
    title = entry.get("title")
    artist = entry.get("artist")
    if title and artist:
        return f"{tid}  {title} — {artist}"
    if title:
        return f"{tid}  {title}"
    return tid


def format_status(result: dict, *, spoilers: bool) -> str:
    lines = [f"face: {result.get('face', '')}"]
    track_id = result.get("track_id")
    if track_id:
        lines.append(
            f"track: {_track_line({'id': track_id, 'title': result.get('title'), 'artist': result.get('artist')})}"
        )
        if result.get("album") is not None:
            lines.append(f"album: {result['album']}")
        if "started_at" in result:
            lines.append(f"started_at: {result['started_at']}")
        if "position" in result:
            lines.append(f"position: {result['position']}")
        if "duration" in result:
            lines.append(f"duration: {result['duration']}")
    profiles = [str(p) for p in (result.get("tuner_profiles") or [])]
    n = result.get("tuner_count", 0)
    if profiles:
        lines.append(f"tuners: {n} ({', '.join(profiles)})")
    else:
        lines.append(f"tuners: {n}")
    lines.append(f"catalog_watermark: {result.get('catalog_watermark') or '-'}")
    lines.append(f"eligible: {result.get('eligible_count', 0)}")
    lines.append(f"upcoming: {result.get('upcoming_count', 0)}")
    sizes = result.get("banlist_batch_sizes") or []
    if sizes:
        lines.append(
            f"banlist_batches: {len(sizes)} ({', '.join(str(s) for s in sizes)})"
        )
    else:
        lines.append("banlist_batches: 0")
    lines.append(f"skip_ids: {result.get('skip_ids_count', 0)}")
    if spoilers:
        upcoming = result.get("upcoming") or []
        printed = False
        for row in upcoming:
            if not isinstance(row, dict) or not row.get("id"):
                continue
            if not printed:
                lines.append("upcoming:")
                printed = True
            lines.append(f"  {_track_line(row)}")
    return "\n".join(lines) + "\n"


def format_banlist(result: dict, *, spoilers: bool) -> str:
    sizes = result.get("banlist_batch_sizes") or []
    if sizes:
        lines = [
            f"banlist_batches: {len(sizes)} ({', '.join(str(s) for s in sizes)})"
        ]
    else:
        lines = ["banlist_batches: 0"]
    if spoilers:
        for i, batch in enumerate(result.get("banlist") or []):
            lines.append(f"batch {i}:")
            if not isinstance(batch, list):
                continue
            for row in batch:
                if isinstance(row, dict) and row.get("id"):
                    lines.append(f"  {_track_line(row)}")
    return "\n".join(lines) + "\n"


def format_skip_ids(result: dict) -> str:
    rows = result.get("skip_ids") or []
    lines = [f"skip_ids: {result.get('skip_ids_count', len(rows))}"]
    for row in rows:
        if isinstance(row, dict) and row.get("id"):
            lines.append(_track_line(row))
    return "\n".join(lines) + "\n"


@app.command("status")
def status(spoilers: Spoilers = False) -> None:
    """Show the live station face, current track, tuners, and counts."""
    _run(lambda c: c.radio_status(spoilers=spoilers), spoilers=spoilers)


@app.command("skip")
def skip(spoilers: Spoilers = False) -> None:
    """Advance to the next track now. Does not add the old current to skip-ids."""
    _run(lambda c: c.radio_skip(spoilers=spoilers), spoilers=spoilers)


@app.command("play")
def play(
    track_id: Annotated[str, typer.Argument(help="Index track id to inject as current.")],
    spoilers: Spoilers = False,
) -> None:
    """Inject an eligible track as current and keep the other upcoming."""
    _run(lambda c: c.radio_play(track_id, spoilers=spoilers), spoilers=spoilers)


@app.command("pick")
def pick(spoilers: Spoilers = False) -> None:
    """Keep current; replace the unplayed remainder with a new batch."""
    _run(lambda c: c.radio_pick(spoilers=spoilers), spoilers=spoilers)


@app.command("reset")
def reset(spoilers: Spoilers = False) -> None:
    """Clear queue, banlist, and skip-ids, then pick a fresh batch."""
    _run(lambda c: c.radio_reset(spoilers=spoilers), spoilers=spoilers)


@app.command("banlist")
def banlist(spoilers: Spoilers = False) -> None:
    """Show banlist batch sizes; ids only with --spoilers."""
    _run(lambda c: c.radio_banlist(spoilers=spoilers), spoilers=spoilers)


@skip_ids_app.callback(invoke_without_command=True)
def skip_ids_list(ctx: typer.Context) -> None:
    """List process-lifetime unplayable ids."""
    if ctx.invoked_subcommand is not None:
        return
    _run(lambda c: c.radio_skip_ids())


@skip_ids_app.command("clear")
def skip_ids_clear() -> None:
    """Empty the process-lifetime unplayable set."""
    _run(lambda c: c.radio_skip_ids_clear())


app.add_typer(skip_ids_app, name="skip-ids")
