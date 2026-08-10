"""Remote artist image providers (MusicBrainz, Last.fm, fanart.tv)."""

from __future__ import annotations

import logging
import urllib.parse
from typing import Protocol

from musicweb.artist_images.pick import (
    best_lastfm_image,
    fanart_artist_thumb,
    mb_image_url_from_lookup,
    pick_musicbrainz_artist,
)
from musicweb.artist_images.types import FetchContext, ProviderResult
from musicweb.config import Settings

logger = logging.getLogger(__name__)


class ImageProvider(Protocol):
    name: str

    def available(self, ctx: FetchContext) -> bool: ...

    def try_fetch(self, ctx: FetchContext) -> ProviderResult: ...


class MusicBrainzProvider:
    name = "musicbrainz"

    def available(self, ctx: FetchContext) -> bool:
        return bool(ctx.mb_user_agent)

    def try_fetch(self, ctx: FetchContext) -> ProviderResult:
        if not ctx.mb_user_agent:
            return ProviderResult(status="not_found", detail="no_mb_contact")

        artist = ctx.artist
        query = f'artist:"{artist.name}"'
        params = urllib.parse.urlencode({"query": query, "fmt": "json", "limit": "5"})
        search_url = f"https://musicbrainz.org/ws/2/artist?{params}"
        try:
            status, payload = ctx.http.get_json(
                search_url, user_agent=ctx.mb_user_agent, max_bytes=ctx.max_bytes
            )
        except Exception as exc:
            logger.debug("musicbrainz search failed for %s: %s", artist.name, exc)
            return ProviderResult(status="error", detail=str(exc)[:200])

        if status in (429, 503):
            return ProviderResult(status="error", detail="rate_limited")
        if status != 200 or not isinstance(payload, dict):
            return ProviderResult(status="error", detail=f"http_{status}")

        match = pick_musicbrainz_artist(payload, artist.name_norm)
        if match is None:
            return ProviderResult(status="not_found", detail="no_mb_match")

        mbid = match.get("id")
        if not mbid:
            return ProviderResult(status="not_found", detail="no_mbid")
        mbid_s = str(mbid)

        lookup_params = urllib.parse.urlencode({"fmt": "json", "inc": "url-rels"})
        lookup_url = f"https://musicbrainz.org/ws/2/artist/{mbid_s}?{lookup_params}"
        try:
            status, detail = ctx.http.get_json(
                lookup_url, user_agent=ctx.mb_user_agent, max_bytes=ctx.max_bytes
            )
        except Exception as exc:
            logger.debug("musicbrainz lookup failed for %s: %s", mbid_s, exc)
            return ProviderResult(
                status="not_found", mbid=mbid_s, detail=str(exc)[:200]
            )

        if status in (429, 503):
            return ProviderResult(
                status="error", mbid=mbid_s, detail="rate_limited"
            )
        if status != 200 or not isinstance(detail, dict):
            return ProviderResult(status="not_found", mbid=mbid_s)

        image_url = mb_image_url_from_lookup(detail)
        if not image_url:
            return ProviderResult(
                status="not_found", mbid=mbid_s, detail="no_mb_image"
            )
        return ProviderResult(status="ok", mbid=mbid_s, image_url=image_url)


class LastFmProvider:
    name = "lastfm"

    def available(self, ctx: FetchContext) -> bool:
        return bool(ctx.settings.lastfm_api_key)

    def try_fetch(self, ctx: FetchContext) -> ProviderResult:
        key = ctx.settings.lastfm_api_key
        if not key:
            return ProviderResult(
                status="not_found", mbid=ctx.mbid, detail="no_lastfm_key"
            )

        artist = ctx.artist
        mbid = ctx.mbid
        params: dict[str, str] = {
            "method": "artist.getinfo",
            "api_key": key,
            "format": "json",
        }
        if mbid:
            params["mbid"] = mbid
        else:
            params["artist"] = artist.name
        url = "https://ws.audioscrobbler.com/2.0/?" + urllib.parse.urlencode(params)
        try:
            status, payload = ctx.http.get_json(url, max_bytes=ctx.max_bytes)
        except Exception as exc:
            logger.debug("lastfm getinfo failed for %s: %s", artist.name, exc)
            return ProviderResult(
                status="error", mbid=mbid, detail=str(exc)[:200]
            )

        if status == 429:
            return ProviderResult(status="error", mbid=mbid, detail="rate_limited")
        if status != 200 or not isinstance(payload, dict):
            return ProviderResult(
                status="error", mbid=mbid, detail=f"http_{status}"
            )

        if payload.get("error"):
            err = payload.get("error")
            if err == 6:
                return ProviderResult(status="not_found", mbid=mbid)
            return ProviderResult(status="error", mbid=mbid, detail=str(err))

        info = payload.get("artist")
        if not isinstance(info, dict):
            return ProviderResult(status="not_found", mbid=mbid)

        lf_mbid = info.get("mbid") or mbid
        if lf_mbid:
            mbid = str(lf_mbid)

        image_url = best_lastfm_image(info.get("image") or [])
        if not image_url:
            return ProviderResult(
                status="not_found", mbid=mbid, detail="no_lastfm_image"
            )
        return ProviderResult(status="ok", mbid=mbid, image_url=image_url)


class FanartTvProvider:
    name = "fanarttv"

    def available(self, ctx: FetchContext) -> bool:
        return bool(ctx.settings.fanart_tv_api_key and ctx.mbid)

    def try_fetch(self, ctx: FetchContext) -> ProviderResult:
        key = ctx.settings.fanart_tv_api_key
        mbid = ctx.mbid
        if not key:
            return ProviderResult(
                status="not_found", mbid=mbid, detail="no_fanart_key"
            )
        if not mbid:
            return ProviderResult(
                status="not_found", mbid=None, detail="no_mbid_for_fanart"
            )

        url = (
            f"https://webservice.fanart.tv/v3/music/{urllib.parse.quote(mbid)}"
            + "?"
            + urllib.parse.urlencode({"api_key": key})
        )
        try:
            status, payload = ctx.http.get_json(url, max_bytes=ctx.max_bytes)
        except Exception as exc:
            logger.debug("fanart.tv failed for %s: %s", mbid, exc)
            return ProviderResult(
                status="error", mbid=mbid, detail=str(exc)[:200]
            )

        if status in (429, 503):
            return ProviderResult(status="error", mbid=mbid, detail="rate_limited")
        if status == 404:
            return ProviderResult(status="not_found", mbid=mbid)
        if status != 200 or not isinstance(payload, dict):
            return ProviderResult(
                status="error", mbid=mbid, detail=f"http_{status}"
            )

        image_url = fanart_artist_thumb(payload)
        if not image_url:
            return ProviderResult(
                status="not_found", mbid=mbid, detail="no_fanart_image"
            )
        return ProviderResult(status="ok", mbid=mbid, image_url=image_url)


def default_remote_providers() -> list[ImageProvider]:
    return [MusicBrainzProvider(), LastFmProvider(), FanartTvProvider()]


def any_remote_configured(settings: Settings) -> bool:
    if settings.musicbrainz_user_agent():
        return True
    if settings.lastfm_api_key:
        return True
    if settings.fanart_tv_api_key:
        return True
    return False
