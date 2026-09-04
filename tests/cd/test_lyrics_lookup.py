"""Yellow Book LRCLIB lookup does not write SQLite."""

from __future__ import annotations

from musicweb.lyrics.lookup import lookup_remote_lyrics, lyrics_result_dict
from musicweb.lyrics.types import LyricsResult
from musicweb.routes.cd import CdLyricsIn, post_cd_lyrics


class FakeClient:
    def __init__(self, result: LyricsResult) -> None:
        self.result = result
        self.calls = 0

    def get(self, query) -> LyricsResult:
        self.calls += 1
        self.last_query = query
        return self.result


def test_lookup_does_not_need_db():
    client = FakeClient(
        LyricsResult(
            ok=True,
            status="ok",
            source="lrclib",
            plain_text="hello",
            is_synced=False,
        )
    )
    got = lookup_remote_lyrics("Song", "Artist", "Album", 180_000, client=client)
    assert got.status == "ok"
    assert got.plain_text == "hello"
    assert client.calls == 1
    again = lookup_remote_lyrics("Song", "Artist", "Album", 180_000, client=client)
    assert again.plain_text == "hello"
    assert client.calls == 1


def test_route_not_found_is_200_shape():
    from unittest.mock import patch

    with patch(
        "musicweb.lyrics.lookup.LrclibClient",
        return_value=FakeClient(
            LyricsResult(ok=False, status="not_found", source="lrclib")
        ),
    ):
        # bypass in-process cache with unique tags
        out = post_cd_lyrics(
            CdLyricsIn(
                title="Missing Unique Song XYZ",
                artist="Nobody",
                album="Void",
                duration_ms=12_000,
            )
        )
    assert out["status"] == "not_found"
    assert out["plain_text"] is None
    assert "track_id" in out


def test_lyrics_result_dict_matches_track_shape():
    body = lyrics_result_dict(
        None,
        LyricsResult(ok=False, status="not_found", source="lrclib"),
    )
    assert set(body) >= {
        "track_id",
        "status",
        "source",
        "is_synced",
        "plain_text",
        "synced_lrc",
        "instrumental",
    }
