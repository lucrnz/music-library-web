"""Shared FastAPI request helpers."""

from __future__ import annotations

from fastapi import Request

from musicweb.artist_image import ArtistImageStore
from musicweb.cover import CoverStore
from musicweb.jobs import LibraryJobRunner
from musicweb.library import Library


def library(request: Request) -> Library:
    return request.app.state.library


def transcoder(request: Request):
    return request.app.state.transcoder


def cover_store(request: Request) -> CoverStore:
    return request.app.state.cover_store


def artist_image_store(request: Request) -> ArtistImageStore:
    return request.app.state.artist_image_store


def jobs(request: Request) -> LibraryJobRunner:
    return request.app.state.jobs


def scanner(request: Request) -> LibraryJobRunner:
    """Back-compat alias for :func:`jobs`."""
    return jobs(request)
