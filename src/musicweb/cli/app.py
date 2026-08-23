"""Root Typer application."""

from __future__ import annotations

import logging

import typer

from musicweb.cli import companion as companion_cmd
from musicweb.cli import doctor as doctor_cmd
from musicweb.cli import logs as logs_cmd
from musicweb.cli import radio as radio_cmd
from musicweb.cli import regen as regen_cmd
from musicweb.cli import scan as scan_cmd
from musicweb.cli import serve as serve_cmd
from musicweb.cli import stats as stats_cmd

app = typer.Typer(
    name="musicweb",
    help="Browse and stream a lossless-first music library; manage index from the CLI.",
    no_args_is_help=False,
    invoke_without_command=True,
)


@app.callback(invoke_without_command=True)
def _root(ctx: typer.Context) -> None:
    """With no subcommand, start the HTTP server (same as ``serve``)."""
    if ctx.invoked_subcommand is None:
        serve_cmd.run_serve()


app.command("serve")(serve_cmd.serve)
app.add_typer(scan_cmd.app, name="scan")
app.add_typer(logs_cmd.app, name="logs")
app.add_typer(radio_cmd.app, name="radio")
app.command("regen-covers")(regen_cmd.regen_covers)
app.command("regen-artist-images")(regen_cmd.regen_artist_images)
app.command("regen-lyrics")(regen_cmd.regen_lyrics)
app.command("stats")(stats_cmd.stats)
app.command("doctor")(doctor_cmd.doctor)
app.command("companion")(companion_cmd.companion)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    app()


if __name__ == "__main__":
    main()
