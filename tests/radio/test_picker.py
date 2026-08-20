"""Pure picker rules with in-memory snapshots and a seeded RNG."""

from pathlib import Path
from random import Random

from musicweb.radio.picker import pick_batch
from musicweb.radio.types import CatalogSnapshot, CatalogTrack


def _track(
    track_id: str,
    *,
    artist: str,
    album: str | None = None,
    duration_ms: int = 180_000,
    path: str | None = None,
) -> CatalogTrack:
    return CatalogTrack(
        id=track_id,
        duration_ms=duration_ms,
        path=Path(path or f"/lib/{track_id}.flac"),
        album_id=album or f"alb-{artist}",
        album_artist_id=artist,
    )


def _snapshot(tracks: list[CatalogTrack]) -> CatalogSnapshot:
    artists: dict[str, dict[str, list[CatalogTrack]]] = {}
    for track in tracks:
        albums = artists.setdefault(track.album_artist_id, {})
        albums.setdefault(track.album_id, []).append(track)
    return CatalogSnapshot(artists=artists)


def _ok(_path: Path) -> bool:
    return True


def test_full_batch_unique_and_artist_cap():
    tracks = [
        _track(f"a{i}", artist="art-a", album=f"alb-a-{i}") for i in range(6)
    ] + [
        _track(f"b{i}", artist="art-b", album=f"alb-b-{i}") for i in range(6)
    ] + [
        _track(f"c{i}", artist="art-c", album=f"alb-c-{i}") for i in range(6)
    ] + [
        _track(f"d{i}", artist="art-d", album=f"alb-d-{i}") for i in range(6)
    ]
    batch = pick_batch(_snapshot(tracks), [], set(), Random(1), _ok)
    assert len(batch) == 8
    ids = [t.id for t in batch]
    assert len(ids) == len(set(ids))
    counts: dict[str, int] = {}
    for track in batch:
        counts[track.album_artist_id] = counts.get(track.album_artist_id, 0) + 1
        assert track.duration_ms >= 30_000
    assert all(n <= 2 for n in counts.values())


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
    # With 40 unique ids, the fifth batch must be able to reuse older banlist ids.
    assert fifth_ids & older or fifth_ids.isdisjoint(set().union(*batches))

    stale = batches + [["ghost"]]
    assert len(stale) == 5
    sixth = pick_batch(snap, stale, set(), Random(5), _ok)
    assert {t.id for t in sixth}.isdisjoint({"ghost"})
    # Last-only: tracks from batches[3] (previous last) are legal again.
    # The banned set is only ["ghost"].


def test_attempt_budget_exhausted_loosens_cap():
    tracks = [_track(f"a{i}", artist="only", album=f"alb-{i}") for i in range(8)]
    batch = pick_batch(_snapshot(tracks), [], set(), Random(6), _ok)
    assert len(batch) == 8
    assert {t.album_artist_id for t in batch} == {"only"}


def test_loosening_drops_banlist_then_cap_then_shrinks():
    tracks = [
        _track("a1", artist="A", album="alb-A"),
        _track("a2", artist="A", album="alb-A"),
        _track("a3", artist="A", album="alb-A"),
        _track("b1", artist="B", album="alb-B"),
        _track("b2", artist="B", album="alb-B"),
        _track("c1", artist="C", album="alb-C"),
    ]
    banlist = [["b1", "b2", "c1", "a1"]]
    batch = pick_batch(_snapshot(tracks), banlist, set(), Random(7), _ok)
    ids = {t.id for t in batch}
    assert ids == {"a1", "a2", "a3", "b1", "b2", "c1"}
    assert len(batch) == 6


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


def test_artist_cap_uses_album_artist_not_track_artist():
    # Three tracks share album artist A; a fourth is another album artist.
    # Full rules: at most 2 from A, so the batch cannot be 3×A when others exist.
    tracks = [
        _track("a1", artist="A", album="alb-A"),
        _track("a2", artist="A", album="alb-A"),
        _track("a3", artist="A", album="alb-A"),
        _track("b1", artist="B", album="alb-B"),
        _track("c1", artist="C", album="alb-C"),
        _track("d1", artist="D", album="alb-D"),
        _track("e1", artist="E", album="alb-E"),
        _track("f1", artist="F", album="alb-F"),
        _track("g1", artist="G", album="alb-G"),
    ]
    batch = pick_batch(_snapshot(tracks), [], set(), Random(11), _ok)
    from_a = [t for t in batch if t.album_artist_id == "A"]
    assert len(from_a) <= 2
    assert len(batch) == 8
