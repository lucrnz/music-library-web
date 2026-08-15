"""Same-folder lossless sibling skip for lossy indexing."""

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from musicweb.scan.siblings import (
    lossless_slots_in_dir,
    should_skip_lossy,
    slot_key,
)


def test_slot_key_uses_disc_or_one_and_track():
    assert slot_key(None, 3, "ignored") == ("num", 1, 3)
    assert slot_key(2, 3, "ignored") == ("num", 2, 3)


def test_slot_key_falls_back_to_casefolded_stem():
    assert slot_key(None, None, "Track One") == ("stem", "track one")
    assert slot_key(1, None, "A") == ("stem", "a")


def test_skip_when_track_numbers_match(tmp_path: Path):
    flac = tmp_path / "01 - Title.flac"
    mp3 = tmp_path / "01 - Title.mp3"
    flac.write_bytes(b"x")
    mp3.write_bytes(b"x")
    meta = SimpleNamespace(disc=None, track=1)

    def lossless(p: Path) -> bool:
        return p.suffix == ".flac"

    def read_meta(p: Path):
        return SimpleNamespace(disc=None, track=1)

    with (
        patch("musicweb.scan.siblings.is_lossless_audio", side_effect=lossless),
        patch("musicweb.scan.siblings.read_metadata", side_effect=read_meta),
    ):
        slots = lossless_slots_in_dir(tmp_path)
        assert should_skip_lossy(mp3, meta, slots) is True


def test_skip_when_only_stems_match(tmp_path: Path):
    flac = tmp_path / "Song.flac"
    mp3 = tmp_path / "song.mp3"
    flac.write_bytes(b"x")
    mp3.write_bytes(b"x")
    meta = SimpleNamespace(disc=None, track=None)

    with (
        patch(
            "musicweb.scan.siblings.is_lossless_audio",
            side_effect=lambda p: p.suffix == ".flac",
        ),
        patch(
            "musicweb.scan.siblings.read_metadata",
            side_effect=lambda p: SimpleNamespace(disc=None, track=None),
        ),
    ):
        slots = lossless_slots_in_dir(tmp_path)
        assert should_skip_lossy(mp3, meta, slots) is True


def test_do_not_skip_different_track_numbers(tmp_path: Path):
    flac = tmp_path / "01.flac"
    mp3 = tmp_path / "02.mp3"
    flac.write_bytes(b"x")
    mp3.write_bytes(b"x")

    def read_meta(p: Path):
        return SimpleNamespace(disc=None, track=1 if p.suffix == ".flac" else 2)

    with (
        patch(
            "musicweb.scan.siblings.is_lossless_audio",
            side_effect=lambda p: p.suffix == ".flac",
        ),
        patch("musicweb.scan.siblings.read_metadata", side_effect=read_meta),
    ):
        slots = lossless_slots_in_dir(tmp_path)
        assert should_skip_lossy(mp3, SimpleNamespace(disc=None, track=2), slots) is False


def test_do_not_skip_sibling_in_other_folder(tmp_path: Path):
    a = tmp_path / "a"
    b = tmp_path / "b"
    a.mkdir()
    b.mkdir()
    flac = a / "01.flac"
    mp3 = b / "01.mp3"
    flac.write_bytes(b"x")
    mp3.write_bytes(b"x")

    with (
        patch(
            "musicweb.scan.siblings.is_lossless_audio",
            side_effect=lambda p: p.suffix == ".flac",
        ),
        patch(
            "musicweb.scan.siblings.read_metadata",
            side_effect=lambda p: SimpleNamespace(disc=None, track=1),
        ),
    ):
        slots = lossless_slots_in_dir(b)
        assert should_skip_lossy(
            mp3, SimpleNamespace(disc=None, track=1), slots
        ) is False


def test_missing_disc_is_one(tmp_path: Path):
    flac = tmp_path / "01.flac"
    mp3 = tmp_path / "01.mp3"
    flac.write_bytes(b"x")
    mp3.write_bytes(b"x")

    with (
        patch(
            "musicweb.scan.siblings.is_lossless_audio",
            side_effect=lambda p: p.suffix == ".flac",
        ),
        patch(
            "musicweb.scan.siblings.read_metadata",
            side_effect=lambda p: SimpleNamespace(disc=None, track=1),
        ),
    ):
        slots = lossless_slots_in_dir(tmp_path)
        assert ("num", 1, 1) in slots
        assert should_skip_lossy(
            mp3, SimpleNamespace(disc=None, track=1), slots
        ) is True
