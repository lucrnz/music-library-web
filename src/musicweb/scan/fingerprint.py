"""Content fingerprints for stable track identity."""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path

from mutagen.flac import FLAC

from musicweb.db.names import track_id_for

logger = logging.getLogger(__name__)

ALGO_FLAC_MD5 = "flac-md5"
ALGO_SHA256 = "sha256"


class FingerprintResult:
    __slots__ = ("algo", "fingerprint", "track_id")

    def __init__(self, algo: str, fingerprint: str) -> None:
        self.algo = algo
        self.fingerprint = fingerprint
        self.track_id = track_id_for(algo, fingerprint)


def compute_fingerprint(path: Path) -> FingerprintResult:
    """
    Compute a content fingerprint for ``path``.

    FLAC: STREAMINFO MD5 of uncompressed PCM (O(1) header read).
    Other lossless: full-file SHA-256.
    """
    ext = path.suffix.lower()
    if ext == ".flac":
        fp = _flac_md5(path)
        if fp is not None:
            return FingerprintResult(ALGO_FLAC_MD5, fp)
        logger.debug("FLAC MD5 missing for %s; falling back to sha256", path)

    return FingerprintResult(ALGO_SHA256, _file_sha256(path))


def _flac_md5(path: Path) -> str | None:
    try:
        audio = FLAC(path)
    except Exception as exc:
        logger.debug("FLAC open failed for fingerprint: %s (%s)", path, exc)
        return None
    if audio is None or audio.info is None:
        return None
    md5 = getattr(audio.info, "md5_signature", None)
    if md5 is None:
        return None
    # mutagen may expose int or bytes
    if isinstance(md5, int):
        if md5 == 0:
            # 0 often means "not set" in some encoders
            return None
        return f"{md5:032x}"
    if isinstance(md5, (bytes, bytearray)):
        if not any(md5):
            return None
        return bytes(md5).hex()
    text = str(md5).strip()
    return text or None


def _file_sha256(path: Path, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()
