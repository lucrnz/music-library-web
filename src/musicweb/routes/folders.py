"""Filesystem browse / collect (ids when indexed)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from musicweb.db.repositories import tracks as tracks_repo
from musicweb.db.session import get_db
from musicweb.routes.deps import library

router = APIRouter(prefix="/api", tags=["folders"])


@router.get("/browse")
def browse(
    request: Request,
    path: str = Query(default="", description="Library-relative path (empty = root)"),
    db: Session = Depends(get_db),
) -> dict:
    data = library(request).browse(path)
    rels = [f["path"] for f in data["files"]]
    id_map = tracks_repo.id_map_for_paths(db, rels)
    for f in data["files"]:
        f["id"] = id_map.get(f["path"])
    return data


@router.get("/collect")
def collect(
    request: Request,
    path: str = Query(default="", description="Directory or file to collect audio from"),
    db: Session = Depends(get_db),
) -> dict:
    lib = library(request)
    files = lib.collect_audio(path)
    id_map = tracks_repo.id_map_for_paths(db, files)
    return {
        "path": path,
        "files": [{"path": p, "id": id_map.get(p)} for p in files],
    }
