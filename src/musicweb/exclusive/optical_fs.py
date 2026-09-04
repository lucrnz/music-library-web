"""Jailed Yellow Book volume walk: allowlisted audio + folder index."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from mutagen.mp4 import MP4

from musicweb.scan.formats import mp4_kind

_DRIVE_ABS = re.compile(r"^[A-Za-z]:")

# Closed Yellow Book allowlist (not library index eligibility).
_EXT_CODEC: dict[str, str] = {
    ".mp3": "mp3",
    ".aac": "aac",
    ".wma": "wma",
    ".flac": "flac",
    ".alac": "alac",
}


@dataclass
class CdromFile:
    name: str
    rel: str
    source_codec: str
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    albumartist: str | None = None
    track: int | None = None
    disc: int | None = None
    year: int | None = None
    duration: float | None = None
    sample_rate_hz: int | None = None
    bit_depth: int | None = None
    channels: int | None = None
    has_cover: bool = False
    has_local_lyrics: bool = False

    def to_list_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "rel": self.rel,
            "source_codec": self.source_codec,
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
            "albumartist": self.albumartist,
            "track": self.track,
            "disc": self.disc,
            "year": self.year,
            "duration": self.duration,
            "sample_rate_hz": self.sample_rate_hz,
            "bit_depth": self.bit_depth,
            "channels": self.channels,
            "has_cover": self.has_cover,
            "has_local_lyrics": self.has_local_lyrics,
        }


@dataclass
class CdromDir:
    name: str
    rel: str


@dataclass
class CdromIndex:
    dirs: list[CdromDir] = field(default_factory=list)
    files: list[CdromFile] = field(default_factory=list)
    auto_add_rel: str | None = None

    def list_children(self, rel: str) -> tuple[list[CdromDir], list[CdromFile]]:
        parent = _norm_rel(rel)
        dirs = [d for d in self.dirs if _parent_rel(d.rel) == parent]
        files = [f for f in self.files if _parent_rel(f.rel) == parent]
        dirs.sort(key=lambda d: d.name.lower())
        files.sort(key=_file_sort_key)
        return dirs, files

    def file_by_rel(self, rel: str) -> CdromFile | None:
        want = _norm_rel(rel)
        for item in self.files:
            if item.rel == want:
                return item
        return None

    def folder_counts(self) -> list[dict[str, object]]:
        counts: dict[str, int] = {"": 0}
        for item in self.files:
            parent = _parent_rel(item.rel)
            counts[parent] = counts.get(parent, 0) + 1
        for directory in self.dirs:
            counts.setdefault(directory.rel, 0)
        return [
            {"rel": rel, "file_count": counts[rel]}
            for rel in sorted(counts, key=lambda r: (r != "", r.lower()))
        ]


def _norm_rel(rel: str | None) -> str:
    raw = (rel or "").replace("\\", "/").strip("/")
    if raw in (".", ""):
        return ""
    return raw


def _file_sort_key(item: CdromFile) -> tuple[int, int, int, str]:
    numbered = 0 if item.track is not None else 1
    disc = item.disc if item.disc is not None else 0
    track = item.track if item.track is not None else 0
    return (numbered, disc, track, item.name.lower())


def _parent_rel(rel: str) -> str:
    norm = _norm_rel(rel)
    if "/" not in norm:
        return ""
    return norm.rsplit("/", 1)[0]


def _hidden_name(name: str) -> bool:
    return name.startswith(".") or name.startswith("._")


def _m4a_source_codec(path: Path) -> str | None:
    try:
        audio = MP4(path)
    except Exception:
        return None
    if audio is None or audio.info is None:
        return None
    return mp4_kind(audio.info)


def source_codec_for(path: Path) -> str | None:
    """Walk-time kind. ``.m4a`` uses ``mp4_kind``; unreadable / other is hidden."""
    if not path.is_file():
        return None
    ext = path.suffix.lower()
    if ext == ".m4a":
        return _m4a_source_codec(path)
    return _EXT_CODEC.get(ext)


def is_allowlisted_name(name: str) -> bool:
    if _hidden_name(name):
        return False
    ext = Path(name).suffix.lower()
    return ext == ".m4a" or ext in _EXT_CODEC


def jail_join(root: Path, rel: str | None) -> Path | None:
    """Resolve ``rel`` under ``root``. None on escape / invalid.

    Empty / ``.`` is the volume root (list_cdrom of ""). Any empty, ``.``,
    or ``..`` *part* after that is rejected, matching blob_store / Library.
    """
    if rel is None:
        rel = ""
    if "\x00" in rel:
        return None
    cleaned = rel.replace("\\", "/").strip()
    if (
        cleaned.startswith("/")
        or cleaned.startswith("~")
        or cleaned.startswith("//")
        or _DRIVE_ABS.match(cleaned)
        or Path(cleaned).is_absolute()
    ):
        return None
    root_res = root.resolve()
    if not cleaned or cleaned == ".":
        return root_res
    parts = cleaned.split("/")
    if any(part in ("", ".", "..") for part in parts):
        return None
    dest = (root_res / cleaned).resolve()
    if dest != root_res and root_res not in dest.parents:
        return None
    return dest


def walk_volume(root: Path) -> CdromIndex:
    """Allowlisted audio + ancestor folders. ``auto_add_rel`` is the one parent."""
    root_res = root.resolve()
    files: list[CdromFile] = []
    dir_rels: set[str] = set()
    if not root_res.is_dir():
        return CdromIndex()

    for dirpath, dirnames, filenames in _walk(root_res):
        dirnames[:] = [name for name in dirnames if not _hidden_name(name)]
        rel_dir = _rel_of(Path(dirpath), root_res)
        for name in filenames:
            if _hidden_name(name):
                continue
            path = Path(dirpath) / name
            codec = source_codec_for(path)
            if codec is None:
                continue
            rel = f"{rel_dir}/{name}" if rel_dir else name
            files.append(CdromFile(name=name, rel=rel, source_codec=codec))
            _mark_ancestors(dir_rels, rel_dir)

    dirs = [
        CdromDir(name=rel.rsplit("/", 1)[-1], rel=rel) for rel in sorted(dir_rels)
    ]
    return CdromIndex(
        dirs=dirs,
        files=files,
        auto_add_rel=_auto_add_rel(files),
    )


def _walk(root: Path):
    import os

    yield from os.walk(root, onerror=lambda _err: None)


def _rel_of(path: Path, root: Path) -> str:
    rel = path.resolve().relative_to(root).as_posix()
    return "" if rel == "." else rel


def _mark_ancestors(dir_rels: set[str], rel_dir: str) -> None:
    if not rel_dir:
        return
    parts = rel_dir.split("/")
    acc: list[str] = []
    for part in parts:
        acc.append(part)
        dir_rels.add("/".join(acc))


def _auto_add_rel(files: list[CdromFile]) -> str | None:
    parents = {_parent_rel(item.rel) for item in files}
    if len(parents) == 1:
        return next(iter(parents))
    return None
