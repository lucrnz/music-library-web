"""Yellow Book tag / cover / local-lyrics enrichment."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from musicweb.exclusive.optical_fs import CdromFile
from musicweb.exclusive.optical_meta import (
    FileMeta,
    apply_file_meta,
    cover_bytes,
    enrich_file,
    local_lyrics,
)
from musicweb.lyrics.types import LocalLyrics
from musicweb.metadata import TrackMetadata


def _meta(**overrides: object) -> TrackMetadata:
    base = dict(
        title="Song",
        artist="Artist",
        album="Album",
        albumartist="AA",
        track=3,
        disc=1,
        year=1999,
        duration=12.5,
        sample_rate_hz=44100,
        bit_depth=16,
        channels=2,
        source_codec="mp3",
    )
    base.update(overrides)
    return TrackMetadata(**base)  # type: ignore[arg-type]


def _tagged_mp3(path: Path) -> None:
    import subprocess

    from mutagen.easyid3 import EasyID3

    subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=44100:cl=mono",
            "-t",
            "0.2",
            "-q:a",
            "9",
            str(path),
        ],
        check=True,
    )
    tags = EasyID3(path)
    tags["title"] = "Tagged Title"
    tags["artist"] = "Tagged Artist"
    tags["album"] = "Tagged Album"
    tags["tracknumber"] = "4"
    tags.save()


def test_enrich_file_reads_mutagen_written_tags(tmp_path: Path):
    path = tmp_path / "song.mp3"
    _tagged_mp3(path)
    with patch("musicweb.exclusive.optical_meta.cover_bytes", return_value=None):
        with patch("musicweb.exclusive.optical_meta.local_lyrics", return_value=None):
            got = enrich_file(path)
    assert got.title == "Tagged Title"
    assert got.artist == "Tagged Artist"
    assert got.album == "Tagged Album"
    assert got.track == 4


def test_enrich_file_reads_tags(tmp_path: Path):
    path = tmp_path / "song.mp3"
    path.write_bytes(b"x")
    with patch("musicweb.exclusive.optical_meta.read_metadata", return_value=_meta()):
        with patch("musicweb.exclusive.optical_meta.cover_bytes", return_value=None):
            with patch("musicweb.exclusive.optical_meta.local_lyrics", return_value=None):
                got = enrich_file(path)
    assert got.title == "Song"
    assert got.artist == "Artist"
    assert got.album == "Album"
    assert got.track == 3
    assert got.has_cover is False
    assert got.has_local_lyrics is False


def test_folder_cover_when_no_embed(tmp_path: Path):
    path = tmp_path / "song.mp3"
    path.write_bytes(b"x")
    (tmp_path / "cover.jpg").write_bytes(b"\xff\xd8fakejpeg")
    with patch(
        "musicweb.cover._extract_embedded", return_value=False
    ):
        data = cover_bytes(path)
    assert data == b"\xff\xd8fakejpeg"


def test_sidecar_lrc_wins_over_tags(tmp_path: Path):
    path = tmp_path / "song.mp3"
    path.write_bytes(b"x")
    (tmp_path / "song.lrc").write_text("[00:01.00]hello from sidecar\n", encoding="utf-8")
    with patch(
        "musicweb.lyrics.local.read_embedded_lyrics",
        return_value=LocalLyrics(
            plain_text="from tags",
            synced_lrc=None,
            source="local_tag",
            is_synced=False,
        ),
    ):
        found = local_lyrics(path)
    assert found is not None
    assert found.source == "local_lrc"
    assert found.synced_lrc is not None
    assert "sidecar" in found.synced_lrc


def test_bad_file_does_not_raise(tmp_path: Path):
    path = tmp_path / "broken.mp3"
    path.write_bytes(b"not audio")
    with patch("musicweb.exclusive.optical_meta.read_metadata", side_effect=RuntimeError("boom")):
        with patch("musicweb.exclusive.optical_meta.cover_bytes", side_effect=RuntimeError("boom")):
            with patch("musicweb.exclusive.optical_meta.local_lyrics", side_effect=RuntimeError("boom")):
                got = enrich_file(path)
    assert got.title is None
    assert got.has_cover is False


def test_apply_file_meta_keeps_walk_codec():
    item = CdromFile(name="a.mp3", rel="a.mp3", source_codec="mp3")
    apply_file_meta(
        item,
        FileMeta(
            title="T",
            artist="A",
            album="B",
            albumartist=None,
            track=1,
            disc=None,
            year=None,
            duration=1.0,
            sample_rate_hz=None,
            bit_depth=None,
            channels=None,
            source_codec="aac",
            has_cover=True,
            has_local_lyrics=False,
        ),
    )
    assert item.source_codec == "mp3"
    assert item.title == "T"
    assert item.has_cover is True
