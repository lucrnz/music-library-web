"""Library stats and scan control."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from musicweb.db.repositories import albums as albums_repo
from musicweb.db.repositories import artists as artists_repo
from musicweb.db.repositories import tracks as tracks_repo
from musicweb.db.session import get_db
from musicweb.routes.deps import jobs as jobs_dep

router = APIRouter(prefix="/api", tags=["library"])


@router.get("/library/stats")
def library_stats(db: Session = Depends(get_db)) -> dict:
    return {
        "artists": artists_repo.count_with_albums(db),
        "albums": albums_repo.count_with_tracks(db),
        "tracks": tracks_repo.count_present(db),
        "missing_tracks": tracks_repo.count_missing(db),
    }


@router.get("/library/scan/status")
def scan_status(request: Request) -> dict:
    return jobs_dep(request).status()


class ScanRequest(BaseModel):
    mode: Literal["quick", "full"] = "quick"


@router.post("/library/scan")
def scan_start(request: Request, payload: ScanRequest) -> dict:
    runner = jobs_dep(request)
    started = runner.start("scan", mode=payload.mode)
    if not started:
        raise HTTPException(status_code=409, detail="Scan already running")
    return {"started": True, "mode": payload.mode, **runner.status()}


@router.post("/library/scan/cancel")
def scan_cancel(request: Request) -> dict:
    runner = jobs_dep(request)
    ok = runner.request_cancel()
    return {"canceling": ok, **runner.status()}
