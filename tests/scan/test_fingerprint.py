"""Content fingerprints: SHA-256 and mocked FLAC STREAMINFO MD5."""

from __future__ import annotations

import hashlib
from types import SimpleNamespace
from unittest.mock import patch

from musicweb.db.names import track_id_for
from musicweb.scan.fingerprint import ALGO_FLAC_MD5, ALGO_SHA256, compute_fingerprint


def test_sha256_of_alac_tmp_bytes(tmp_path):
    path = tmp_path / "a.alac"
    data = b"not-a-real-alac"
    path.write_bytes(data)
    result = compute_fingerprint(path)
    assert result.algo == ALGO_SHA256
    assert result.fingerprint == hashlib.sha256(data).hexdigest()
    assert result.track_id == track_id_for(ALGO_SHA256, result.fingerprint)


def test_flac_md5_from_int_signature(tmp_path):
    path = tmp_path / "t.flac"
    path.write_bytes(b"x")
    md5 = 0xABCD

    audio = SimpleNamespace(info=SimpleNamespace(md5_signature=md5))
    with patch("musicweb.scan.fingerprint.FLAC", return_value=audio):
        result = compute_fingerprint(path)
    assert result.algo == ALGO_FLAC_MD5
    assert result.fingerprint == f"{md5:032x}"
    assert result.track_id == track_id_for(ALGO_FLAC_MD5, result.fingerprint)


def test_flac_md5_from_bytes_signature(tmp_path):
    path = tmp_path / "t.flac"
    path.write_bytes(b"x")
    sig = bytes(range(16))
    audio = SimpleNamespace(info=SimpleNamespace(md5_signature=sig))
    with patch("musicweb.scan.fingerprint.FLAC", return_value=audio):
        result = compute_fingerprint(path)
    assert result.algo == ALGO_FLAC_MD5
    assert result.fingerprint == sig.hex()


def test_flac_zero_int_falls_back_to_sha256(tmp_path):
    path = tmp_path / "t.flac"
    data = b"fallback-bytes"
    path.write_bytes(data)
    audio = SimpleNamespace(info=SimpleNamespace(md5_signature=0))
    with patch("musicweb.scan.fingerprint.FLAC", return_value=audio):
        result = compute_fingerprint(path)
    assert result.algo == ALGO_SHA256
    assert result.fingerprint == hashlib.sha256(data).hexdigest()


def test_flac_zero_bytes_falls_back_to_sha256(tmp_path):
    path = tmp_path / "t.flac"
    data = b"fallback-bytes"
    path.write_bytes(data)
    audio = SimpleNamespace(info=SimpleNamespace(md5_signature=bytes(16)))
    with patch("musicweb.scan.fingerprint.FLAC", return_value=audio):
        result = compute_fingerprint(path)
    assert result.algo == ALGO_SHA256
    assert result.fingerprint == hashlib.sha256(data).hexdigest()


def test_flac_open_error_falls_back_to_sha256(tmp_path):
    path = tmp_path / "t.flac"
    data = b"fallback-bytes"
    path.write_bytes(data)
    with patch("musicweb.scan.fingerprint.FLAC", side_effect=OSError("boom")):
        result = compute_fingerprint(path)
    assert result.algo == ALGO_SHA256
    assert result.fingerprint == hashlib.sha256(data).hexdigest()


def test_flac_missing_info_falls_back_to_sha256(tmp_path):
    path = tmp_path / "t.flac"
    data = b"fallback-bytes"
    path.write_bytes(data)
    audio = SimpleNamespace(info=None)
    with patch("musicweb.scan.fingerprint.FLAC", return_value=audio):
        result = compute_fingerprint(path)
    assert result.algo == ALGO_SHA256
    assert result.fingerprint == hashlib.sha256(data).hexdigest()
