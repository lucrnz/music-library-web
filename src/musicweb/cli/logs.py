"""``musicweb logs`` — read and purge diagnostic JSONL."""

from __future__ import annotations

import json
import re
import sys
import time
from collections.abc import Iterator
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

import typer

from musicweb.config import load_settings
from musicweb.diag.store import event_files

app = typer.Typer(help="Read and purge diagnostic event files.")

_DAY_IN_NAME = re.compile(r"^events-(\d{4}-\d{2}-\d{2})\.jsonl$")


def _diag_dir() -> Path:
    settings = load_settings()
    data = settings.musicweb_data_dir.resolve()
    directory = settings.diag_dir.resolve()
    try:
        directory.relative_to(data)
    except ValueError as exc:
        raise typer.BadParameter(
            f"diag dir {directory} is outside data dir {data}"
        ) from exc
    return directory


def _event_files(directory: Path, day: str | None = None) -> list[Path]:
    files = event_files(directory)
    if day is None:
        return files
    return [path for path in files if path.name == f"events-{day}.jsonl"]


def _iter_records(
    paths: list[Path],
) -> Iterator[tuple[str, dict | None]]:
    """Yield (raw_line, parsed_or_none)."""
    for path in paths:
        try:
            text = path.read_text(encoding="utf-8")
        except OSError as exc:
            print(f"skip {path.name}: {exc}", file=sys.stderr)
            continue
        for raw in text.splitlines():
            if not raw.strip():
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                yield raw, None
                continue
            if not isinstance(obj, dict):
                yield raw, None
                continue
            yield raw, obj


def _match(
    obj: dict,
    *,
    client: str | None,
    session: str | None,
    play: str | None,
    source: str | None,
    event: str | None,
    level: str | None,
) -> bool:
    if client is not None and obj.get("client_id") != client:
        return False
    if session is not None and obj.get("session_id") != session:
        return False
    if play is not None and obj.get("play_id") != play:
        return False
    if source is not None and obj.get("source") != source:
        return False
    if event is not None and obj.get("event") != event:
        return False
    if level is not None and obj.get("level") != level:
        return False
    return True


@app.command("list")
def logs_list() -> None:
    """List daily event files with sizes and distinct ids."""
    directory = _diag_dir()
    files = _event_files(directory)
    if not files:
        print("(no event files)")
        return
    for path in files:
        size = path.stat().st_size
        lines = 0
        clients: set[str] = set()
        sessions: set[str] = set()
        for _raw, obj in _iter_records([path]):
            if obj is None:
                continue
            lines += 1
            cid = obj.get("client_id")
            if cid:
                clients.add(str(cid))
            sid = obj.get("session_id")
            if sid:
                sessions.add(str(sid))
        day = _DAY_IN_NAME.match(path.name)
        label = day.group(1) if day else path.name
        print(
            f"{label}  {size} bytes  {lines} lines  "
            f"clients={len(clients)}  sessions={len(sessions)}"
        )


@app.command("show")
def logs_show(
    client: Annotated[str | None, typer.Option("--client")] = None,
    session: Annotated[str | None, typer.Option("--session")] = None,
    play: Annotated[str | None, typer.Option("--play")] = None,
    source: Annotated[str | None, typer.Option("--source")] = None,
    event: Annotated[str | None, typer.Option("--event")] = None,
    level: Annotated[str | None, typer.Option("--level")] = None,
    day: Annotated[str | None, typer.Option("--day")] = None,
) -> None:
    """Print matching events oldest-first (raw JSONL)."""
    directory = _diag_dir()
    files = _event_files(directory, day=day)
    skipped = 0
    for raw, obj in _iter_records(files):
        if obj is None:
            skipped += 1
            continue
        if not _match(
            obj,
            client=client,
            session=session,
            play=play,
            source=source,
            event=event,
            level=level,
        ):
            continue
        print(raw)
    if skipped:
        print(f"skipped {skipped} corrupt line(s)", file=sys.stderr)


@app.command("tail")
def logs_tail(
    client: Annotated[str | None, typer.Option("--client")] = None,
    session: Annotated[str | None, typer.Option("--session")] = None,
    play: Annotated[str | None, typer.Option("--play")] = None,
    source: Annotated[str | None, typer.Option("--source")] = None,
    event: Annotated[str | None, typer.Option("--event")] = None,
    level: Annotated[str | None, typer.Option("--level")] = None,
    day: Annotated[str | None, typer.Option("--day")] = None,
    lines: Annotated[int, typer.Option("--lines")] = 50,
    follow: Annotated[bool, typer.Option("--follow", "-f")] = False,
) -> None:
    """Print the last N matching events; optionally follow."""
    directory = _diag_dir()
    files = _event_files(directory, day=day)
    matched: list[str] = []
    skipped = 0
    for raw, obj in _iter_records(files):
        if obj is None:
            skipped += 1
            continue
        if _match(
            obj,
            client=client,
            session=session,
            play=play,
            source=source,
            event=event,
            level=level,
        ):
            matched.append(raw)
    if skipped:
        print(f"skipped {skipped} corrupt line(s)", file=sys.stderr)
    for raw in matched[-max(0, lines) :]:
        print(raw)
    if not follow:
        return
    offset = 0
    current: Path | None = files[-1] if files else None
    if current is not None:
        try:
            offset = current.stat().st_size
        except OSError:
            offset = 0
    while True:
        time.sleep(0.25)
        files = _event_files(directory, day=day)
        if not files:
            current = None
            offset = 0
            continue
        newest = files[-1]
        if current is None or newest != current:
            current = newest
            offset = 0
        try:
            size = current.stat().st_size
        except OSError:
            current = None
            offset = 0
            continue
        if size < offset:
            offset = 0
        if size == offset:
            continue
        try:
            with current.open("r", encoding="utf-8") as handle:
                handle.seek(offset)
                chunk = handle.read()
                offset = handle.tell()
        except OSError:
            continue
        for raw in chunk.splitlines():
            if not raw.strip():
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if not isinstance(obj, dict):
                continue
            if _match(
                obj,
                client=client,
                session=session,
                play=play,
                source=source,
                event=event,
                level=level,
            ):
                print(raw, flush=True)


@app.command("purge")
def logs_purge(
    older_than: Annotated[
        int | None,
        typer.Option("--older-than", help="Delete files older than N UTC days."),
    ] = None,
    all_files: Annotated[bool, typer.Option("--all")] = False,
    yes: Annotated[bool, typer.Option("--yes")] = False,
) -> None:
    """Delete event files by UTC filename date."""
    if all_files == (older_than is not None):
        raise typer.BadParameter("provide exactly one of --all or --older-than")
    directory = _diag_dir()
    files = _event_files(directory)
    today = datetime.now(timezone.utc).date()
    victims: list[Path] = []
    if all_files:
        victims = files
    else:
        assert older_than is not None
        cutoff = today - timedelta(days=older_than)
        for path in files:
            match = _DAY_IN_NAME.match(path.name)
            if not match:
                continue
            file_day = date.fromisoformat(match.group(1))
            if file_day < cutoff:
                victims.append(path)
    if not victims:
        print("nothing to purge")
        return
    if not yes:
        names = ", ".join(p.name for p in victims)
        typer.confirm(f"Delete {len(victims)} file(s): {names}?", abort=True)
    for path in victims:
        try:
            path.unlink()
        except OSError as exc:
            print(f"failed {path.name}: {exc}", file=sys.stderr)
            raise typer.Exit(code=1) from exc
    print(f"purged {len(victims)} file(s)")
