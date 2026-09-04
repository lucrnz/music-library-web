"""Audio CD identify / confirm / remembered identity."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from musicweb.cd.identify import TocIn, confirm, get_applied, lookup
from musicweb.db.session import get_db
from musicweb.routes.deps import cover_store

router = APIRouter(prefix="/api", tags=["cd"])


class IdentifyIn(BaseModel):
    toc: dict[str, Any]
    cd_text: dict[str, Any] | None = None
    force: bool = False


class ConfirmIn(BaseModel):
    discid: str = Field(min_length=1)
    release_mbid: str = Field(min_length=1)
    toc: dict[str, Any]


class CdLyricsIn(BaseModel):
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    duration_ms: int | None = None


def _toc(raw: dict[str, Any]) -> TocIn:
    try:
        return TocIn.from_dict(raw)
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="invalid toc") from exc


def _user_agent(request: Request) -> str | None:
    settings = getattr(request.app.state, "settings", None)
    if settings is None:
        return None
    getter = getattr(settings, "musicbrainz_user_agent", None)
    if getter is None:
        return None
    return getter()


@router.post("/cd/identify")
def post_identify(
    body: IdentifyIn,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return lookup(
        db,
        toc=_toc(body.toc),
        cd_text=body.cd_text,
        user_agent=_user_agent(request),
        force=body.force,
    )


@router.post("/cd/confirm")
def post_confirm(
    body: ConfirmIn,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        return confirm(
            db,
            discid=body.discid,
            release_mbid=body.release_mbid,
            toc=_toc(body.toc),
            user_agent=_user_agent(request),
            cover_store=cover_store(request),
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/cd/lyrics")
def post_cd_lyrics(body: CdLyricsIn) -> dict[str, Any]:
    from musicweb.lyrics.lookup import lookup_remote_lyrics, lyrics_result_dict

    result = lookup_remote_lyrics(
        body.title, body.artist, body.album, body.duration_ms
    )
    return lyrics_result_dict(None, result)


@router.get("/cd/identities/{discid}")
def get_identity(
    discid: str,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    dto = get_applied(db, discid)
    if dto is None:
        raise HTTPException(status_code=404, detail="unknown disc")
    return dto
