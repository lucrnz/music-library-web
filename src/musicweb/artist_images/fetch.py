"""Artist image fetch orchestrator: local file then remote provider cascade."""

from __future__ import annotations

import logging
from typing import Callable

from sqlalchemy.orm import Session

from musicweb.artist_image import ArtistImageStore
from musicweb.artist_images.local import find_local_artist_file, sample_audio_dir
from musicweb.artist_images.providers import (
    ImageProvider,
    any_remote_configured,
    default_remote_providers,
)
from musicweb.artist_images.types import FetchContext, FetchResult, ProviderResult
from musicweb.config import (
    ARTIST_IMAGE_FETCH,
    ARTIST_IMAGE_MAX_BYTES,
    ARTIST_IMAGE_MIN_INTERVAL_MS,
    ARTIST_IMAGE_RETRY_DAYS,
    Settings,
)
from musicweb.db.models import Artist
from musicweb.http_client import RateLimitedHttp, looks_like_image
from musicweb.library import Library
from musicweb.timeutil import in_retry_cooldown, utc_now_iso

logger = logging.getLogger(__name__)

# Re-export for callers that imported FetchResult from the old module path.
__all__ = ["ArtistImageFetcher", "FetchResult"]


def _in_retry_cooldown(artist: Artist) -> bool:
    # Only cool down real attempts — not "skipped" (no keys / no contact yet).
    return in_retry_cooldown(
        status=artist.image_status,
        fetched_at=artist.image_fetched_at,
        retry_days=ARTIST_IMAGE_RETRY_DAYS,
    )


class ArtistImageFetcher:
    """Fetch and persist artist images during library scan."""

    def __init__(
        self,
        store: ArtistImageStore,
        library: Library,
        settings: Settings,
        *,
        providers: list[ImageProvider] | None = None,
    ) -> None:
        self._store = store
        self._library = library
        self._settings = settings
        ua = settings.musicbrainz_user_agent() or (
            "MusicLibaryWeb/0.1 - https://github.com/lucrnz/music-library-web"
        )
        self._http = RateLimitedHttp(ARTIST_IMAGE_MIN_INTERVAL_MS, ua)
        self._mb_ua = settings.musicbrainz_user_agent()
        self._providers = providers if providers is not None else default_remote_providers()

    def needs_fetch(self, artist: Artist, *, force: bool = False) -> bool:
        if not ARTIST_IMAGE_FETCH and not force:
            return False
        if force:
            return True
        if artist.has_image and self._store.has_image(artist.id):
            return False
        if artist.has_image and not self._store.has_image(artist.id):
            return True
        if _in_retry_cooldown(artist):
            return False
        return True

    def fetch_one(
        self,
        session: Session,
        artist: Artist,
        *,
        cancel: Callable[[], bool] | None = None,
        force: bool = False,
    ) -> FetchResult:
        """Resolve image for one artist; updates DB fields on the ORM object."""
        if cancel and cancel():
            return FetchResult(ok=False, status="error", detail="canceled")

        if force and self._store.has_image(artist.id):
            self._store.delete(artist.id)
            artist.has_image = False
            artist.image_source = None
            artist.image_status = None

        if not force and self._store.has_image(artist.id):
            artist.has_image = True
            if artist.image_status != "ok":
                artist.image_status = "ok"
            return FetchResult(
                ok=True, source=artist.image_source or "local", status="ok"
            )

        mbid = artist.mbid
        result = FetchResult(ok=False, status="not_found", mbid=mbid)

        local = self._try_local(session, artist)
        if local is not None:
            return local

        if cancel and cancel():
            return FetchResult(ok=False, status="error", detail="canceled", mbid=mbid)

        ctx = FetchContext(
            artist=artist,
            settings=self._settings,
            http=self._http,
            max_bytes=ARTIST_IMAGE_MAX_BYTES,
            mbid=mbid,
            mb_user_agent=self._mb_ua,
        )
        attempted_remote = False

        for provider in self._providers:
            if cancel and cancel():
                return FetchResult(
                    ok=False, status="error", detail="canceled", mbid=ctx.mbid
                )
            if not provider.available(ctx):
                continue

            attempted_remote = True
            pr = provider.try_fetch(ctx)
            if pr.mbid:
                ctx.mbid = pr.mbid
                artist.mbid = pr.mbid

            if pr.has_image:
                # Persist success returns immediately; soft failures continue cascade
                # (matches previous per-provider return-only-on-ok behavior).
                persisted = self._materialize(artist, pr, source=provider.name)
                if persisted.ok:
                    return persisted
                result = FetchResult(
                    ok=False,
                    status=persisted.status,
                    source=provider.name,
                    mbid=ctx.mbid,
                    detail=persisted.detail,
                )
                continue

            # Soft rate limit (MB): continue without forcing terminal error status.
            if (
                pr.status == "error"
                and pr.detail == "rate_limited"
                and provider.name in ctx.soft_rate_limits
            ):
                continue

            result = FetchResult(
                ok=False,
                status=pr.status if pr.status in ("not_found", "error") else "not_found",
                source=provider.name,
                mbid=ctx.mbid,
                detail=pr.detail,
            )

        mbid = ctx.mbid

        # fanart.tv key present but no MBID and no other remote ran.
        if (
            not attempted_remote
            and self._settings.fanart_tv_api_key
            and not mbid
        ):
            result = FetchResult(
                ok=False,
                status="not_found",
                mbid=None,
                detail="no_mbid_for_fanart",
            )

        artist.has_image = False
        artist.image_source = None
        if mbid:
            artist.mbid = mbid

        if not attempted_remote and not any_remote_configured(self._settings):
            artist.image_status = "skipped"
            artist.image_fetched_at = None
            return FetchResult(
                ok=False, status="skipped", mbid=mbid, detail="no_providers"
            )

        artist.image_status = (
            result.status if result.status in ("not_found", "error") else "not_found"
        )
        artist.image_fetched_at = utc_now_iso()
        result.mbid = mbid
        return result

    def _try_local(self, session: Session, artist: Artist) -> FetchResult | None:
        folder = sample_audio_dir(session, self._library, artist.id)
        if folder is None:
            return None
        path = find_local_artist_file(folder, self._library.root)
        if path is None:
            return None
        try:
            data = path.read_bytes()
        except OSError as exc:
            logger.debug("local artist image read failed %s: %s", path, exc)
            return None
        if not looks_like_image(data, None):
            return None
        return self._persist(artist, data, "local")

    def _materialize(
        self, artist: Artist, pr: ProviderResult, *, source: str
    ) -> FetchResult:
        if pr.image_bytes:
            return self._persist(artist, pr.image_bytes, source, mbid=pr.mbid)
        if pr.image_url:
            return self._download_and_persist(
                artist, pr.image_url, source, mbid=pr.mbid
            )
        return FetchResult(
            ok=False, status="not_found", source=source, mbid=pr.mbid, detail="no_image"
        )

    def _persist(
        self,
        artist: Artist,
        data: bytes,
        source: str,
        *,
        mbid: str | None = None,
    ) -> FetchResult:
        ok = self._store.ensure_from_bytes(artist.id, data)
        if not ok:
            artist.has_image = False
            artist.image_source = None
            artist.image_status = "error"
            artist.image_fetched_at = utc_now_iso()
            return FetchResult(
                ok=False, status="error", source=source, mbid=mbid, detail="encode"
            )
        artist.has_image = True
        artist.image_source = source
        artist.image_status = "ok"
        artist.image_fetched_at = utc_now_iso()
        if mbid:
            artist.mbid = mbid
        return FetchResult(ok=True, source=source, status="ok", mbid=mbid)

    def _download_and_persist(
        self, artist: Artist, url: str, source: str, *, mbid: str | None
    ) -> FetchResult:
        try:
            status, body, ctype = self._http.get_bytes(
                url, max_bytes=ARTIST_IMAGE_MAX_BYTES
            )
        except Exception as exc:
            logger.debug("image download failed %s: %s", url, exc)
            return FetchResult(
                ok=False,
                status="error",
                source=source,
                mbid=mbid,
                detail=str(exc)[:200],
            )
        if status != 200 or not body or not looks_like_image(body, ctype):
            return FetchResult(
                ok=False,
                status="not_found",
                source=source,
                mbid=mbid,
                detail=f"bad_image_{status}",
            )
        return self._persist(artist, body, source, mbid=mbid)
