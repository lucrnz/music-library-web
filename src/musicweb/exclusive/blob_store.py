"""Jailed companion blob files under the app-support data dir."""

from __future__ import annotations

import shutil
from collections.abc import Iterable
from pathlib import Path


class BlobJailError(ValueError):
    """Key is not a safe relative path."""


def safe_key(key: str) -> Path:
    if not key or "\x00" in key:
        raise BlobJailError("invalid key")
    raw = Path(key)
    if raw.is_absolute() or raw.anchor:
        raise BlobJailError("absolute key")
    parts = raw.parts
    if not parts or any(p in ("", ".", "..") for p in parts):
        raise BlobJailError("invalid key")
    return Path(*parts)


def resolve(root: Path, key: str) -> Path:
    rel = safe_key(key)
    dest = (root / rel).resolve()
    root_res = root.resolve()
    if dest != root_res and root_res not in dest.parents:
        raise BlobJailError("escaped root")
    return dest


def partial_path(dest: Path) -> Path:
    return dest.with_name(dest.name + ".partial")


def stat(root: Path, key: str) -> tuple[bool, int]:
    dest = resolve(root, key)
    if dest.is_file():
        return True, dest.stat().st_size
    part = partial_path(dest)
    if part.is_file():
        return False, part.stat().st_size
    return False, 0


def delete(root: Path, key: str) -> None:
    dest = resolve(root, key)
    part = partial_path(dest)
    dest.unlink(missing_ok=True)
    part.unlink(missing_ok=True)


def put_bytes(root: Path, key: str, data: bytes) -> int:
    return put_chunks(root, key, (data,) if data else ())


def put_chunks(root: Path, key: str, chunks: Iterable[bytes]) -> int:
    dest = resolve(root, key)
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = partial_path(dest)
    written = 0
    try:
        with part.open("wb") as fh:
            for chunk in chunks:
                if not chunk:
                    continue
                fh.write(chunk)
                written += len(chunk)
        part.replace(dest)
        return written
    except Exception:
        part.unlink(missing_ok=True)
        raise


async def put_async_chunks(root: Path, key: str, chunks) -> int:
    dest = resolve(root, key)
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = partial_path(dest)
    written = 0
    try:
        with part.open("wb") as fh:
            async for chunk in chunks:
                if not chunk:
                    continue
                fh.write(chunk)
                written += len(chunk)
        part.replace(dest)
        return written
    except Exception:
        part.unlink(missing_ok=True)
        raise


def open_read(root: Path, key: str) -> Path:
    dest = resolve(root, key)
    if not dest.is_file():
        raise FileNotFoundError(key)
    return dest


def iter_file_span(path: Path, start: int, end: int, chunk_size: int = 64 * 1024):
    """Yield [start, end] inclusive without reading the whole file."""
    remaining = end - start + 1
    with open(path, "rb") as fh:
        fh.seek(start)
        while remaining > 0:
            data = fh.read(min(chunk_size, remaining))
            if not data:
                break
            remaining -= len(data)
            yield data


def disk_free(root: Path) -> int:
    probe = root
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent
    return int(shutil.disk_usage(probe).free)


def append_chunk(root: Path, key: str, data: bytes, *, offset: int) -> int:
    dest = resolve(root, key)
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = partial_path(dest)
    mode = "r+b" if part.exists() else "wb"
    with part.open(mode) as fh:
        fh.seek(offset)
        fh.write(data)
        return fh.tell()


def promote_partial(root: Path, key: str) -> int:
    dest = resolve(root, key)
    part = partial_path(dest)
    if not part.is_file():
        raise FileNotFoundError(key)
    size = part.stat().st_size
    part.replace(dest)
    return size
