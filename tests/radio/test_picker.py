"""Pure picker rules with in-memory snapshots and a seeded RNG."""

from pathlib import Path
from random import Random

from musicweb.db.va import VA_ARTIST_ID
from musicweb.radio.picker import pick_batch
from musicweb.radio.types import CatalogSnapshot, CatalogTrack


def _track(
    track_id: str,
    *,
    artist: str,
    album: str | None = None,
    album_artist: str | None = None,
    duration_ms: int = 180_000,
    path: str | None = None,
) -> CatalogTrack:
    return CatalogTrack(
        id=track_id,
        duration_ms=duration_ms,
        path=Path(path or f"/lib/{track_id}.flac"),
        album_id=album or f"alb-{artist}",
        album_artist_id=album_artist or artist,
        artist_id=artist,
    )


def _snapshot(tracks: list[CatalogTrack]) -> CatalogSnapshot:
    artists: dict[str, dict[str, list[CatalogTrack]]] = {}
    for track in tracks:
        albums = artists.setdefault(track.artist_id, {})
        albums.setdefault(track.album_id, []).append(track)
    return CatalogSnapshot(artists=artists)


def _ok(_path: Path) -> bool:
    return True


def test_full_batch_unique_one_per_performer():
    tracks = [_track(f"t{i}", artist=f"art-{i}") for i in range(12)]
    batch = pick_batch(_snapshot(tracks), [], set(), Random(1), _ok)
    assert len(batch) == 8
    ids = [t.id for t in batch]
    assert len(ids) == len(set(ids))
    assert len({t.artist_id for t in batch}) == 8
    assert all(t.duration_ms >= 30_000 for t in batch)


def test_same_track_not_twice_in_batch():
    tracks = [_track(f"t{i}", artist=f"art-{i}") for i in range(8)]
    batch = pick_batch(_snapshot(tracks), [], set(), Random(2), _ok)
    assert len({t.id for t in batch}) == 8


def test_banlist_len_ge_4_uses_last_batch_only():
    tracks = [_track(f"t{i:02d}", artist=f"art-{i}") for i in range(40)]
    snap = _snapshot(tracks)
    batches: list[list[str]] = []
    rng = Random(3)
    for _ in range(4):
        picked = pick_batch(snap, batches, set(), rng, _ok)
        assert len(picked) == 8
        batches.append([t.id for t in picked])

    fifth = pick_batch(snap, batches, set(), Random(4), _ok)
    last = set(batches[-1])
    older = set().union(*batches[:-1])
    fifth_ids = {t.id for t in fifth}
    assert fifth_ids.isdisjoint(last)
    assert fifth_ids & older or fifth_ids.isdisjoint(set().union(*batches))

    stale = batches + [["ghost"]]
    assert len(stale) == 5
    sixth = pick_batch(snap, stale, set(), Random(5), _ok)
    assert {t.id for t in sixth}.isdisjoint({"ghost"})


def test_single_performer_short_batch():
    tracks = [_track(f"a{i}", artist="only", album=f"alb-{i}") for i in range(8)]
    batch = pick_batch(_snapshot(tracks), [], set(), Random(6), _ok)
    assert len(batch) == 1
    assert batch[0].artist_id == "only"


def test_loosening_drops_banlist_then_shrinks():
    tracks = [
        _track("a1", artist="A", album="alb-A"),
        _track("a2", artist="A", album="alb-A"),
        _track("b1", artist="B", album="alb-B"),
        _track("c1", artist="C", album="alb-C"),
    ]
    banlist = [["b1", "c1", "a1"]]
    batch = pick_batch(_snapshot(tracks), banlist, set(), Random(7), _ok)
    ids = {t.id for t in batch}
    assert ids == {"a1", "b1", "c1"}
    assert len({t.artist_id for t in batch}) == 3


def test_five_eligible_shrinks_without_repeats():
    tracks = [_track(f"t{i}", artist=f"art-{i}") for i in range(5)]
    batch = pick_batch(_snapshot(tracks), [], set(), Random(8), _ok)
    assert len(batch) == 5
    assert len({t.id for t in batch}) == 5


def test_zero_eligible_returns_empty():
    assert pick_batch(_snapshot([]), [], set(), Random(9), _ok) == []


def test_probe_false_skips_id_and_fills_another():
    tracks = [_track(f"t{i}", artist=f"art-{i}") for i in range(9)]
    skip: set[str] = set()

    def probe(path: Path) -> bool:
        return path.name != "t0.flac"

    batch = pick_batch(_snapshot(tracks), [], skip, Random(10), probe)
    ids = {t.id for t in batch}
    assert "t0" not in ids
    assert "t0" in skip
    assert len(batch) == 8


def test_nirvana_studio_bans_nirvana_on_va():
    tracks = [
        _track("nirv-studio", artist="nirvana", album="nevermind"),
        _track(
            "nirv-va",
            artist="nirvana",
            album="grunge-box",
            album_artist=VA_ARTIST_ID,
        ),
        _track("pj", artist="pearl-jam", album="ten"),
        _track("soundgarden", artist="soundgarden", album="superunknown"),
    ]
    batch = pick_batch(_snapshot(tracks), [], set(), Random(11), _ok)
    nirvana = [t for t in batch if t.artist_id == "nirvana"]
    assert len(nirvana) == 1


def test_two_guests_on_same_va_album_both_eligible():
    tracks = [
        _track("bj", artist="bon-jovi", album="now-rock", album_artist=VA_ARTIST_ID),
        _track("ac", artist="alice", album="now-rock", album_artist=VA_ARTIST_ID),
    ]
    batch = pick_batch(_snapshot(tracks), [], set(), Random(12), _ok)
    assert {t.id for t in batch} == {"bj", "ac"}


def test_va_performer_tracks_are_not_artist_banned():
    tracks = [
        _track(f"va{i}", artist=VA_ARTIST_ID, album=f"comp-{i}") for i in range(5)
    ]
    batch = pick_batch(_snapshot(tracks), [], set(), Random(13), _ok)
    assert len(batch) == 5
    assert {t.artist_id for t in batch} == {VA_ARTIST_ID}
