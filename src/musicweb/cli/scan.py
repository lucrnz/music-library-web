"""``musicweb scan`` group: run scan, status, cancel."""

from __future__ import annotations

import json
import sys

import typer

from musicweb.jobs import ScanMode
from musicweb.runtime.run_job import run_library_job

app = typer.Typer(help="Library scan jobs and status.")


@app.callback(invoke_without_command=True)
def scan(
    ctx: typer.Context,
    mode: ScanMode = typer.Option(
        "quick",
        "--mode",
        help="Scan mode: quick (incremental) or full (deeper re-index).",
    ),
) -> None:
    """Run a library scan (local exclusive or via live server control plane)."""
    if ctx.invoked_subcommand is not None:
        return
    code = run_library_job("scan", mode=mode)
    raise SystemExit(code)


@app.command("status")
def scan_status() -> None:
    """Print library job / scan status from the database."""
    from musicweb.runtime.bootstrap import bootstrap_services

    rt = bootstrap_services(migrate=None)
    try:
        print(json.dumps(rt.jobs.status(), indent=2, sort_keys=True))
    finally:
        rt.close()


@app.command("cancel")
def scan_cancel() -> None:
    """Cancel an in-flight library job on a live server."""
    from musicweb.control.client import ControlClient, ControlError
    from musicweb.config import load_settings

    settings = load_settings()
    client = ControlClient(settings.musicweb_data_dir)
    if not client.health():
        print(
            "No live server control socket; nothing to cancel remotely. "
            "Use Ctrl+C for a foreground local job.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    try:
        result = client.cancel_job()
    except ControlError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
    print(json.dumps(result, indent=2, sort_keys=True))
