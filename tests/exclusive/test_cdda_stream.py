"""Virtual WAV byte map — no drive required."""

from musicweb.exclusive.cdda_stream import (
    HEADER_BYTES,
    SECTOR_BYTES,
    CddaReader,
    MemorySectorSource,
    ParanoiaSource,
    content_length,
    range_to_sectors,
    track_extent,
    wav_header,
)


def test_content_length_75_sectors_is_one_second():
    # 75 sectors = 1.00 s of Red Book.
    assert content_length(75) == HEADER_BYTES + 75 * SECTOR_BYTES
    assert content_length(75) == 176444


def test_wav_header_riff_size():
    header = wav_header(75 * SECTOR_BYTES)
    assert len(header) == HEADER_BYTES
    assert header[:4] == b"RIFF"
    assert header[8:12] == b"WAVE"
    assert header[12:16] == b"fmt "
    assert header[36:40] == b"data"


def test_range_header_only():
    header_from, header_to, first_idx, last_idx, pcm_offset = range_to_sectors(
        0, 43, first_lsn=100, sector_count=75
    )
    assert (header_from, header_to) == (0, 44)
    assert first_idx > last_idx
    assert pcm_offset == 0


def test_range_one_sector_after_header():
    # bytes=44-2395 is exactly sector 0 (2352 bytes).
    header_from, header_to, first_idx, last_idx, pcm_offset = range_to_sectors(
        44, 2395, first_lsn=100, sector_count=75
    )
    assert header_to == 0
    assert first_idx == 0
    assert last_idx == 0
    assert pcm_offset == 0


def test_reader_header_range_returns_riff():
    source = MemorySectorSource()
    reader = CddaReader(first_lsn=10, sector_count=75, source=source)
    chunk = reader.read_span(0, 43)
    assert chunk == wav_header(75 * SECTOR_BYTES)
    assert source.reads == []


def test_reader_one_sector_range():
    source = MemorySectorSource()
    reader = CddaReader(first_lsn=10, sector_count=75, source=source)
    chunk = reader.read_span(44, 2395)
    assert len(chunk) == SECTOR_BYTES
    assert source.reads[0] == 10
    assert chunk == source._fill(10) if source._fill else chunk


def test_iter_span_matches_read_span_and_chunks():
    source = MemorySectorSource()
    reader = CddaReader(first_lsn=10, sector_count=75, source=source)
    start, end = 44, 44 + SECTOR_BYTES * 2 - 1
    joined = reader.read_span(start, end)
    pieces = list(reader.iter_span(start, end))
    assert b"".join(pieces) == joined
    assert len(pieces) >= 2


def test_track_extent_last_uses_leadout():
    assert track_extent(1, 2, [0, 7500], 15000, 1) == (0, 7500)
    assert track_extent(1, 2, [0, 7500], 15000, 2) == (7500, 7500)
    assert track_extent(1, 2, [0, 7500], 15000, 3) is None


def test_paranoia_sequential_prime_seeks_once():
    seeks: list[int] = []

    def seek(lsn: int) -> None:
        seeks.append(lsn)

    def read_limited(lsn: int) -> bytes:
        return bytes((lsn + i) % 256 for i in range(SECTOR_BYTES))

    source = ParanoiaSource.test_double(seek=seek, read_limited=read_limited)
    reader = CddaReader(first_lsn=100, sector_count=3, source=source)
    chunk = reader.read_span(44, 44 + SECTOR_BYTES * 3 - 1)
    assert len(chunk) == SECTOR_BYTES * 3
    assert seeks == [100]
